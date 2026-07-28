@echo off
setlocal enableextensions enabledelayedexpansion

echo ========================================
echo  Y-Core Android - Build Script
echo ========================================
echo.

set "PROJECT_DIR=C:\Users\User Unkown\Desktop\proyectos\Y-CORE\y-core-android"
set "JAVA_HOME=%PROJECT_DIR%\jdk17-install\jdk-17.0.10+7"
set "ANDROID_SDK_ROOT=%PROJECT_DIR%\android-sdk"
set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
set "PATH=%JAVA_HOME%\bin;%PATH%"

:: Step 1: Verify Java
echo [1/4] Verifying Java...
"%JAVA_HOME%\bin\java" -version 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Java 17 not found at %JAVA_HOME%
    exit /b 1
)
echo OK - Java 17 is ready
echo.

:: Step 2: Install Android SDK platform
echo [2/4] Installing Android SDK platform 35 and build-tools...
"%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="%ANDROID_SDK_ROOT%" "platforms;android-35" "build-tools;35.0.0"
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: SDK installation may have issues. Check output above.
)
echo.

:: Step 3: Accept licenses
echo [3/4] Accepting licenses...
"%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="%ANDROID_SDK_ROOT%" --licenses
echo.

:: Step 4: Build
echo [4/4] Building APK...
cd /d "%PROJECT_DIR%"
call gradlew.bat assembleDebug --no-daemon
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo  BUILD SUCCESSFUL!
    echo  APK: app\build\outputs\apk\debug\app-debug.apk
    echo ========================================
) else (
    echo.
    echo ========================================
    echo  BUILD FAILED. Check the output above.
    echo ========================================
)

pause
