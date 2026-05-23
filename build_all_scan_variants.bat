@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
set SCANNER=%ROOT%scanner
set OUT=%ROOT%build-output\variants
set GRADLE=%SCANNER%\gradlew.bat

if not exist "%GRADLE%" (
  echo ERROR: gradlew.bat introuvable dans %SCANNER%
  exit /b 1
)

mkdir "%OUT%" 2>nul

if not exist "X:\scanner\app\src\main\jni\Android.mk" (
  subst X: "%ROOT%" 2>nul
)

if exist "%LOCALAPPDATA%\Temp\jdk17-adoptium\jdk-17.0.19+10\bin\java.exe" (
  set "JAVA_HOME=%LOCALAPPDATA%\Temp\jdk17-adoptium\jdk-17.0.19+10"
) else if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" (
  set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
) else if exist "C:\Program Files\JetBrains\PyCharm 2023.1\jbr\bin\java.exe" (
  set "JAVA_HOME=C:\Program Files\JetBrains\PyCharm 2023.1\jbr"
)

if exist "X:\scanner\gradlew.bat" (
  pushd X:\scanner
) else (
  pushd "%SCANNER%"
)

call "%GRADLE%" --no-daemon assembleBaseDebug assembleBasepcDebug assembleFastDebug assembleStableDebug assemblePhotoDebug
set BUILD_EXIT=%ERRORLEVEL%

popd

if not "%BUILD_EXIT%"=="0" (
  echo.
  echo ECHEC compilation. Code=%BUILD_EXIT%
  exit /b %BUILD_EXIT%
)

if exist "X:\scanner\app\build\outputs\apk\base\debug\app-base-debug.apk" (
  set APK_DIR=X:\scanner\app\build\outputs\apk
) else (
  set APK_DIR=%SCANNER%\app\build\outputs\apk
)
copy /Y "%APK_DIR%\base\debug\app-base-debug.apk" "%OUT%\3DScan-BASE-debug.apk" >nul
copy /Y "%APK_DIR%\basepc\debug\app-basepc-debug.apk" "%OUT%\3DScan-BASE-PC-debug.apk" >nul
copy /Y "%APK_DIR%\fast\debug\app-fast-debug.apk" "%OUT%\3DScan-FAST-debug.apk" >nul
copy /Y "%APK_DIR%\stable\debug\app-stable-debug.apk" "%OUT%\3DScan-STABLE-debug.apk" >nul
copy /Y "%APK_DIR%\photo\debug\app-photo-debug.apk" "%OUT%\3DScan-PHOTO-debug.apk" >nul

echo.
echo APK generees dans %OUT%:
dir /B "%OUT%\3DScan-*.apk"

endlocal
exit /b 0
