# ============================================================================
# scripts/diagnose-steam.ps1
# ----------------------------------------------------------------------------
# DIAGNOSTICO GLOBAL de la carpeta Steam en la PC de prueba.
#
# Vuelca exactamente lo que Y-Core revisa para decidir si un juego sale
# "Comprar" o "Jugar" y por que fallan las descargas:
#   1.  Ruta de Steam (por defecto C:\Program Files (x86)\Steam; se puede
#       cambiar con -SteamPath, y si no existe cae al registry)
#   2.  DLL del hook (YCoreTool / steamtools_hook / OpenSteamTool / dwmapi / xinput1_4)
#   3.  Marcadores ycoretool\ (last_build_id, hook_consent, failed_signatures)
#   4.  Build actual de Steam (appmanifest_753.acf) vs build del hook
#   5.  Usuarios logueados (config\loginusers.vdf)
#   6.  Scripts Lua (config\lua y config\stplug-in)
#   7.  Juegos instalados (appmanifest_*.acf con StateFlags)
#   8.  Library folders (steamapps\libraryfolders.vdf)
#   9.  depotcache (manifiestos disponibles para descarga)
#  10.  Canal IPC (ycoretool\ipc\*.toml)
#  11.  Windows Defender (cuarentenas recientes)
#  12.  Steam corriendo o no
#  13.  Ultimas lineas de ycore.log
#
# USO (en la PC de prueba, PowerShell):
#   powershell -ExecutionPolicy Bypass -File diagnose-steam.ps1
#   powershell -ExecutionPolicy Bypass -File diagnose-steam.ps1 -SteamPath "D:\Steam"
# ============================================================================

param(
    # Ruta de Steam a diagnosticar (por defecto la ubicacion estandar).
    [string]$SteamPath = 'C:\Program Files (x86)\Steam'
)

$ErrorActionPreference = 'SilentlyContinue'

Write-Host '==================================================' -ForegroundColor Cyan
Write-Host '  Y-CORE | DIAGNOSTICO GLOBAL DE STEAM' -ForegroundColor Cyan
Write-Host ("  " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1) Ruta de Steam
# ---------------------------------------------------------------------------
Write-Host "`n[1] Ruta de Steam" -ForegroundColor Cyan

# 1a) Ruta forzada por el usuario (parametro). En la PC de prueba: la ruta fija.
$steam = $null
$forcedPathMissed = $false
if ($SteamPath) {
    Write-Host ("    Ruta forzada    = " + $SteamPath)
    if (Test-Path $SteamPath) { $steam = $SteamPath }
    else {
        Write-Host '    >>> ATENCION: la ruta forzada NO EXISTE en esta PC.' -ForegroundColor Red
        Write-Host '        Se intentara auto-detectar OTRA ruta de Steam.' -ForegroundColor Red
        $forcedPathMissed = $true
    }
}

# 1b) Ruta custom guardada por Y-Core en ycore-config.json (prioridad maxima en getSteamPath())
if (-not $steam) {
    foreach ($base in @($env:APPDATA, $env:LOCALAPPDATA)) {
        if (-not $base) { continue }
        foreach ($name in @('Y-core', 'y-core')) {
            $cfg = Join-Path (Join-Path $base $name) 'ycore-config.json'
            if (Test-Path $cfg) {
                try {
                    $cfgJson = Get-Content $cfg -Raw -Encoding UTF8 | ConvertFrom-Json
                    if ($cfgJson.steamPath) {
                        Write-Host ("    ycore-config.json ($cfg) steamPath = " + $cfgJson.steamPath)
                        if (Test-Path $cfgJson.steamPath) { $steam = $cfgJson.steamPath }
                    }
                } catch {}
            }
        }
    }
}

# 1c) Registry de Valve
if (-not $steam) {
    $reg = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam' -Name InstallPath
    if (-not $reg) { $reg = Get-ItemProperty 'HKLM:\SOFTWARE\Valve\Steam' -Name InstallPath }
    if ($reg) { $steam = $reg.InstallPath }
}

# 1d) Ruta por defecto
if (-not $steam) { $steam = 'C:\Program Files (x86)\Steam' }

Write-Host ("    SteamPath       = " + $steam)
if ($forcedPathMissed) {
    Write-Host '    >>> ATENCION: se diagnosticara OTRA ruta distinta a la que pediste,' -ForegroundColor Red
    Write-Host ("        porque " + $SteamPath + " no existe aqui.") -ForegroundColor Red
}
if (Test-Path $steam) {
    Write-Host '    Existe          = SI' -ForegroundColor Green
} else {
    Write-Host '    Existe          = NO  -> Y-Core no encuentra Steam. Revisa la ruta en Settings.' -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 2) DLL del hook en la raiz de Steam
# ---------------------------------------------------------------------------
Write-Host "`n[2] Hook DLLs en la raiz de Steam" -ForegroundColor Cyan
$hookOk = $true
foreach ($d in @('YCoreTool.dll','steamtools_hook.dll','OpenSteamTool.dll','dwmapi.dll','xinput1_4.dll','ycoretool.toml')) {
    $p = Join-Path $steam $d
    if (Test-Path $p) {
        $f = Get-Item $p
        if ($f.Length -eq 0) {
            Write-Host ("    [FALTA*] {0,-22} VACIO (0 bytes) - Defender lo cuarenteo o quedo corrupto" -f $d) -ForegroundColor Red
            $hookOk = $false
        } else {
            Write-Host ("    [OK]     {0,-22} {1,10} bytes   mtime={2}" -f $d, $f.Length, $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm')) -ForegroundColor Green
        }
    } else {
        Write-Host ("    [FALTA]  {0,-22} no existe" -f $d) -ForegroundColor Red
        $hookOk = $false
    }
}
if (-not $hookOk) {
    Write-Host '    >> Si falta YCoreTool/dwmapi/xinput1_4 => el hook no esta instalado.' -ForegroundColor Yellow
    Write-Host '       Causa "Comprar" en la biblioteca. Verifica Settings > Steam > Verify.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 3) Marcadores ycoretool\
# ---------------------------------------------------------------------------
Write-Host "`n[3] Marcadores ycoretool\" -ForegroundColor Cyan
$yt = Join-Path $steam 'ycoretool'
if (Test-Path $yt) {
    Write-Host ("    Carpeta ycoretool\ existe, contenido: " + ((Get-ChildItem $yt -Recurse -File | Measure-Object).Count) + ' archivos')
} else {
    Write-Host '    Carpeta ycoretool\ NO existe - el hook nunca se instalo correctamente.' -ForegroundColor Yellow
}

$lb = Join-Path $steam 'ycoretool\last_build_id.txt'
if (Test-Path $lb) {
    Write-Host ("    last_build_id.txt   = " + (Get-Content $lb -Raw).Trim())
} else {
    Write-Host '    last_build_id.txt   = (no existe)' -ForegroundColor Yellow
}

$hc = Join-Path $steam 'ycoretool\hook_consent.txt'
if (Test-Path $hc) {
    Write-Host '    hook_consent.txt    = EXISTE (consentimiento dado, auto-repair activo)' -ForegroundColor Green
} else {
    Write-Host '    hook_consent.txt    = NO existe - el auto-repair silencioso NO actuara' -ForegroundColor Yellow
}

$fs = Join-Path $steam 'ycoretool\failed_signatures.json'
if (Test-Path $fs) {
    $fsContent = (Get-Content $fs -Raw).Trim()
    if ($fsContent) {
        Write-Host ("    failed_signatures   = " + $fsContent) -ForegroundColor Yellow
        Write-Host '    >> Hay firmas fallidas: el hook pudo ser removido por incompatibilidad.' -ForegroundColor Yellow
    } else {
        Write-Host '    failed_signatures   = (vacio)'
    }
} else {
    Write-Host '    failed_signatures   = (no existe)' -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 4) Build de Steam vs build del hook
# ---------------------------------------------------------------------------
Write-Host "`n[4] Build de Steam vs build del hook (causa principal de 'Comprar')" -ForegroundColor Cyan
$currentBuild = $null
$m753 = Join-Path $steam 'steamapps\appmanifest_753.acf'
if (Test-Path $m753) {
    $c = Get-Content $m753 -Raw -Encoding UTF8
    if ($c -match '"buildid"\s+"(\d+)"') { $currentBuild = $Matches[1] }
    Write-Host ("    Steam build actual (appmanifest_753) = " + $currentBuild)
} else {
    Write-Host '    appmanifest_753.acf NO existe (Steam nunca abrio o steamapps vacio)' -ForegroundColor Red
}

$lastBuild = $null
if (Test-Path $lb) { $lastBuild = (Get-Content $lb -Raw).Trim() }

if ($currentBuild -and $lastBuild) {
    if ($currentBuild -ne $lastBuild) {
        Write-Host ("    Hook instalado para build        = " + $lastBuild)
        Write-Host "    RESULTADO: DESACTUALIZADO -> Steam se actualizo, Steam removio el hook y por eso sale 'Comprar'." -ForegroundColor Red
        Write-Host '    Solucion: cerrar Steam y correr Settings > Steam > Verify (o reinstalar el juego).' -ForegroundColor Yellow
    } else {
        Write-Host ("    Hook instalado para build        = " + $lastBuild)
        Write-Host '    RESULTADO: COINCIDE - el hook deberia estar OK.' -ForegroundColor Green
    }
} elseif ($currentBuild -and -not $lastBuild) {
    Write-Host '    last_build_id.txt ausente aunque Steam tiene build -> hook sin registrar.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 5) Usuarios logueados
# ---------------------------------------------------------------------------
Write-Host "`n[5] Usuarios de Steam (config\loginusers.vdf)" -ForegroundColor Cyan
$lu = Join-Path $steam 'config\loginusers.vdf'
if (Test-Path $lu) {
    $c2 = Get-Content $lu -Raw -Encoding UTF8
    $users = [regex]::Matches($c2, '"(\d{17})"\s*\{') | ForEach-Object { $_.Groups[1].Value }
    if ($users.Count -eq 0) {
        Write-Host '    (formato no reconocido o sin cuentas con 17 digitos)'
    } else {
        foreach ($u in $users) { Write-Host ("    accountID = " + $u) }
    }
    if ($c2 -match '"MostRecent"\s+"1"') { Write-Host '    Hay cuenta marcada como MostRecent.' -ForegroundColor Green }
} else {
    Write-Host '    loginusers.vdf NO existe - nadie inicio sesion en Steam.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 6) Scripts Lua
# ---------------------------------------------------------------------------
Write-Host "`n[6] Scripts Lua" -ForegroundColor Cyan
foreach ($d in @('config\lua','config\stplug-in')) {
    $p = Join-Path $steam $d
    if (Test-Path $p) {
        $files = @(Get-ChildItem $p -Filter *.lua)
        Write-Host ("    " + $d + " : " + $files.Count + " .lua")
        foreach ($f in $files) { Write-Host ("        - " + $f.Name) }
    } else {
        Write-Host ("    " + $d + " : (no existe)")
    }
}

# ---------------------------------------------------------------------------
# 7) Juegos instalados
# ---------------------------------------------------------------------------
Write-Host "`n[7] Juegos instalados (appmanifest_*.acf)" -ForegroundColor Cyan
$apps = Join-Path $steam 'steamapps'
if (Test-Path $apps) {
    $manifests = @(Get-ChildItem $apps -Filter 'appmanifest_*.acf')
    Write-Host ("    Total ACFs: " + $manifests.Count)
    foreach ($m in $manifests) {
        $c3 = Get-Content $m.FullName -Raw -Encoding UTF8
        $appId = if ($c3 -match '"appid"\s+"(\d+)"') { $Matches[1] } else { '?' }
        $name  = if ($c3 -match '"name"\s+"([^"]+)"') { $Matches[1] } else { '?' }
        $state = if ($c3 -match '"StateFlags"\s+"(\d+)"') { $Matches[1] } else { '?' }
        Write-Host ("    {0,-8} {1,-40} StateFlags={2}" -f $appId, $name, $state)
    }
    # StateFlags 4 = fully installed; 2 = update required; 0 = no instalado
} else {
    Write-Host '    steamapps NO existe.' -ForegroundColor Red
}

# ---------------------------------------------------------------------------
# 8) Library folders
# ---------------------------------------------------------------------------
Write-Host "`n[8] Library folders (steamapps\libraryfolders.vdf)" -ForegroundColor Cyan
$lf = Join-Path $apps 'libraryfolders.vdf'
if (Test-Path $lf) {
    $c4 = Get-Content $lf -Raw -Encoding UTF8
    $paths = [regex]::Matches($c4, '"path"\s+"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
    if ($paths.Count -eq 0) { Write-Host '    (sin entradas de path)' }
    foreach ($pt in $paths) {
        $ok = Test-Path $pt
        Write-Host ("    - " + $pt + "  [" + $(if ($ok) {'accesible'} else {'NO ACCESIBLE'}) + "]")
    }
} else {
    Write-Host '    libraryfolders.vdf NO existe (solo steamapps raiz).' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 9) depotcache
# ---------------------------------------------------------------------------
Write-Host "`n[9] depotcache (manifiestos para descargas)" -ForegroundColor Cyan
$dc = Join-Path $steam 'depotcache'
if (Test-Path $dc) {
    $deps = @(Get-ChildItem $dc -Filter *.manifest)
    Write-Host ("    Manifiestos: " + $deps.Count)
    foreach ($dp in ($deps | Select-Object -First 15)) { Write-Host ("        - " + $dp.Name) }
    if ($deps.Count -gt 15) { Write-Host ("        ... y " + ($deps.Count - 15) + " mas") }
} else {
    Write-Host '    depotcache NO existe - puede que aun no haya manifiestos descargados.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 10) Canal IPC (ycoretool\ipc)
# ---------------------------------------------------------------------------
Write-Host "`n[10] Canal IPC (ycoretool\ipc\*.toml)" -ForegroundColor Cyan
$ipc = Join-Path $steam 'ycoretool\ipc'
if (Test-Path $ipc) {
    $tomls = @(Get-ChildItem $ipc -Recurse -Filter *.toml)
    Write-Host ("    TOMLs IPC: " + $tomls.Count)
    foreach ($t in $tomls) { Write-Host ("        - " + $t.FullName.Replace($steam, '...')) }
} else {
    Write-Host '    (no existe - normal si el hook nunca cargo correctamente)' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 11) Windows Defender
# ---------------------------------------------------------------------------
Write-Host "`n[11] Windows Defender (cuarentenas recientes)" -ForegroundColor Cyan
$threats = @(Get-MpThreatDetection | Sort-Object InitialDetectionTime -Descending | Select-Object -First 5)
if ($threats.Count -eq 0) {
    Write-Host '    Sin cuarentenas recientes detectadas (o falta permiso para leerlas).' -ForegroundColor Green
} else {
    foreach ($t in $threats) {
        $tname = (Get-MpThreat -ThreatID $t.ThreatID).ThreatName
        $res = @(Get-MpThreatDetection -ThreatID $t.ThreatID)
        $resPath = ($res | Select-Object -First 1).Resources -join ', '
        Write-Host ("    [" + $t.InitialDetectionTime + "] " + $tname) -ForegroundColor Red
        Write-Host ("        " + $resPath) -ForegroundColor Yellow
    }
    Write-Host '    >> Si ves YCoreTool.dll / dwmapi.dll / xinput1_4.dll aqui, Defender los cuarenteo.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 12) Steam corriendo
# ---------------------------------------------------------------------------
Write-Host "`n[12] Proceso Steam" -ForegroundColor Cyan
$proc = Get-Process steam -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host ("    CORRIENDO (PID " + $proc.Id + ") - el hook debe reinstalarse con Steam cerrado.") -ForegroundColor Yellow
} else {
    Write-Host '    Cerrado - listo para reinstalar el hook.' -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 13) Log de Y-Core
# ---------------------------------------------------------------------------
Write-Host "`n[13] Log de Y-Core (ultimas lineas)" -ForegroundColor Cyan
# En Electron, app.getPath('userData') en Windows apunta a %APPDATA% (Roaming),
# NO a %LOCALAPPDATA%. Revisamos ambos roots y ambas variantes del nombre.
$logCandidates = @()
foreach ($base in @($env:APPDATA, $env:LOCALAPPDATA)) {
    if (-not $base) { continue }
    foreach ($name in @('Y-core', 'y-core')) {
        $logCandidates += (Join-Path (Join-Path $base $name) 'logs\ycore.log')
    }
}
$log = $logCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($log) {
    Write-Host ("    " + $log)
    Get-Content $log -Tail 30 -Encoding UTF8
} else {
    Write-Host '    No se encontro ycore.log en ninguno de estos paths:' -ForegroundColor Yellow
    foreach ($lc in $logCandidates) { Write-Host ("        - " + $lc) }
    Write-Host '    (en Electron vive en %APPDATA%\Y-core\logs\ycore.log)' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
Write-Host "`n===== RESUMEN =====" -ForegroundColor Cyan
$ytOk = (Test-Path (Join-Path $steam 'YCoreTool.dll')) -and ((Get-Item (Join-Path $steam 'YCoreTool.dll')).Length -gt 0)
$dwmOk = (Test-Path (Join-Path $steam 'dwmapi.dll')) -and ((Get-Item (Join-Path $steam 'dwmapi.dll')).Length -gt 0)
$xinOk = (Test-Path (Join-Path $steam 'xinput1_4.dll')) -and ((Get-Item (Join-Path $steam 'xinput1_4.dll')).Length -gt 0)
$hookComplete = $ytOk -and $dwmOk -and $xinOk

if (-not $hookComplete) {
    Write-Host '  [X] HOOK INCOMPLETO -> por eso sale "Comprar" en la biblioteca.' -ForegroundColor Red
    Write-Host '      Accion: cerrar Steam, abrir Y-Core > Settings > Steam > Verify.' -ForegroundColor Yellow
} elseif ($currentBuild -and $lastBuild -and $currentBuild -ne $lastBuild) {
    Write-Host '  [X] HOOK DESACTUALIZADO -> Steam se actualizo y removio el hook ("Comprar").' -ForegroundColor Red
    Write-Host '      Accion: cerrar Steam, correr Settings > Steam > Verify.' -ForegroundColor Yellow
} else {
    Write-Host '  [OK] Hook instalado y al dia.' -ForegroundColor Green
}

$steamRunning = $null -ne (Get-Process steam -ErrorAction SilentlyContinue)
if ($steamRunning) {
    Write-Host '  [!] Steam esta abierto: la verificacion del hook requiere cerrarlo primero.' -ForegroundColor Yellow
}

Write-Host '==================================================' -ForegroundColor Cyan
Write-Host '  Copia esta salida completa y pasala al equipo de soporte de Y-Core.' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
