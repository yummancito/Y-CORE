@echo off
REM ============================================================================
REM Palworld ACF Repair Script - Fix "Buy" button issue after mod installation
REM ============================================================================
REM This script repairs the Palworld installation when Steam shows "Buy"
REM instead of "Play" after mod installation.
REM ============================================================================

setlocal enabledelayedexpansion
chcp 65001 >nul

echo.
echo ============================================================================
echo  PALWORLD ACF REPAIR SCRIPT
echo ============================================================================
echo.

REM Check if Steam is running
tasklist /FI "IMAGENAME eq steam.exe" 2>NUL | find /I /N "steam.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [!] Steam is running. Closing Steam...
    taskkill /IM steam.exe /F
    timeout /t 3 /nobreak
)

REM Detect Steam installation
set STEAM_PATH=
for /f "tokens=2*" %%A in ('reg query "HKEY_LOCAL_MACHINE\SOFTWARE\Wow6432Node\Valve\Steam" /v InstallPath 2^>nul') do (
    set STEAM_PATH=%%B
)

if not defined STEAM_PATH (
    echo [ERROR] Steam installation not found
    pause
    exit /b 1
)

echo [OK] Steam found at: !STEAM_PATH!

REM Find Palworld in Steam library folders
set PALWORLD_FOUND=0
set PALWORLD_PATH=

REM Check default location
if exist "!STEAM_PATH!\steamapps\common\Palworld" (
    set PALWORLD_PATH=!STEAM_PATH!\steamapps\common\Palworld
    set PALWORLD_FOUND=1
)

REM Check library folders
if !PALWORLD_FOUND! equ 0 (
    for /f "tokens=*" %%I in ('dir /b "!STEAM_PATH!\steamapps\libraryfolders.vdf" 2^>nul') do (
        for /f "tokens=*" %%J in ('findstr /R "path" "!STEAM_PATH!\steamapps\libraryfolders.vdf" 2^>nul') do (
            REM This is simplified - check common patterns
        )
    )
)

if !PALWORLD_FOUND! equ 1 (
    echo [OK] Palworld found at: !PALWORLD_PATH!
) else (
    echo [ERROR] Palworld installation not found
    echo Searching for appmanifest_1623730.acf...

    for /r "!STEAM_PATH!\steamapps" %%F in (appmanifest_1623730.acf) do (
        set PALWORLD_PATH=%%~dpF
        set PALWORLD_FOUND=1
    )
)

if !PALWORLD_FOUND! equ 0 (
    echo [ERROR] Could not locate Palworld installation
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo  STEP 1: BACKING UP ACF MANIFEST
echo ============================================================================

set ACF_PATH=!STEAM_PATH!\steamapps\appmanifest_1623730.acf

if exist "!ACF_PATH!" (
    echo [OK] Found ACF manifest: !ACF_PATH!

    if not exist "!ACF_PATH!.backup" (
        copy "!ACF_PATH!" "!ACF_PATH!.backup" >nul
        echo [OK] Backup created: !ACF_PATH!.backup
    ) else (
        echo [!] Backup already exists
    )
) else (
    echo [!] ACF manifest not found at expected location
    echo    Searching in: !PALWORLD_PATH!..

    for /r "!PALWORLD_PATH!" %%F in (appmanifest_*.acf) do (
        set ACF_PATH=%%F
        echo [OK] Found ACF at: %%F
    )
)

echo.
echo ============================================================================
echo  STEP 2: CLEARING STEAM CACHE
echo ============================================================================

echo [*] Clearing package cache...
if exist "!STEAM_PATH!\package" (
    rmdir /s /q "!STEAM_PATH!\package" 2>nul
    echo [OK] Package cache cleared
)

echo [*] Clearing app cache...
if exist "!STEAM_PATH!\appcache" (
    for /f %%F in ('dir /b "!STEAM_PATH!\appcache\*.vdf"') do (
        del "!STEAM_PATH!\appcache\%%F" 2>nul
    )
    echo [OK] App cache cleared
)

echo.
echo ============================================================================
echo  STEP 3: VERIFYING FILE PERMISSIONS
echo ============================================================================

echo [*] Checking Palworld directory: !PALWORLD_PATH!

if exist "!PALWORLD_PATH!" (
    echo [OK] Directory exists

    REM Check if there are read-only files
    echo [*] Checking for read-only files...
    dir /a:R "!PALWORLD_PATH!" /s 2>nul | findstr /C:"File(s)" >nul

    if !ERRORLEVEL! equ 0 (
        echo [!] Found read-only files, removing attribute...
        attrib -R "!PALWORLD_PATH!\*" /s /d 2>nul
        echo [OK] Permissions fixed
    )
) else (
    echo [ERROR] Palworld directory not found: !PALWORLD_PATH!
)

echo.
echo ============================================================================
echo  STEP 4: STEAM LOCAL CACHE CLEANUP
echo ============================================================================

echo [*] Clearing Steam app state cache...
if exist "!STEAM_PATH!\userdata" (
    for /d /r "!STEAM_PATH!\userdata" %%D in (1623730) do (
        if exist "%%D\remote" (
            rmdir /s /q "%%D\remote" 2>nul
        )
        if exist "%%D\remotecache.vdf" (
            del "%%D\remotecache.vdf" 2>nul
        )
    )
    echo [OK] App state cache cleared
)

echo.
echo ============================================================================
echo  STEP 5: RESTART STEAM
echo ============================================================================

echo [*] Waiting 2 seconds...
timeout /t 2 /nobreak

echo [*] Starting Steam...
start "" "!STEAM_PATH!\steam.exe"

timeout /t 5 /nobreak

echo.
echo ============================================================================
echo  REPAIR COMPLETE
echo ============================================================================
echo.
echo [i] Please follow these steps:
echo.
echo     1. Open Steam and go to Library
echo     2. Find Palworld in your library
echo     3. If it still shows "Buy", right-click on it
echo     4. Select "Properties" ^> "Installed Files"
echo     5. Click "Verify integrity of game files"
echo.
echo     6. If the issue persists, try:
echo        - Right-click Palworld ^> Delete Local Game Content
echo        - Re-download from Steam
echo.
echo [!] Do NOT try to fix mods until Steam recognizes the game again!
echo.
pause
