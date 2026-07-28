@echo off
title Y-core — Agregar exclusión de Windows Defender
chcp 65001 >nul

echo =======================================================
echo   Y-core — Asistente de exclusión de Windows Defender
echo =======================================================
echo.
echo Windows Defender puede marcar los DLL de Y-core como
echo falsos positivos porque usan tecnicas de gancho
echo (DLL hook) necesarias para integrarse con Steam.
echo.
echo Este script agrega una exclusion para la carpeta:
echo   %%LOCALAPPDATA%%\Y-core
echo y la carpeta de instalacion actual.
echo.
echo Esto SOLO afecta a los archivos de Y-core, no a
echo otras carpetas del sistema.
echo.
echo Presiona ENTER para continuar o cierra esta ventana
echo para cancelar.
echo.
pause >nul

:: Solicitar elevation (Admin rights are needed for Defender exclusions)
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Se requieren permisos de administrador.
    echo     Haz clic en "SI" en la ventana de UAC.
    echo.
    :: Self-elevate
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo [1/3] Detectando rutas de Y-core...
set "YUSERDATA=%LOCALAPPDATA%\Y-core"
set "YINSTALL=%~dp0.."

for %%i in ("%YINSTALL%") do set "YINSTALL=%%~fi"

echo   - Datos de usuario: %YUSERDATA%
echo   - Instalacion:      %YINSTALL%
echo.

echo [2/3] Agregando exclusiones a Windows Defender...
echo.

:: Add exclusion for user data directory
powershell -Command "Add-MpPreference -ExclusionPath '%YUSERDATA%' -ErrorAction SilentlyContinue"
if %ERRORLEVEL% neq 0 (
    echo [!] No se pudo agregar exclusion para %YUSERDATA%
) else (
    echo [OK] Exclusion agregada: %YUSERDATA%
)

:: Add exclusion for install directory
powershell -Command "Add-MpPreference -ExclusionPath '%YINSTALL%' -ErrorAction SilentlyContinue"
if %ERRORLEVEL% neq 0 (
    echo [!] No se pudo agregar exclusion para %YINSTALL%
) else (
    echo [OK] Exclusion agregada: %YINSTALL%
)

:: Add exclusion for native DLLs directory (resources/native)
set "NATIVEDIR=%YINSTALL%\resources\native"
powershell -Command "Add-MpPreference -ExclusionPath '%NATIVEDIR%' -ErrorAction SilentlyContinue"
if %ERRORLEVEL% neq 0 (
    echo [!] No se pudo agregar exclusion para %NATIVEDIR%
) else (
    echo [OK] Exclusion agregada: %NATIVEDIR%
)

:: Add exclusion for Electron DLLs directory
set "DLLDIR=%YINSTALL%\electron\dll"
powershell -Command "Add-MpPreference -ExclusionPath '%DLLDIR%' -ErrorAction SilentlyContinue"
if %ERRORLEVEL% neq 0 (
    echo [!] No se pudo agregar exclusion para %DLLDIR%
) else (
    echo [OK] Exclusion agregada: %DLLDIR%
)

:: Also add exclusion for koffi - this is the FFI library that loads native DLLs
set "KOFFIDIR=%YINSTALL%\node_modules\koffi"
if exist "%KOFFIDIR%" (
    powershell -Command "Add-MpPreference -ExclusionPath '%KOFFIDIR%' -ErrorAction SilentlyContinue"
    if %ERRORLEVEL% neq 0 (
        echo [!] No se pudo agregar exclusion para koffi
    ) else (
        echo [OK] Exclusion agregada: koffi
    )
)

echo.
echo [3/3] Verificando exclusiones activas...
echo.
echo Exclusiones actuales de Windows Defender:
powershell -Command "Get-MpPreference | Select-Object -ExpandProperty ExclusionPath" 2>nul
echo.
echo =======================================================
echo   PROCESO COMPLETADO
echo =======================================================
echo.
echo Las exclusiones se han agregado correctamente.
echo Windows Defender ya no deberia bloquear los DLL de Y-core.
echo.
echo Si los DLL ya fueron eliminados por Defender:
echo   1. Abre Windows Security ^> Virus ^& threat protection
echo   2. Ve a "Protection history" (Historial de proteccion)
echo   3. Busca las alertas de Y-core y haz clic en
echo      "Restore" (Restaurar) o "Allow on device"
echo.
echo Despues de restaurar los archivos, reinicia Y-core.
echo.
pause
