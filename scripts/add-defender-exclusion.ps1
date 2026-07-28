# ==============================================================================
# Y-core — Windows Defender Exclusion Helper (PowerShell)
# ------------------------------------------------------------------------------
# Uso: PowerShell -ExecutionPolicy Bypass -File scripts\add-defender-exclusion.ps1
#
# Agrega exclusiones en Windows Defender para todas las carpetas donde Y-core
# tiene DLLs nativos, evitando falsos positivos con el antivirus.
# ==============================================================================

$ErrorActionPreference = "Continue"
$WarningPreference = "Continue"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Y-core — Exclusion de Windows Defender" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si somos admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")
if (-not $isAdmin) {
    Write-Host "[!] Se requieren permisos de administrador." -ForegroundColor Yellow
    Write-Host "    Re-ejecutando como administrador..." -ForegroundColor Yellow
    Write-Host ""

    # Re-elevate
    $scriptPath = $MyInvocation.MyCommand.Path
    if (-not $scriptPath) {
        $scriptPath = Join-Path $PSScriptRoot "add-defender-exclusion.ps1"
    }
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
    exit
}

# ── Rutas a excluir ─────────────────────────────────────────────────────────
$rootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$paths = @(
    # Datos de usuario (logs, config, etc.)
    [PSCustomObject]@{ Path = "$env:LOCALAPPDATA\Y-core"; Desc = "Datos de usuario" }

    # Instalación completa
    [PSCustomObject]@{ Path = $rootDir; Desc = "Directorio de instalacion" }

    # DLL nativos empaquetados (ycore.dll versionado)
    [PSCustomObject]@{ Path = Join-Path $rootDir "resources\native"; Desc = "DLL nativos empaquetados" }

    # DLL hook de Steam (electron/dll/)
    [PSCustomObject]@{ Path = Join-Path $rootDir "electron\dll"; Desc = "DLL hook de Steam" }

    # Koffi (FFI loader)
    [PSCustomObject]@{ Path = Join-Path $rootDir "node_modules\koffi"; Desc = "Libreria FFI (koffi)" }
)

# ── Agregar exclusiones ─────────────────────────────────────────────────────
Write-Host "[1/2] Agregando exclusiones a Windows Defender..." -ForegroundColor Yellow
Write-Host ""

$added = 0
$failed = 0
$existing = @(Get-MpPreference).ExclusionPath

foreach ($item in $paths) {
    $path = $item.Path
    $desc = $item.Desc

    Write-Host "  Procesando: $desc" -NoNewline

    # Check if path exists
    if (-not (Test-Path $path -ErrorAction SilentlyContinue)) {
        # Path doesn't exist yet, but we should still add exclusion for it
        # because the DLLs might have been removed by Defender
    }

    # Check if already excluded
    if ($existing -contains $path) {
        Write-Host "  [YA EXCLUIDO]" -ForegroundColor Green
        continue
    }

    try {
        Add-MpPreference -ExclusionPath $path -ErrorAction Stop | Out-Null
        Write-Host "  [OK]" -ForegroundColor Green
        $added++
    } catch {
        Write-Host "  [ERROR]" -ForegroundColor Red
        Write-Host "     $_" -ForegroundColor Gray
        $failed++
    }
}

# ── Verificar exlusiones finales ───────────────────────────────────────────
Write-Host ""
Write-Host "[2/2] Exclusiones activas:" -ForegroundColor Yellow
Write-Host ""
$finalExclusions = @(Get-MpPreference).ExclusionPath
foreach ($excl in $finalExclusions | Sort-Object) {
    Write-Host "  ✓ $excl" -ForegroundColor Green
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Exclusiones agregadas: $added"
Write-Host "  Fallos:                $failed"
Write-Host "  Exclusiones activas:   $($finalExclusions.Count)"
Write-Host ""

if ($failed -gt 0) {
    Write-Host "  [!] Algunas exclusiones fallaron. Intenta ejecutar" -ForegroundColor Yellow
    Write-Host "      el script como Administrador." -ForegroundColor Yellow
}

# ── Instrucciones para restaurar DLLs ──────────────────────────────────────
Write-Host ""
Write-Host "  Si Windows Defender ya elimino los DLL:" -ForegroundColor White
Write-Host "  1. Abre Windows Security > Virus & threat protection" -ForegroundColor Gray
Write-Host "  2. Haz clic en 'Protection history'" -ForegroundColor Gray
Write-Host "  3. Busca amenazas relacionadas con Y-core" -ForegroundColor Gray
Write-Host "  4. Haz clic en 'Actions' > 'Restore'" -ForegroundColor Gray
Write-Host "  5. Despues de restaurar, reinicia Y-core" -ForegroundColor Gray
Write-Host ""
Write-Host "  Alternativamente, compila los DLL desde codigo fuente:" -ForegroundColor Gray
Write-Host "  pnpm build:native" -ForegroundColor Gray
Write-Host ""

# ── Preguntar si quiere restaurar desde cuarentena automáticamente ─────────
$restore = Read-Host "  Intentar restaurar archivos en cuarentena? (s/N)"
if ($restore -eq "s" -or $restore -eq "S") {
    Write-Host ""
    Write-Host "  Buscando archivos de Y-core en cuarentena..." -ForegroundColor Yellow
    try {
        $quarantine = Get-MpThreatDetection | Where-Object { $_.Resources -like "*y-core*" -or $_.Resources -like "*ycore*" -or $_.Resources -like "*opensteamtool*" }
        if ($quarantine) {
            $count = ($quarantine | Measure-Object).Count
            Write-Host "  Se encontraron $count amenaza(s) en cuarentena." -ForegroundColor Yellow
            foreach ($threat in $quarantine) {
                Write-Host "    - $($threat.Resources)" -ForegroundColor Gray
            }
            $confirm = Read-Host "  Restaurar todos? (s/N)"
            if ($confirm -eq "s" -or $confirm -eq "S") {
                $quarantine | Restore-MpThreat -ErrorAction SilentlyContinue | Out-Null
                Write-Host "  Archivos restaurados. Reinicia Y-core." -ForegroundColor Green
            }
        } else {
            Write-Host "  No se encontraron archivos de Y-core en cuarentena." -ForegroundColor Green
        }
    } catch {
        Write-Host "  No se pudo verificar la cuarentena: $_" -ForegroundColor Gray
    }
}

Write-Host ""
Read-Host "Presiona ENTER para salir"
