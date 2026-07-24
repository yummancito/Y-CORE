@echo off
title Y-CINEMA Launcher
cd /d "%~dp0"

echo ========================================
echo    Y-CINEMA - Iniciando servicios...
echo ========================================
echo.

:: Matar procesos viejos
echo [1/3] Limpiando procesos anteriores...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Compilar backend
echo [2/3] Compilando backend...
call node_modules\.bin\tsc.cmd -p electron/tsconfig.json >nul 2>&1

:: Abrir Vite en ventana nueva
echo [3/3] Abriendo servicios...
start "Y-CINEMA Vite" cmd /c "cd /d "%~dp0" && node_modules\.bin\vite.cmd --host --port 5173"

:: Abrir scraper-api en ventana nueva (opcional, comentar si no se necesita)
start "Y-CINEMA Scraper API" cmd /c "cd /d "%~dp0scraper-api" && node_modules\.bin\tsx.cmd src\index.ts"

:: Esperar un momento y abrir Electron
timeout /t 5 /nobreak >nul
start "Y-CINEMA" cmd /c "cd /d "%~dp0" && node_modules\.bin\electron.cmd ."

echo.
echo Listo! Las ventanas se estan abriendo...
echo.
echo   - Vite:       http://localhost:5173
echo   - Scraper:    http://localhost:3001 (opcional)
echo   - Electron:  ventana de Y-CINEMA
echo.
echo Para cerrar todo, cerra las ventanas o ejecuta:
echo   taskkill /F /IM node.exe ^&^& taskkill /F /IM electron.exe
echo.
pause
