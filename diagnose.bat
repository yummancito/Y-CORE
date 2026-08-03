@echo off
REM ============================================================================
REM Y-CORE REMOTE PC DIAGNOSTIC — Puro CMD, sin PowerShell
REM ============================================================================
REM Uso: diagnose.bat
REM ============================================================================

setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

set "OUTPUT=%TEMP%\ycore-diagnosis-%RANDOM%.txt"
set "TEMPLOG=%TEMP%\ycore-diag-temp.txt"

(
echo.
echo ================================================================================
echo Y-CORE REMOTE PC DIAGNOSTIC
echo ================================================================================
echo Timestamp: %DATE% %TIME%
echo.

REM ============================================================================
REM 1. INFORMACION DEL SISTEMA
REM ============================================================================
echo ================================================================================
echo 1. INFORMACION DEL SISTEMA
echo ================================================================================

for /f "tokens=*" %%A in ('wmic os get caption ^| findstr /v "Caption"') do set "OS=%%A"
echo OS: %OS%

for /f "tokens=*" %%A in ('wmic os get version ^| findstr /v "Version"') do set "OSVER=%%A"
echo Version: %OSVER%

for /f "tokens=*" %%A in ('wmic os get osarchitecture ^| findstr /v "OSArchitecture"') do set "ARCH=%%A"
echo Arquitectura: %ARCH%

echo Nombre PC: %COMPUTERNAME%
echo Usuario: %USERNAME%

for /f "tokens=*" %%A in ('wmic cpu get name ^| findstr /v "Name"') do set "CPU=%%A"
echo CPU: %CPU%

for /f "tokens=*" %%A in ('wmic cpu get numberofcores ^| findstr /v "NumberOfCores"') do set "CORES=%%A"
echo Nucleos: %CORES%

REM RAM
for /f "tokens=*" %%A in ('wmic OS get TotalVisibleMemorySize ^| findstr /v "TotalVisibleMemorySize"') do set "RAMKB=%%A"
if defined RAMKB (
    set /a "RAMMB=RAMKB / 1024"
    set /a "RAMGB=RAMMB / 1024"
    echo RAM Total: !RAMGB! GB
)

REM ============================================================================
REM 2. STEAM LOCALIZACION
REM ============================================================================
echo.
echo ================================================================================
echo 2. STEAM LOCALIZACION Y CONFIGURACION
echo ================================================================================

set "STEAMFOUND=0"
set "STEAMPATH="

if exist "C:\Program Files (x86)\Steam\steam.exe" (
    set "STEAMPATH=C:\Program Files (x86)\Steam"
    set "STEAMFOUND=1"
)
if exist "C:\Program Files\Steam\steam.exe" (
    set "STEAMPATH=C:\Program Files\Steam"
    set "STEAMFOUND=1"
)

if !STEAMFOUND! equ 1 (
    echo [OK] Steam encontrado: !STEAMPATH!

    for %%F in ("!STEAMPATH!\steam.exe") do (
        echo Archivo: %%~fF
        echo Tamaño: %%~zF bytes
        echo Modificado: %%~tF
    )
) else (
    echo [ERROR] Steam NO ENCONTRADO
    echo Rutas probadas:
    echo   - C:\Program Files ^(x86^)\Steam
    echo   - C:\Program Files\Steam
)

REM config.vdf
if !STEAMFOUND! equ 1 (
    if exist "!STEAMPATH!\config\config.vdf" (
        echo [OK] config.vdf encontrado
        for %%F in ("!STEAMPATH!\config\config.vdf") do (
            echo Tamaño: %%~zF bytes
        )
    ) else (
        echo [ERROR] config.vdf NO ENCONTRADO
    )

    REM depotcache
    if exist "!STEAMPATH!\depotcache" (
        for /f %%A in ('dir /b "!STEAMPATH!\depotcache" 2^>nul ^| find /c /v ""') do (
            echo [OK] depotcache: %%A archivos
        )
    ) else (
        echo [ADVERTENCIA] depotcache NO ENCONTRADO ^(normal si no descargaste nada^)
    )
)

REM ============================================================================
REM 3. PROCESOS STEAM
REM ============================================================================
echo.
echo ================================================================================
echo 3. PROCESOS DE STEAM
echo ================================================================================

tasklist | findstr /i "steam" >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo [ADVERTENCIA] Steam ESTA CORRIENDO:
    tasklist | findstr /i "steam"
) else (
    echo [OK] Steam no esta corriendo en este momento
)

REM ============================================================================
REM 4. Y-CORE LOCALIZACION
REM ============================================================================
echo.
echo ================================================================================
echo 4. Y-CORE LOCALIZACION
echo ================================================================================

set "YCOREFOUND=0"
set "YCOEPATH="

if exist "%ProgramFiles%\Y-core\Y-core.exe" (
    set "YCOEPATH=%ProgramFiles%\Y-core"
    set "YCOREFOUND=1"
)
if exist "%ProgramFiles(x86)%\Y-core\Y-core.exe" (
    set "YCOEPATH=%ProgramFiles(x86)%\Y-core"
    set "YCOREFOUND=1"
)
if exist "%APPDATA%\..\Local\Programs\Y-core\Y-core.exe" (
    set "YCOEPATH=%APPDATA%\..\Local\Programs\Y-core"
    set "YCOREFOUND=1"
)

if !YCOREFOUND! equ 1 (
    echo [OK] Y-core encontrado: !YCOEPATH!

    for %%F in ("!YCOEPATH!\Y-core.exe") do (
        echo Tamaño: %%~zF bytes
        echo Modificado: %%~tF
    )

    REM Verificar recursos/DLLs
    if exist "!YCOEPATH!\resources\app.asar" (
        echo [OK] app.asar encontrado
    ) else (
        echo [ERROR] app.asar NO ENCONTRADO
    )

    if exist "!YCOEPATH!\resources\native\ycore_steam.dll" (
        for %%F in ("!YCOEPATH!\resources\native\ycore_steam.dll") do (
            echo [OK] ycore_steam.dll: %%~zF bytes
        )
    ) else (
        echo [ERROR] ycore_steam.dll NO ENCONTRADO
    )

    if exist "!YCOEPATH!\resources\native\ycore.dll" (
        for %%F in ("!YCOEPATH!\resources\native\ycore.dll") do (
            echo [OK] ycore.dll: %%~zF bytes
        )
    ) else (
        echo [ERROR] ycore.dll NO ENCONTRADO
    )
) else (
    echo [ERROR] Y-core NO ENCONTRADO
    echo Rutas probadas:
    echo   - %ProgramFiles%\Y-core
    echo   - %ProgramFiles(x86)%\Y-core
    echo   - %APPDATA%\..\Local\Programs\Y-core
)

REM ============================================================================
REM 5. STEAM HOOK DLLs (CRITICO)
REM ============================================================================
echo.
echo ================================================================================
echo 5. STEAM HOOK DLLs ^(EN STEAM FOLDER - CRITICO^)
echo ================================================================================

if !STEAMFOUND! equ 1 (
    set "HOOKFOUND=0"

    if exist "!STEAMPATH!\YCoreTool.dll" (
        echo [OK] YCoreTool.dll ENCONTRADO
        for %%F in ("!STEAMPATH!\YCoreTool.dll") do (
            echo Tamaño: %%~zF bytes
        )
        set "HOOKFOUND=1"
    ) else (
        echo [ERROR] YCoreTool.dll NO ENCONTRADO
    )

    if exist "!STEAMPATH!\dwmapi.dll" (
        echo [OK] dwmapi.dll ENCONTRADO
        for %%F in ("!STEAMPATH!\dwmapi.dll") do (
            echo Tamaño: %%~zF bytes
        )
        set "HOOKFOUND=1"
    ) else (
        echo [ERROR] dwmapi.dll NO ENCONTRADO
    )

    if exist "!STEAMPATH!\xinput1_4.dll" (
        echo [OK] xinput1_4.dll ENCONTRADO
        for %%F in ("!STEAMPATH!\xinput1_4.dll") do (
            echo Tamaño: %%~zF bytes
        )
        set "HOOKFOUND=1"
    ) else (
        echo [ERROR] xinput1_4.dll NO ENCONTRADO
    )

    if !HOOKFOUND! equ 0 (
        echo.
        echo *** PROBLEMA CRITICO ***
        echo NINGUN HOOK DLL ENCONTRADO
        echo Esto explica por que juegos muestran "Comprar" en vez de "Jugar"
        echo.
    )

    if exist "!STEAMPATH!\ycoretool\hook_consent.txt" (
        echo [OK] hook_consent.txt ENCONTRADO ^(consentimiento dado^)
    ) else (
        echo [ADVERTENCIA] hook_consent.txt NO ENCONTRADO
        echo Esto significa que nunca se instalo el hook
    )
) else (
    echo [ERROR] No se puede verificar hook DLLs ^(Steam no encontrado^)
)

REM ============================================================================
REM 6. Y-CORE LOGS
REM ============================================================================
echo.
echo ================================================================================
echo 6. Y-CORE LOGS ^(ULTIMAS 50 LINEAS^)
echo ================================================================================

set "LOGFILE=%APPDATA%\..\Local\Y-core\logs\ycore.log"

if exist "!LOGFILE!" (
    echo [OK] Log file encontrado
    echo.

    REM Mostrar ultimas 50 lineas
    for /f "usebackq skip=999999 delims=" %%A in ("!LOGFILE!") do (
        echo %%A
    )
) else (
    echo [ERROR] Log file NO ENCONTRADO
    echo Rutas probadas:
    echo   - !LOGFILE!
)

REM ============================================================================
REM 7. PERMISOS EN STEAM FOLDER
REM ============================================================================
echo.
echo ================================================================================
echo 7. PERMISOS EN STEAM FOLDER
echo ================================================================================

if !STEAMFOUND! equ 1 (
    REM Intentar crear archivo temporal
    set "TESTFILE=!STEAMPATH!\.ycore-write-test-%RANDOM%.txt"

    echo test > "!TESTFILE!" 2>nul

    if exist "!TESTFILE!" (
        echo [OK] Usuario PUEDE escribir en Steam folder
        del /q "!TESTFILE!" >nul 2>&1
    ) else (
        echo [ERROR] Usuario NO PUEDE escribir en Steam folder
        echo Esto impide instalar el hook automaticamente
        echo.
        echo Solucion:
        echo 1. Click derecho en: !STEAMPATH!
        echo 2. Propiedades ^-^> Seguridad
        echo 3. Editar ^-^> Selecciona tu usuario
        echo 4. Marca "Control Total" ^-^> Aplicar
    )
) else (
    echo [ERROR] No se puede verificar permisos ^(Steam no encontrado^)
)

REM ============================================================================
REM 8. WINDOWS DEFENDER
REM ============================================================================
echo.
echo ================================================================================
echo 8. WINDOWS DEFENDER / ANTIVIRUS
echo ================================================================================

REM Verificar si Defender esta instalado
wmic /namespace:\\root\securitycenter2 path antivirusproduct get displayName 2>nul | findstr /v "DisplayName" >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo [OK] Antivirus detectado en el sistema
    echo.
    echo Revisa manualmente si alguna DLL esta en cuarentena:
    echo 1. Abre Windows Defender
    echo 2. click en "Proteccion contra virus y amenazas"
    echo 3. "Historial de proteccion"
    echo 4. Busca "ycore", "YCoreTool", "dwmapi", "xinput"
    echo 5. Si encuentras algo, click en "Restaurar"
) else (
    echo [ADVERTENCIA] No se detecto antivirus instalado
)

REM ============================================================================
REM 9. RESUMEN Y DIAGNOSTICO
REM ============================================================================
echo.
echo ================================================================================
echo 9. RESUMEN Y DIAGNOSTICO
echo ================================================================================
echo.

if !STEAMFOUND! equ 1 (
    echo [OK] Steam SI esta instalado: !STEAMPATH!
) else (
    echo [ERROR] Steam NO esta instalado
    echo.
    goto END_SUMMARY
)

if !YCOREFOUND! equ 1 (
    echo [OK] Y-core SI esta instalado: !YCOEPATH!
) else (
    echo [ERROR] Y-core NO esta instalado
    echo.
    goto END_SUMMARY
)

REM Verificar hook
if exist "!STEAMPATH!\YCoreTool.dll" (
    echo [OK] YCoreTool.dll SI esta en Steam folder
    echo.
    echo DIAGNOSTICO: Todo parece estar OK
    echo Si aun ves "Comprar" en los juegos, intenta:
    echo 1. Cierra Steam completamente
    echo 2. Cierra Y-core completamente
    echo 3. Abre Y-core nuevamente
    echo 4. Espera a que cargue completamente
    echo 5. Abre Steam
    echo 6. Verifica si los juegos ahora muestran "Jugar"
) else (
    echo [ERROR] YCoreTool.dll NO esta en Steam folder
    echo.
    echo DIAGNOSTICO: HOOK NO INSTALADO
    echo Esto es lo que causa que veas "Comprar" en los juegos
    echo.
    echo SOLUCION:
    echo 1. Asegurate de que Steam esta CERRADO
    echo 2. Abre Y-core
    echo 3. Ve a Configuracion ^-^> Steam
    echo 4. Haz click en el boton "Verificar" o "Repair"
    echo 5. Espera a que termine ^(puede tardar unos segundos^)
    echo 6. Cierra Y-core
    echo 7. Abre Steam
    echo 8. Verifica si los juegos ahora muestran "Jugar"
    echo.
    echo Si sigue sin funcionar:
    echo - Desinstala Y-core completamente
    echo - Elimina: C:\Users\%USERNAME%\AppData\Local\Y-core\
    echo - Descarga la ultima version desde GitHub
    echo - Reinstala
)

:END_SUMMARY

) > "%OUTPUT%"

REM ============================================================================
REM MOSTRAR RESULTADO
REM ============================================================================

echo.
echo ╔════════════════════════════════════════════════════════════════════════════╗
echo ║                       DIAGNOSTICO COMPLETADO                              ║
echo ╚════════════════════════════════════════════════════════════════════════════╝
echo.
echo Archivo de resultados:
echo %OUTPUT%
echo.
echo Abriendo resultado...
echo.

timeout /t 2 /nobreak >nul

if exist "%OUTPUT%" (
    start notepad "%OUTPUT%"
) else (
    echo ERROR: No se pudo crear el archivo de resultado
    pause
    exit /b 1
)

echo.
echo Por favor, comparte el contenido del archivo de texto con el equipo de Y-core
echo Discord: https://discord.gg/Z2CzV884zE
echo.
pause
