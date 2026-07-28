@echo off
REM Configura todos los juegos con steam_appid.txt y steam_settings/

setlocal enabledelayedexpansion

set "STEAM_PATH=C:\Program Files (x86)\Steam\steamapps\common"

REM Tabla de juegos y AppIds
set "games[0]=BeamNG.drive|284160"
set "games[1]=Black Mesa|362890"
set "games[2]=Counter-Strike Source|240"
set "games[3]=Left 4 Dead 2|550"
set "games[4]=Overwatch|10"
set "games[5]=ARC Raiders|2559590"

for /L %%i in (0,1,5) do (
    for /f "tokens=1,2 delims=|" %%a in ("!games[%%i]!") do (
        set "GAME_NAME=%%a"
        set "APP_ID=%%b"
        set "GAME_PATH=!STEAM_PATH!\!GAME_NAME!"

        if exist "!GAME_PATH!" (
            echo Configurando: !GAME_NAME! ^(AppId: !APP_ID!^)

            REM Crear steam_appid.txt
            echo !APP_ID! > "!GAME_PATH!\steam_appid.txt"

            REM Crear steam_settings/
            if not exist "!GAME_PATH!\steam_settings" mkdir "!GAME_PATH!\steam_settings"

            REM Crear archivos de configuracion
            echo 1 > "!GAME_PATH!\steam_settings\offline.txt"
            echo 1 > "!GAME_PATH!\steam_settings\disable_overlay.txt"
            echo YCorePlayer > "!GAME_PATH!\steam_settings\force_account_name.txt"
            echo !APP_ID! > "!GAME_PATH!\steam_settings\appid.txt"

            echo   OK - !GAME_NAME!
        ) else (
            echo   SKIP - No encontrado: !GAME_PATH!
        )
    )
)

echo.
echo LISTO - Todos los juegos configurados
pause
