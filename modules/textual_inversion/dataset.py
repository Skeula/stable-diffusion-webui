import os
import numpy as np
import PIL
import torch
from PIL import Image
from torch.utils.data import Dataset, DataLoader, Sampler
from torchvision import transforms
from collections import defaultdict

import random
import tqdm
from modules import devices, shared
import re

from ldm.modules.distributions.distributions import DiagonalGaussianDistribution

re_numbers_at_start = re.compile(r"^[-\d]+\s*")


class DatasetEntry:
    def __init__(self, filename=None, filename_text=None, latent_dist=None, latent_sample=None, cond=None, cond_text=None, pixel_values=None, weight=None):
        self.filename = filename
        self.filename_text = filename_text
        self.weight = weight
        self.latent_dist = latent_dist
        self.latent_sample = latent_sample
        self.cond = cond
        self.cond_text = cond_text
        self.pixel_values = pixel_values


class PersonalizedBase(Dataset):
    def __init__(self, data_root, width, height, repeats, flip_p=0.5, placeholder_token="*", model=None, cond_model=None, device=None, template_file=None, include_cond=False, batch_size=1, gradient_step=1, shuffle_tags=False, tag_drop_out=0, latent_sampling_method='once', varsize=False, use_weight=False):
        re_word = re.compile(shared.opts.dataset_filename_word_regex) if len(shared.opts.dataset_filename_word_regex) > 0 else None

        self.placeholder_token = placeholder_token

        self.flip = transforms.RandomHorizontalFlip(p=flip_p)

        self.dataset = []

        with open(template_file, "r") as file:
            lines = [x.strip() for x in file.readlines()]

        self.lines = lines

        assert data_root, 'dataset directory not specified'
        assert os.path.isdir(data_root), "Dataset directory doesn't exist"
        assert os.listdir(data_root), "Dataset directory is empty"

        self.image_paths = [os.path.join(data_root, file_path) for file_path in os.listdir(data_root)]

        self.shuffle_tags = shuffle_tags
        self.tag_drop_out = tag_drop_out
        groups = defaultdict(list)

        print("Preparing dataset...")
        for path in tqdm.tqdm(self.image_paths):
            alpha_channel = None
            if shared.state.interrupted:
                raise Exception("interrupted")
            try:
                image = Image.open(path)
                #Currently does not work for single color transparency
                #We would need to read image.info['transparency'] for that
                if use_weight and 'A' in image.getbands():
                    alpha_channel = image.getchannel('A')
                image = image.convert('RGB')
                if not varsize:
                    image = image.resize((width, height), PIL.Image.BICUBIC)
            except Exception:
                continue

            text_filename = os.path.splitext(path)[0] + ".txt"
            filename = os.path.basename(path)

            if os.path.exists(text_filename):
                with open(text_filename, "r", encoding="utf8") as file:
                    filename_text = file.read()
            else:
                filename_text = os.path.splitext(filename)[0]
                filename_text = re.sub(re_numbers_at_start, '', filename_text)
                if re_word:
                    tokens = re_word.findall(filename_text)
                    filename_text = (shared.opts.dataset_filename_join_string or "").join(tokens)

            npimage = np.array(image).astype(np.uint8)
            npimage = (npimage / 127.5 - 1.0).astype(np.float32)

            torchdata = torch.from_numpy(npimage).permute(2, 0, 1).to(device=device, dtype=torch.float32)
            latent_sample = None

            with devices.autocast():
                latent_dist = model.encode_first_stage(torchdata.unsqueeze(dim=0))

            #Perform latent sampling, even for random sampling.
            #We need the sample dimensions for the weights
            if latent_sampling_method == "deterministic":
                if isinstance(latent_dist, DiagonalGaussianDistribution):
                    # Works only for DiagonalGaussianDistribution
                    latent_dist.std = 0
                else:
                    latent_sampling_method = "once"
            latent_sample = model.get_first_stage_encoding(latent_dist).squeeze().to(devices.cpu)

            if use_weight and alpha_channel is not None:
                channels, *latent_size = latent_sample.shape
                weight_img = alpha_channel.resize(latent_size)
                npweight = np.array(weight_img).astype(np.float32)
                #Repeat for every channel in the latent sample
                weight = torch.tensor([npweight] * channels).reshape([channels] + latent_size)
                #Normalize the weight to a minimum of 0 and a mean of 1, that way the loss will be comparable to default.
                weight -= weight.min()
                weight /= weight.mean()
            elif use_weight:
                #If an image does not have a alpha channel, add a ones weight map anyway so we can stack it later
                weight = torch.ones(latent_sample.shape)
            else:
                weight = None
            
            if latent_sampling_method == "random":
                entry = DatasetEntry(filename=path, filename_text=filename_text, latent_dist=latent_dist, weight=weight)
            else:
                entry = DatasetEntry(filename=path, filename_text=filename_text, latent_sample=latent_sample, weight=weight)

            if not (self.tag_drop_out != 0 or self.shuffle_tags):
                entry.cond_text = self.create_text(filename_text)

            if include_cond and not (self.tag_drop_out != 0 or self.shuffle_tags):
                with devices.autocast():
                    entry.cond = cond_model([entry.cond_text]).to(devices.cpu).squeeze(0)
            groups[image.size].append(len(self.dataset))
            self.dataset.append(entry)
            del torchdata
            del latent_dist
            del latent_sample
            del weight

        self.length = len(self.dataset)
        self.groups = list(groups.values())
        assert self.length > 0, "No images have been found in the dataset."
        self.batch_size = min(batch_size, self.length)
        self.gradient_step = min(gradient_step, self.length // self.batch_size)
        self.latent_sampling_method = latent_sampling_method

        if len(groups) > 1:
            print("Buckets:")
            for (w, h), ids in sorted(groups.items(), key=lambda x: x[0]):
                print(f"  {w}x{h}: {len(ids)}")
            print()

    def create_text(self, filename_text):
        text = random.choice(self.lines)
        tags = filename_text.split(',')
        if self.tag_drop_out != 0:
            tags = [t for t in tags if random.random() > self.tag_drop_out]
        if self.shuffle_tags:
            random.shuffle(tags)
        text = text.replace("[filewords]", ','.join(tags))
        text = text.replace("[name]", self.placeholder_token)
        return text

    def __len__(self):
        return self.length

    def __getitem__(self, i):
        entry = self.dataset[i]
        if self.tag_drop_out != 0 or self.shuffle_tags:
            entry.cond_text = self.create_text(entry.filename_text)
        if self.latent_sampling_method == "random":
            entry.latent_sample = shared.sd_model.get_first_stage_encoding(entry.latent_dist).to(devices.cpu)
        return entry


def greedy_pack(tails, b):
    '''inefficient suboptimal packing of remainders from each bucket'''
    by_len = defaultdict(list)
    for t in tails:
        by_len[len(t)].append(t)
    n = sum(len(t) for t in tails) // b
    superbatches = []
    for _ in range(n):
        to_pick = b
        superbatch = []
        while to_pick:
            for k, v in sorted(by_len.items(), reverse=True):
                # try pick longest
                if k <= to_pick:
                    to_pick -= k
                    superbatch.append(v.pop())
                    if not v:
                        del(by_len[k])
                    break
            else:
                # can't find any so split a group
                maxlen = max(by_len)
                tail = by_len[maxlen].pop()
                if not by_len[maxlen]:
                    del by_len[maxlen]
                superbatch.append(tail[:to_pick])
                by_len[len(tail[to_pick:])].append(tail[to_pick:])
                to_pick = 0
        superbatches.append(superbatch)
    return superbatches

class VariableBatchSampler(Sampler):
    def __init__(self, data_source: PersonalizedBase, batch_size: int):
        self.n = len(data_source)
        self.groups = data_source.groups
        self.batch_size = batch_size
    
    def __iter__(self):
        b = self.batch_size
        dropped = set(random.sample(range(self.n), self.n % b))
        groups = [[x for x in g if x not in dropped] for g in self.groups]
        for g in groups:
            random.shuffle(g)
        superbatches = []
        for g in groups:
            superbatches.extend([g[i*b:(i+1)*b]] for i in range(len(g) // b))
        tails = [g[-(len(g) % b):] for g in groups if len(g) % b != 0]
        random.shuffle(tails)
        superbatches.extend(greedy_pack(tails, b))
        random.shuffle(superbatches)
        yield from [batch for superbatch in superbatches for batch in superbatch]

def group_batches(batches, batch_size):
    m, superbatch = 0, []
    for batch in batches:
        superbatch.append(batch)
        m += len(batch)
        assert m <= batch_size
        if m == batch_size:
            yield superbatch
            m, superbatch = 0, []


class PersonalizedDataLoader(DataLoader):
    def __init__(self, dataset, latent_sampling_method="once", batch_size=1, pin_memory=False):
        super(PersonalizedDataLoader, self).__init__(dataset, batch_sampler=VariableBatchSampler(dataset, batch_size), pin_memory=pin_memory)
        if latent_sampling_method == "random":
            self.collate_fn = collate_wrapper_random
        else:
            self.collate_fn = collate_wrapper


class BatchLoader:
    def __init__(self, data):
        self.cond_text = [entry.cond_text for entry in data]
        self.cond = [entry.cond for entry in data]
        self.latent_sample = torch.stack([entry.latent_sample for entry in data]).squeeze(1)
        if all(entry.weight is not None for entry in data):
            self.weight = torch.stack([entry.weight for entry in data]).squeeze(1)
        else:
            self.weight = None
        #self.emb_index = [entry.emb_index for entry in data]
        #print(self.latent_sample.device)
    
    def __len__(self):
        return len(self.cond)

    def pin_memory(self):
        self.latent_sample = self.latent_sample.pin_memory()
        return self

def collate_wrapper(batch):
    return BatchLoader(batch)

class BatchLoaderRandom(BatchLoader):
    def __init__(self, data):
        super().__init__(data)

    def pin_memory(self):
        return self

def collate_wrapper_random(batch):
    return BatchLoaderRandom(batch)