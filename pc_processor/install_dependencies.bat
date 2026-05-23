@echo off
cd /d "%~dp0"
echo Installation des dependances PC processor (mesh + export GLB site)...
echo.
py -3 -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Echec installation. Verifiez que Python 3 est installe : py -3 --version
  pause
  exit /b 1
)
echo.
echo OK. Relancez run_gui.bat et cochez "Generer fichier pour le site".
pause
