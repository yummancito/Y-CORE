@echo off
setlocal enableextensions enabledelayedexpansion
set "JAVA_HOME=C:\Users\User Unkown\Desktop\proyectos\Y-CORE\y-core-android\jdk17-install\jdk-17.0.10+7"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "ANDROID_SDK_ROOT=C:\Users\User Unkown\Desktop\proyectos\Y-CORE\y-core-android\android-sdk"
set "ANDROID_HOME=C:\Users\User Unkown\Desktop\proyectos\Y-CORE\y-core-android\android-sdk"
echo Java version:
"%JAVA_HOME%\bin\java" -version 2>&1
echo.
echo Installing SDK components...
"%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="%ANDROID_HOME%" platforms;android-35 build-tools;35.0.0
echo DONE
