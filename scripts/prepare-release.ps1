# prepare-release.ps1
# Prepara el release 2.60 para GitHub:
# - Compila el .exe
# - Empaqueta archivos de release (SIN source del DLL)
# - Listo para subir a GitHub Releases

param(
    [string]$Version = "2.6.0",
    [string]$OutputDir = "./dist"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Preparando Release Y-CORE v$Version ===" -ForegroundColor Cyan

# 1. TypeScript check
Write-Host "1. TypeCheck..." -ForegroundColor Green
& npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeCheck fallido" }

# 2. Build (vite + electron)
Write-Host "2. Build (React + Electron)..." -ForegroundColor Green
& npm run build
if ($LASTEXITCODE -ne 0) { throw "Build fallido" }

# 3. Compilar DLL nativo (si no existe o es viejo)
Write-Host "3. Compilar DLL nativo..." -ForegroundColor Green
if (-not (Test-Path "native/ycore/build/ycore.dll")) {
    Write-Host "   DLL no encontrado, compilando..." -ForegroundColor Yellow
    & cmd /c "cd native\ycore && build.bat"
    if ($LASTEXITCODE -ne 0) { throw "Build del DLL fallido" }
}

# 4. Copiar DLL a resources (para que electron-builder lo empaquete)
Write-Host "4. Preparar DLL para empaquetado..." -ForegroundColor Green
$dllSrc = "native/ycore/build/ycore.dll"
$dllDst = "resources/native/ycore.dll"
if (-not (Test-Path "resources/native")) {
    New-Item -ItemType Directory -Force "resources/native" | Out-Null
}
Copy-Item $dllSrc $dllDst -Force
Write-Host "   ycore.dll copiado a $dllDst" -ForegroundColor Gray

# 5. electron-builder (genera .exe + setup)
Write-Host "5. electron-builder (empaquetar .exe)..." -ForegroundColor Green
& npm run dist
if ($LASTEXITCODE -ne 0) { throw "electron-builder fallido" }

# 6. Verificar que existan los artefactos
Write-Host "6. Verificar artefactos..." -ForegroundColor Green
$setup = "dist/Y-core-Setup-$Version.exe"
$portable = "dist/Y-core-$Version.exe"
$yml = "dist/latest.yml"

if (Test-Path $setup) {
    $size = [math]::Round((Get-Item $setup).Length / 1MB, 2)
    Write-Host "   [OK] Setup: $setup ($size MB)" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] Setup no encontrado: $setup" -ForegroundColor Red
    throw "Setup no generado"
}

if (Test-Path $yml) {
    Write-Host "   [OK] Manifest: $yml" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] Manifest no encontrado" -ForegroundColor Red
}

Write-Host "`n=== Release $Version listo ===" -ForegroundColor Cyan
Write-Host "Archivos en ./dist/" -ForegroundColor Green
Get-ChildItem "dist/" -File | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  - $($_.Name) ($size MB)" -ForegroundColor Gray
}

Write-Host "`nPróximo paso: git tag v$Version && git push origin v$Version" -ForegroundColor Yellow
Write-Host "Luego subir ./dist/Y-core-Setup-$Version.exe a GitHub Releases" -ForegroundColor Yellow
