@echo off

rem Config values we *have* to have defaults for
set CONDA_ENV=StableDiffusion
set VENV_DIR=-
set CUDA_HOME=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.7

if exist sd-config.bat (
	CALL sd-config.bat
)

rem *** HANDLE ARGUMENTS ***

if "%1"=="low" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --lowvram
) else ( if "%1" == "medium" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --medvram
) else ( if "%1" == "high" (
	rem Just defaults
) else (
	echo sd [low/medium/high]
	exit /b 1
)))


rem *** CONVERT CONFIG ENVS INTO A SINGLE COMMANDLINE_ARGS VAR ***

if "%REINSTALL_TORCH%"=="1" (
	set COMMANDLINE_ARGS=--reinstall-torch %COMMANDLINE_ARGS%
)
if "%ALLOW_EXTENSION_SYMLINKS%"=="1" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --enable-insecure-extension-access 
)
if "%CHANNELS_LAST%"=="1" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --opt-channelslast
)
if "%XFORMERS%"=="1" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --xformers
)
if "%ALLOW_CODE%"=="1" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --allow-code
)
if "%LOCAL_NET_ACCESS%"=="1" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --listen
)
if "%API%"=="1" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --api
)
if not "%CORS_ALLOW_ORIGINS%"=="" (
	set COMMANDLINE_ARGS=%COMMANDLINE_ARGS% --cors-allow-origins %CORS_ALLOW_ORIGINS%
)

rem *** EXECUTION ***

rem if conda env doesn't exist, create
conda info -e | findstr /B /C:"%CONDA_ENV% "  >Nul || (
	conda create -n %CONDA_ENV%
)

if "%REDO_REQS%"=="1" (
	echo -----> Reinstalling requirements
	conda run -n %CONDA_ENV% --live-stream python -mpip install -r requirements.txt
)

echo -----> Starting webui launcher
echo -----> conda run -n %CONDA_ENV% --live-stream python launch.py %COMMANDLINE_ARGS%
conda run -n %CONDA_ENV% --live-stream python launch.py %COMMANDLINE_ARGS%
