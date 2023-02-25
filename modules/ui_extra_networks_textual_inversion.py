import json
import os

from modules import ui_extra_networks, sd_hijack, shared


class ExtraNetworksPageTextualInversion(ui_extra_networks.ExtraNetworksPage):
    def __init__(self):
        super().__init__('Textual Inversion')
        self.allow_negative_prompt = True

    def refresh(self):
        sd_hijack.model_hijack.embedding_db.load_textual_inversion_embeddings(force_reload=True)

    def list_items(self):
        for embedding in sd_hijack.model_hijack.embedding_db.word_embeddings.values():
            prompt = embedding.name
            path, ext = os.path.splitext(embedding.filename)
            if path.endswith('-neg'):
                if os.path.isfile(path.replace('-neg','')+ext):
                    # ignore negative embeddings if we have a paired positive
                    continue
                else:
                    # add it, but only to make changes to the negative prompt
                    prompt = ['', prompt]
            # if we have a paired negative embdding, we include both
            elif os.path.isfile(path + '-neg' + ext):
                prompt = [prompt, prompt + '-neg']
            # cleanup embeddings go in a special folder and are always negative
            elif '🧹' in path:
                prompt = ['', prompt]

            yield {
                "name": embedding.name,
                "filename": embedding.filename,
                "preview": self.find_preview(path),
                "description": self.find_description(path),
                "search_term": self.search_terms_from_path(embedding.filename),
                "prompt": json.dumps(prompt),
                "local_preview": f"{path}.preview.{shared.opts.samples_format}",

            }

    def allowed_directories_for_previews(self):
        return list(sd_hijack.model_hijack.embedding_db.embedding_dirs)
