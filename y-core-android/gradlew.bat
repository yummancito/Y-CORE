@rem Y-Core Android Gradle wrapper for Windows
@echo off
set DIRNAME=%~dp0
if "%JAVA_HOME%"=="" (
  echo ERROR: JAVA_HOME is not set. Please install JDK 17+ and set JAVA_HOME.
  exit /b 1
)
"%JAVA_HOME%\bin\java" -Dorg.gradle.appname=y-core-android -classpath "%DIRNAME%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
