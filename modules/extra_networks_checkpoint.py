from modules import extra_networks, shared, sd_models
from modules.shared import opts, cmd_opts, restricted_opts
import re


class ExtraNetworkCheckpoint(extra_networks.ExtraNetwork):
    def __init__(self):
        super().__init__('checkpoint')

    def activate(self, p, params_list):

        selected = ''
        selected_name = ''
        selected_hash = ''
        for params in params_list:
            assert len(params.items) > 0

            selected = re.sub(r'^\s+|\s+$', '', params.items[0])
            selected_name = re.sub(r'\s*\[(.*)\]\s*$', '', selected)
            if selected != selected_name:
                selected_hash = re.search(r'\[(.*)\]\s*$', selected)[1]

        if selected == '':
            return

        if selected_name == '' and selected_hash == '':
            print(f"Could not find name or hash in \"{selected}\"")
            return

        chkpt_title = ''

        # start by looking for hash matches
        if selected_hash:
            for name, chkpt_info in sd_models.checkpoints_list.items():
                if chkpt_info.sha256 and chkpt_info.sha256.startswith(selected_hash):
                    chkpt_title = chkpt_info.title
                    break

        # failing that, name prefix matches
        if not chkpt_title and selected_name:
            for name, chkpt_info in sd_models.checkpoints_list.items():
                if chkpt_info.name_for_extra.startswith(selected):
                    chkpt_title = chkpt_info.title
                    break

        # failing that, we try the existing checkpoint matcher
        # it uses an aliases list plus substring matching
        if not chkpt_title and selected_name:
            ckpt_info = sd_models.get_closet_checkpoint_match(selected_name)
            if ckpt_info:
                chkpt_title = ckpt_info.title

        if not chkpt_title:
            print(f"Could not find match for {selected_name}" + (f" [{selected_hash}]" if selected_hash else ""))
            return

        old_chkpt = opts.data.get('sd_model_checkpoint', None)
        if old_chkpt != chkpt_title:
            print(f"Switching to {chkpt_title} from {old_chkpt}")
            opts.data['sd_model_checkpoint'] = chkpt_title
            try:
                sd_models.reload_model_weights()
                opts.save(shared.config_filename)
                shared.refresh_checkpoints()
            except:
                opts.data['sd_model_checkpoint'] = old_chkpt
                raise

    def deactivate(self, p):
        pass
