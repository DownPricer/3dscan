@echo off
setlocal

if "%~1"=="" goto :usage
if "%~2"=="" goto :usage

set "INPUT_PATH=%~1"
set "OUTPUT_DIR=%~2"
set "SCRIPT_DIR=%~dp0"

if not exist "%INPUT_PATH%" (
  echo [pc_processor] Input not found: %INPUT_PATH%
  exit /b 2
)

if not exist "%OUTPUT_DIR%" (
  mkdir "%OUTPUT_DIR%"
)

if not exist "%OUTPUT_DIR%\preview" mkdir "%OUTPUT_DIR%\preview"
if not exist "%OUTPUT_DIR%\extracted" mkdir "%OUTPUT_DIR%\extracted"
if not exist "%OUTPUT_DIR%\logs" mkdir "%OUTPUT_DIR%\logs"

echo [pc_processor] Input  : %INPUT_PATH%
echo [pc_processor] Output : %OUTPUT_DIR%

if exist "%SystemRoot%\py.exe" (
  py -3 "%SCRIPT_DIR%tools\run_pc_processing.py" "%INPUT_PATH%" "%OUTPUT_DIR%"
  exit /b %errorlevel%
)

python "%SCRIPT_DIR%tools\run_pc_processing.py" "%INPUT_PATH%" "%OUTPUT_DIR%"
exit /b %errorlevel%

:usage
echo Usage: run_pc_processing.bat ^<dataset-folder-or-zip^> ^<output-dir^>
exit /b 1
