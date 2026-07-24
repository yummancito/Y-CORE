@echo off
rem ============================================================================
rem build-native.bat — Wrapper que compila ycore.dll y lo deja en resources/native/
rem Antes apuntaba a `c:\Users\mitch\Desktop\y-core-backup\native\ycore-online`
rem (de la PC original del autor) y solo funcionaba ahí. Ahora delega en el
rem build script canónico que ya existe dentro del repo en native/ycore/.
rem ============================================================================

setlocal

set "ROOT=%~dp0.."
set "NATIVE_BUILD=%ROOT%\native\ycore\build.bat"

if not exist "%NATIVE_BUILD%" (
    echo [ERROR] No encontre %NATIVE_BUILD%. El script canónico no está en el repo.
    exit /b 1
)

echo === Compilando ycore.dll via native\ycore\build.bat ===
call "%NATIVE_BUILD%"
if errorlevel 1 (
    echo [ERROR] Fallo la compilacion de ycore.dll.
    exit /b 1
)

echo === Copiando ycore.dll fresco a resources\native\ ===
if not exist "%ROOT%\native\ycore\build\ycore.dll" (
    echo [ERROR] %ROOT%\native\ycore\build\ycore.dll no se genero.
    exit /b 1
)

if not exist "%ROOT%\resources\native" mkdir "%ROOT%\resources\native"
copy /y "%ROOT%\native\ycore\build\ycore.dll" "%ROOT%\resources\native\ycore.dll" >nul
if errorlevel 1 (
    echo [ERROR] No pude copiar el DLL a resources\native\.
    exit /b 1
)

echo === DONE - ycore.dll recompilado y copiado ===
endlocal
