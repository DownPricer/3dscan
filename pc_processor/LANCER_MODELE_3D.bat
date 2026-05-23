@echo off
chcp 65001 >nul
setlocal
title Site Ready Scan Processor — lancement facile

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo.
echo  ============================================
echo   MODELE 3D POUR LE SITE — lancement facile
echo  ============================================
echo.
echo  Dans la fenetre qui s'ouvre :
echo    1) Cliquez sur le GROS BOUTON VERT
echo       « TRAITER MON ZIP - modele 3D pour le site »
echo    2) Choisissez votre fichier .zip
echo    3) Attendez la fin (suivi en temps reel)
echo.
echo  NE PAS utiliser « Valider le dataset » (pas de GLB).
echo.

if exist "%SystemRoot%\py.exe" (
  py -3 gui\scan_processor_gui.py
  goto :done
)

where python >nul 2>&1
if %errorlevel%==0 (
  python gui\scan_processor_gui.py
  goto :done
)

echo ERREUR : Python 3 introuvable.
echo Installez Python depuis https://www.python.org/downloads/
pause
exit /b 1

:done
if not "%errorlevel%"=="0" pause
exit /b %errorlevel%
