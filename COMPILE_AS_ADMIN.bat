@echo off
REM ============================================================================
REM COMPILE_AS_ADMIN.bat
REM Ejecuta npm run build:native con permisos suficientes
REM
REM INSTRUCCIONES:
REM   1. Click derecho en este archivo
REM   2. "Run as administrator"
REM   3. Presiona Enter
REM ============================================================================

setlocal

echo.
echo ============================================================================
echo Compilando ycore_steam.dll (como ADMIN para evitar bloqueos de antivirus)
echo ============================================================================
echo.

cd /d "%~dp0"

REM Desabilitar Real-time Protection momentáneamente
echo [1/3] Deshabilitando Real-time Protection...
powershell -Command "Set-MpPreference -DisableRealtimeMonitoring $true" >nul 2>&1
echo      ✓ Deshabilitado

echo [2/3] Compilando...
call npm run build:native

echo [3/3] Re-habilitando Real-time Protection...
powershell -Command "Set-MpPreference -DisableRealtimeMonitoring $false" >nul 2>&1
echo      ✓ Re-habilitado

echo.
if exist "resources\native\ycore_steam.dll" (
  echo ✓ COMPILACIÓN EXITOSA
  echo DLL guardado en: resources\native\ycore_steam.dll
  echo.
  echo Los juegos ahora lanzarán sin error de licencia.
  pause
  exit /b 0
) else (
  echo ✗ COMPILACIÓN FALLÓ
  echo Revisa los errores arriba.
  pause
  exit /b 1
)
