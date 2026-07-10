@echo off
setlocal enabledelayedexpansion

set VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat
set CMAKE=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe
set SRC=c:\Users\mitch\Desktop\y-core-backup\native\ycore-online
set BUILD=c:\Users\mitch\Desktop\y-core-backup\native\build

echo === Building x64 ===
call "%VCVARS%" x64
"%CMAKE%" -S "%SRC%" -B "%BUILD%\x64" -A x64 2>&1
"%CMAKE%" --build "%BUILD%\x64" --config Release --target ycore_steam_api64 2>&1
if %ERRORLEVEL% neq 0 (
    echo BUILD FAILED x64
    exit /b 1
)
echo === x64 BUILD OK ===

echo === Building x86 ===
call "%VCVARS%" x86
"%CMAKE%" -S "%SRC%" -B "%BUILD%\x86" -A Win32 2>&1
"%CMAKE%" --build "%BUILD%\x86" --config Release --target ycore_steam_api32 2>&1
if %ERRORLEVEL% neq 0 (
    echo BUILD FAILED x86
    exit /b 1
)
echo === x86 BUILD OK ===

echo === Copying DLLs ===
copy "%BUILD%\x64\Release\ycore_steam_api64.dll" "c:\Users\mitch\Desktop\y-core-backup\resources\native\" >nul 2>&1
copy "%BUILD%\x86\Release\ycore_steam_api.dll" "c:\Users\mitch\Desktop\y-core-backup\resources\native\" >nul 2>&1
echo === DONE ===
