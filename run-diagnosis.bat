@echo off
REM ============================================================================
REM Y-CORE Remote PC Diagnostic Runner
REM ============================================================================
REM Ejecutar como: cmd /c run-diagnosis.bat
REM O directamente: run-diagnosis.bat
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════════════════════════╗
echo ║         Y-CORE REMOTE PC DIAGNOSTIC                                       ║
echo ║         Analizando Steam + Y-core en esta PC                              ║
echo ╚════════════════════════════════════════════════════════════════════════════╝
echo.

REM Detectar PowerShell
powershell -NoProfile -Version 5.0 -Command "Write-Host 'PowerShell OK'" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ✗ ERROR: PowerShell no encontrado o no funciona
    echo   Este script requiere PowerShell 5.0+
    pause
    exit /b 1
)

REM Crear script temporal
set "SCRIPT=%TEMP%\ycore-diagnosis-%RANDOM%.ps1"
set "OUTPUT=%TEMP%\ycore-diagnosis-result.txt"

echo Descargando script de diagnóstico...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/yummancito/Y-CORE/main/diagnose-remote-pc.ps1' -OutFile '%SCRIPT%' -ErrorAction SilentlyContinue; if (-not (Test-Path '%SCRIPT%')) { Write-Host 'No se pudo descargar. Buscando localmente...'; $local = Get-ChildItem -Path '%CD%' -Recurse -Filter 'diagnose-remote-pc.ps1' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($local) { Copy-Item $local.FullName -Destination '%SCRIPT%' } }"

if not exist "%SCRIPT%" (
    echo.
    echo ✗ ERROR: No se pudo obtener el script de diagnóstico
    echo   Intenta:
    echo   1. Descarga manualmente desde GitHub:
    echo      https://github.com/yummancito/Y-CORE/raw/main/diagnose-remote-pc.ps1
    echo   2. Colócalo en la misma carpeta que este .bat
    echo   3. Corre: powershell -ExecutionPolicy Bypass -File diagnose-remote-pc.ps1
    echo.
    pause
    exit /b 1
)

echo ✓ Script descargado. Ejecutando análisis...
echo.

REM Ejecutar diagnóstico
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -OutputFile "%OUTPUT%"

if exist "%OUTPUT%" (
    echo.
    echo ╔════════════════════════════════════════════════════════════════════════════╗
    echo ║                       ANÁLISIS COMPLETADO                                 ║
    echo ╚════════════════════════════════════════════════════════════════════════════╝
    echo.
    echo ✓ Resultados guardados en:
    echo   %OUTPUT%
    echo.
    echo Abriendo resultado...
    start notepad "%OUTPUT%"
) else (
    echo.
    echo ✗ ERROR: El análisis no generó resultados
    echo   Intenta ejecutar manualmente:
    echo   powershell -ExecutionPolicy Bypass -File "%SCRIPT%"
    echo.
    pause
    exit /b 1
)

REM Limpiar
del /q "%SCRIPT%" >nul 2>&1

echo.
echo ✅ Comparte el archivo de resultados con el equipo de Y-core
echo    Archivo: %OUTPUT%
echo.
pause
