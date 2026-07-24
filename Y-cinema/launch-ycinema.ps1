# launch-ycinema.ps1 — Lanza todo Y-CINEMA + scraper-api en ventanas separadas
# Ejecutar con: powershell -ExecutionPolicy Bypass -File launch-ycinema.ps1

$ROOT = "C:\Users\User Unkown\Desktop\proyectos\Y-CORE\Y-cinema"

Write-Host "=== Lanzando Y-CINEMA Desktop ===" -ForegroundColor Cyan
Write-Host ""

# 1. Matar procesos viejos
Write-Host "[1/3] Matando procesos anteriores..." -NoNewline
taskkill /F /IM node.exe 2>$null
taskkill /F /IM electron.exe 2>$null
Start-Sleep 2
Write-Host " OK" -ForegroundColor Green

# 2. Lanzar Vite (frontend)
Write-Host "[2/3] Iniciando Vite (frontend)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$ROOT'; Write-Host '=== VITE (frontend) ===' -ForegroundColor Cyan; node_modules\.bin\vite.cmd --host --port 5173" -WindowStyle Normal

Start-Sleep 3

# 3. Lanzar scraper-api
Write-Host "[2/3] Iniciando scraper-api..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$ROOT\scraper-api'; Write-Host '=== SCRAPER API ===' -ForegroundColor Magenta; node_modules\.bin\tsx.cmd src\index.ts" -WindowStyle Normal

Start-Sleep 5

# 4. Lanzar Electron
Write-Host "[3/3] Iniciando Electron (ventana)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$ROOT'; Write-Host '=== ELECTRON ===' -ForegroundColor Green; node_modules\.bin\electron.cmd ." -WindowStyle Normal

Write-Host ""
Write-Host "=== Todo lanzado ===" -ForegroundColor Cyan
Write-Host "  VITE:       http://localhost:5173" -ForegroundColor White
Write-Host "  SCRAPER:    http://localhost:3001" -ForegroundColor White
Write-Host "  ELECTRON:   ventana Y-CINEMA" -ForegroundColor White
Write-Host ""
Write-Host "Esperá 10-15 segundos a que todo arranque." -ForegroundColor Gray
