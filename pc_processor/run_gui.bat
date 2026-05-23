@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo [pc_processor] Lancement de l'interface Windows...
echo.

if exist "%SystemRoot%\py.exe" (
  py -3 gui\scan_processor_gui.py
  set "EXIT_CODE=%errorlevel%"
  if not "%EXIT_CODE%"=="0" (
    echo.
    echo [pc_processor] L'interface s'est terminee avec le code %EXIT_CODE%.
    pause
  )
  exit /b %EXIT_CODE%
)

where python >nul 2>&1
if %errorlevel%==0 (
  python gui\scan_processor_gui.py
  set "EXIT_CODE=%errorlevel%"
  if not "%EXIT_CODE%"=="0" (
    echo.
    echo [pc_processor] L'interface s'est terminee avec le code %EXIT_CODE%.
    pause
  )
  exit /b %EXIT_CODE%
)

echo [pc_processor] ERREUR : Python 3 introuvable.
echo.
echo Installez Python 3 depuis https://www.python.org/downloads/
echo puis relancez ce fichier.
echo.
pause
exit /b 1
