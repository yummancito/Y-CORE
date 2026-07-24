@echo off
rem ============================================================================
rem build-ycore-steam.bat — Wrapper que compila ycore_steam.dll (clean-room
rem Goldberg-style Steam API emulator) y lo deja en resources/native/ycore_steam/.
rem
rem Por diseno NO depende de Goldberg/SteamKit/Proton binarios — la DLL se
rem compila desde native/ycore_steam/ source directo via CMake + MSVC.
rem
rem Output esperado (round-13 — v5 cross-compile dual-target):
rem   native\ycore_steam\build\Release\ycore_steam.dll       (MSVC x64 Release)
rem   native\ycore_steam\build_x86\Release\ycore_steam_x86.dll (MSVC Win32 Release)
rem   resources\native\ycore_steam.dll        (copia consumible)
rem   resources\native\ycore_steam_x86.dll    (copia consumible 32-bit)
rem
rem Si querés ciclo dev rapido, podes saltar el wrapper y correr directamente:
rem   cmake -S native\ycore_steam -B native\ycore_steam\build -A x64
rem   cmake --build native\ycore_steam\build --config Release
rem   cmake -S native\ycore_steam -B native\ycore_steam\build_x86 -A Win32
rem   cmake --build native\ycore_steam\build_x86 --config Release
rem
rem El segundo build (Win32) requiere "Desktop development with C++" workload
rem con cross-tools x86/x64 en Visual Studio Installer. Si no está, el
rem sub-build aborta con error claro y el x64 queda usable — candidateX86DllPath
rem en TS retorna null silenciosamente y patchGameFolder degrada a x64.
rem ============================================================================

setlocal

set "ROOT=%~dp0.."
set "SRC=%ROOT%\native\ycore_steam"
set "BUILD=%SRC%\build"
set "BUILD_X86=%SRC%\build_x86"
set "OUT=%ROOT%\resources\native"

if not exist "%SRC%\CMakeLists.txt" (
  echo [ERROR] No encontre %SRC%\CMakeLists.txt. El skeleton del emulador no esta commiteado.
  exit /b 1
)

where cmake >nul 2>&1
if errorlevel 1 (
  echo [ERROR] cmake no esta en PATH. Instala cmake 3.20+ y volve.
  exit /b 1
)

rem ----------------------------------------------------------------------------
rem Paso 1 — x64 (target default)
rem ----------------------------------------------------------------------------
echo === Configurando ycore_steam (clean-room Steam API emulator, x64) ===
cmake -S "%SRC%" -B "%BUILD%" -A x64 -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 (
  echo [ERROR] CMake configure (x64) falló.
  exit /b 1
)

echo === Compilando ycore_steam.dll (x64) ===
cmake --build "%BUILD%" --config Release
if errorlevel 1 (
  echo [ERROR] Build de ycore_steam.dll (x64) falló.
  exit /b 1
)

set "DLL=%BUILD%\Release\ycore_steam.dll"
if not exist "%DLL%" (
  echo [ERROR] %DLL% no se generó. Esperaba algo en %BUILD%\Release\.
  exit /b 1
)

if not exist "%OUT%" mkdir "%OUT%"
copy /y "%DLL%" "%OUT%\ycore_steam.dll" >nul
if errorlevel 1 (
  echo [ERROR] No pude copiar %DLL% a %OUT%.
  exit /b 1
)

rem ----------------------------------------------------------------------------
rem Paso 2 — Win32 (target x86, OBLIGATORIO desde v5).
rem ----------------------------------------------------------------------------
echo === Configurando ycore_steam (clean-room Steam API emulator, Win32) ===
cmake -S "%SRC%" -B "%BUILD_X86%" -A Win32 -DCMAKE_BUILD_TYPE=Release 1>nul
if errorlevel 1 (
  echo [WARN] CMake configure (Win32) falló. Workload requerido: 'Desktop development with C++' con checkbox 'MSVC v143 - VS 2022 C++ x86/x64 build tools' en Visual Studio Installer. Continuando sin DLL 32-bit ^(x64 sigue funcional^).
) else (
  echo === Compilando ycore_steam_x86.dll (Win32) ===
  cmake --build "%BUILD_X86%" --config Release 1>nul
  if errorlevel 1 (
    echo [WARN] Build Win32 falló. Mismo workload que arriba. Saliendo con x64 funcional.
  ) else (
    set "DLL_X86=%BUILD_X86%\Release\ycore_steam_x86.dll"
    if exist "%DLL_X86%" (
      copy /y "%DLL_X86%" "%OUT%\ycore_steam_x86.dll" >nul
      echo   Win32 build OK — ycore_steam_x86.dll copiado.
    )
  )
)

echo === DONE - ycore_steam.dll (x64) recompilado y copiado a resources\native\ ===
endlocal
