@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%..\.."
set "SOURCE_DIR=%REPO_ROOT%\dataset_extractor"
set "BUILD_DIR=%SCRIPT_DIR%build\dataset_extractor"

where cmake >nul 2>nul
if errorlevel 1 (
  echo [pc_processor/native] cmake not found in PATH.
  exit /b 1
)

if not exist "%SOURCE_DIR%\CMakeLists.txt" (
  echo [pc_processor/native] dataset_extractor source not found: %SOURCE_DIR%
  exit /b 1
)

echo [pc_processor/native] Preparing Windows build for dataset_extractor
echo [pc_processor/native] Source: %SOURCE_DIR%
echo [pc_processor/native] Build : %BUILD_DIR%
echo [pc_processor/native] Note  : OpenCV, libpng and turbojpeg must be available for configuration to succeed.

cmake -S "%SOURCE_DIR%" -B "%BUILD_DIR%"
if errorlevel 1 (
  echo [pc_processor/native] CMake configure failed.
  echo [pc_processor/native] Verify OpenCV, libpng and turbojpeg availability on Windows.
  exit /b 1
)

cmake --build "%BUILD_DIR%" --config Release
exit /b %errorlevel%
