@echo off

rem *** Force requirements reinstalls

set REDO_REQS=0
set REINSTALL_TORCH=0


rem *** Config ***

rem This is the bucket Conda puts your deps in.
set CONDA_ENV=StableDiffusion

rem Remove restrictions on things that only make sense for public instances:
set ALLOW_EXTENSION_SYMLINKS=1
set ALLOW_CODE=1
set LOCAL_NET_ACCESS=1

rem If you can install it, it makes things faster
set XFORMERS=1

rem This is (according to the huggingface docs) a substantial perf improvement (2.88x)
set CHANNELS_LAST=1

rem the API is used by a number of extensions and the like
set API=1

rem This allows the regular webui to talk to its own apis
rem Comma seperated, add further origins for extensions that request them
set CORS_ALLOW_ORIGINS=http://localhost:7860,https://www.painthua.com

rem Reduce vram consumption, hopefully
set PYTORCH_CUDA_ALLOC_CONF=garbage_collection_threshold:0.6,max_split_size_mb:128

rem Any other args you want you can just add directly
set COMMANDLINE_ARGS=--disable-nan-check
