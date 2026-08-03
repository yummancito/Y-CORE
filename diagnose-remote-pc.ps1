# ============================================================================
# Y-CORE REMOTE PC DIAGNOSTIC — Análisis exhaustivo de Steam + Y-core
# ============================================================================
# Uso: powershell -ExecutionPolicy Bypass -File diagnose-remote-pc.ps1
# ============================================================================

param(
    [string]$OutputFile = "$env:TEMP\ycore-diagnosis-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
)

$diagnostics = @()

function Log {
    param([string]$Message)
    Write-Host $Message
    $diagnostics += $Message
}

function Section {
    param([string]$Title)
    Log "`n$('='*80)`n$Title`n$('='*80)"
}

function Divider {
    Log $('─'*80)
}

# ============================================================================
# WINDOWS + SISTEMA
# ============================================================================
Section "1. INFORMACIÓN DEL SISTEMA"

$osInfo = Get-WmiObject Win32_OperatingSystem
Log "OS: $($osInfo.Caption)"
Log "Versión: $($osInfo.Version)"
Log "Arquitectura: $($osInfo.OSArchitecture)"
Log "Nombre PC: $env:COMPUTERNAME"
Log "Usuario: $env:USERNAME"

$cpuInfo = Get-WmiObject Win32_Processor | Select-Object -First 1
Log "CPU: $($cpuInfo.Name)"
Log "Núcleos: $($cpuInfo.NumberOfCores)"

$memInfo = Get-WmiObject Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum
Log "RAM Total: $([math]::Round($memInfo.Sum/1GB, 2)) GB"

$diskInfo = Get-PSDrive C | Select-Object Used, Free
Log "Disco C: $('{0:0.0} GB / {1:0.0} GB' -f ($diskInfo.Used/1GB), (($diskInfo.Used + $diskInfo.Free)/1GB))"

# ============================================================================
# STEAM INSTALACIÓN
# ============================================================================
Section "2. STEAM LOCALIZACIÓN Y CONFIGURACIÓN"

$steamPaths = @(
    "C:\Program Files (x86)\Steam",
    "C:\Program Files\Steam",
    "$env:ProgramFiles\Steam",
    "$env:ProgramFiles (x86)\Steam"
)

$steamPath = $null
foreach ($path in $steamPaths) {
    if (Test-Path "$path\steam.exe") {
        $steamPath = $path
        break
    }
}

if ($steamPath) {
    Log "✓ Steam encontrado: $steamPath"
    $steamExe = Get-Item "$steamPath\steam.exe"
    Log "  Tamaño: $($steamExe.Length) bytes"
    Log "  Modificado: $($steamExe.LastWriteTime)"
} else {
    Log "✗ Steam NO ENCONTRADO"
    $env:Path -split ';' | ForEach-Object {
        if (Test-Path "$_\steam.exe") {
            Log "  Encontrado en PATH: $_"
        }
    }
}

# Steam config.vdf
if ($steamPath) {
    $configVdf = "$steamPath\config\config.vdf"
    if (Test-Path $configVdf) {
        $configSize = (Get-Item $configVdf).Length
        Log "✓ config.vdf encontrado ($configSize bytes)"

        # Buscar BaseInstallFolder (rutas de bibliotecas)
        $configContent = Get-Content $configVdf -Raw
        $libraries = @()
        if ($configContent -match '"BaseInstallFolder"\s+"([^"]+)"') {
            $libraries += $matches[1]
        }
        $configContent | Select-String '"path"\s+"([^"]+)"' -AllMatches | ForEach-Object {
            $_.Matches | ForEach-Object {
                $libraries += $_.Groups[1].Value
            }
        }

        if ($libraries.Count -gt 0) {
            Log "  Bibliotecas Steam encontradas:"
            $libraries | ForEach-Object { Log "    - $_" }
        }
    } else {
        Log "✗ config.vdf NO ENCONTRADO"
    }

    # depotcache
    $depotCache = "$steamPath\depotcache"
    if (Test-Path $depotCache) {
        $depotCount = (Get-ChildItem $depotCache -ErrorAction SilentlyContinue | Measure-Object).Count
        $depotSize = (Get-ChildItem $depotCache -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        Log "✓ depotcache: $depotCount archivos ($([math]::Round($depotSize/1MB, 2)) MB)"
    } else {
        Log "⚠ depotcache NO ENCONTRADO (normal si nunca se descargó nada)"
    }
}

# ============================================================================
# STEAM PROCESOS
# ============================================================================
Section "3. PROCESOS DE STEAM"

$steamProcs = Get-Process steam, steamwebhelper -ErrorAction SilentlyContinue
if ($steamProcs.Count -gt 0) {
    Log "✓ Steam ESTÁ CORRIENDO:"
    $steamProcs | ForEach-Object {
        $mem = [math]::Round($_.WorkingSet/1MB, 2)
        Log "  - $($_.ProcessName) (PID: $($_.Id), RAM: ${mem}MB)"
    }
} else {
    Log "✓ Steam no está corriendo (esto es OK)"
}

# ============================================================================
# Y-CORE INSTALACIÓN
# ============================================================================
Section "4. Y-CORE LOCALIZACIÓN"

$ycorePaths = @(
    "$env:ProgramFiles\Y-core",
    "$env:ProgramFiles (x86)\Y-core",
    "$env:APPDATA\..\Local\Programs\Y-core",
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Y-core"
)

$ycorePath = $null
foreach ($path in $ycorePaths) {
    if (Test-Path "$path\Y-core.exe") {
        $ycorePath = $path
        break
    }
}

if ($ycorePath) {
    Log "✓ Y-core encontrado: $ycorePath"
    $ycoreExe = Get-Item "$ycorePath\Y-core.exe"
    Log "  Tamaño: $($ycoreExe.Length) bytes"
    Log "  Modificado: $($ycoreExe.LastWriteTime)"

    # Verificar recursos empaquetados
    $resourcesPath = "$ycorePath\resources"
    if (Test-Path $resourcesPath) {
        Log "✓ Carpeta resources encontrada"

        # Buscar DLLs de Y-core
        $dllPaths = @(
            "$resourcesPath\app.asar\native\opensteamtool\YCoreTool.dll",
            "$resourcesPath\app.asar\native\opensteamtool\dwmapi.dll",
            "$resourcesPath\app.asar\native\opensteamtool\xinput1_4.dll",
            "$resourcesPath\native\ycore_steam.dll",
            "$resourcesPath\native\ycore.dll"
        )

        foreach ($dll in $dllPaths) {
            if (Test-Path $dll) {
                $dllInfo = Get-Item $dll
                Log "  ✓ $(Split-Path $dll -Leaf): $($dllInfo.Length) bytes"
            } else {
                Log "  ✗ $(Split-Path $dll -Leaf): NO ENCONTRADO"
            }
        }
    } else {
        Log "✗ Carpeta resources NO ENCONTRADA"
    }
} else {
    Log "✗ Y-core NO INSTALADO"
}

# ============================================================================
# Y-CORE LOGS
# ============================================================================
Section "5. Y-CORE LOGS RECIENTES"

$logsPath = "$env:APPDATA\..\Local\Y-core\logs\ycore.log"
if (Test-Path $logsPath) {
    $logSize = (Get-Item $logsPath).Length
    Log "✓ Archivo log encontrado ($([math]::Round($logSize/1MB, 2)) MB)"
    Log "  Últimas 100 líneas:"
    Log ""

    $lastLines = Get-Content $logsPath -Tail 100 -ErrorAction SilentlyContinue
    $lastLines | ForEach-Object { Log "  $_" }
} else {
    Log "✗ Log file NO ENCONTRADO"
}

# ============================================================================
# STEAM HOOK DLLs (EN STEAM FOLDER)
# ============================================================================
Section "6. STEAM HOOK DLLs (en carpeta Steam)"

if ($steamPath) {
    $hookDlls = @("YCoreTool.dll", "dwmapi.dll", "xinput1_4.dll", "steamtools_hook.dll", "OpenSteamTool.dll")
    $hookFound = $false

    foreach ($dll in $hookDlls) {
        $dllPath = "$steamPath\$dll"
        if (Test-Path $dllPath) {
            $dllInfo = Get-Item $dllPath
            Log "✓ $dll encontrado ($($dllInfo.Length) bytes)"
            Log "  Modificado: $($dllInfo.LastWriteTime)"
            $hookFound = $true
        }
    }

    if (-not $hookFound) {
        Log "✗ NINGÚN hook DLL encontrado en Steam folder"
        Log "  Esto significa que el hook NUNCA se instaló"
    }

    # Buscar hook_consent.txt
    $consentFile = "$steamPath\ycoretool\hook_consent.txt"
    if (Test-Path $consentFile) {
        Log "✓ hook_consent.txt encontrado (usuario dio consentimiento)"
    } else {
        Log "✗ hook_consent.txt NO ENCONTRADO (nunca se instaló hook)"
    }
} else {
    Log "⚠ No se puede verificar hook DLLs (Steam no encontrado)"
}

# ============================================================================
# DEFENDER / ANTIVIRUS
# ============================================================================
Section "7. WINDOWS DEFENDER / ANTIVIRUS"

try {
    $defenderStatus = Get-MpComputerStatus -ErrorAction SilentlyContinue
    if ($defenderStatus) {
        Log "✓ Windows Defender detectado"
        Log "  Estado: $($defenderStatus.AntivirusEnabled)"
        Log "  Real-time protection: $($defenderStatus.RealTimeProtectionEnabled)"

        # Buscar cuarentenas
        $quarantine = Get-MpPreference -ErrorAction SilentlyContinue | Select-Object QuarantinePath
        if ($quarantine) {
            $quarantineItems = Get-ChildItem $quarantine.QuarantinePath -ErrorAction SilentlyContinue | Measure-Object
            Log "  Items en cuarentena: $($quarantineItems.Count)"

            if ($quarantineItems.Count -gt 0) {
                Get-ChildItem $quarantine.QuarantinePath -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -match "ycore|steam|hook|dwmapi|xinput" } |
                    ForEach-Object { Log "    ⚠ CUARENTENADO: $($_.Name)" }
            }
        }
    }
} catch {
    Log "⚠ No se pudo acceder a Defender (permisos insuficientes)"
}

# ============================================================================
# PERMISOS Y ACCESO
# ============================================================================
Section "8. PERMISOS (Steam folder)"

if ($steamPath) {
    try {
        $acl = Get-Acl $steamPath
        $owner = $acl.Owner
        Log "✓ Propietario: $owner"

        # Verificar si el usuario actual puede escribir
        $testFile = "$steamPath\.ycore-write-test-$([DateTime]::Now.Ticks).txt"
        try {
            "test" | Out-File $testFile -Force -ErrorAction Stop
            Remove-Item $testFile -ErrorAction SilentlyContinue
            Log "✓ Usuario actual PUEDE escribir en Steam folder"
        } catch {
            Log "✗ Usuario actual NO PUEDE escribir en Steam folder"
            Log "  Error: $($_.Exception.Message)"
        }
    } catch {
        Log "⚠ No se pudo verificar permisos (permisos insuficientes)"
    }
}

# ============================================================================
# VERSIONES DE Y-CORE
# ============================================================================
Section "9. VERSIÓN Y-CORE Y ELECTRON"

if ($ycorePath) {
    $packageJson = "$ycorePath\resources\app.asar\package.json"
    if (Test-Path $packageJson) {
        Log "⚠ package.json está empaquetado en ASAR (no se puede leer)"
    }

    # Intentar leer de instalador o metadata
    $installerInfo = Get-Item "$ycorePath\Y-core.exe" -ErrorAction SilentlyContinue
    if ($installerInfo) {
        $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($installerInfo.FullName)
        Log "✓ Y-core.exe Version: $($versionInfo.FileVersion)"
        Log "  Product: $($versionInfo.ProductVersion)"
    }
} else {
    Log "⚠ No se puede verificar versión (Y-core no encontrado)"
}

# ============================================================================
# NETWORK / CONECTIVIDAD
# ============================================================================
Section "10. CONECTIVIDAD"

try {
    $testConnection = Test-Connection 8.8.8.8 -Count 1 -ErrorAction SilentlyContinue
    if ($testConnection) {
        Log "✓ Conexión a internet OK"
    } else {
        Log "✗ Sin conexión a internet"
    }
} catch {
    Log "⚠ No se pudo verificar conexión"
}

# DNS resolution
try {
    $steamResolve = [System.Net.Dns]::GetHostAddresses("steampowered.com")
    if ($steamResolve.Count -gt 0) {
        Log "✓ DNS resuelve steampowered.com"
    }
} catch {
    Log "✗ No se puede resolver steampowered.com"
}

# ============================================================================
# SUMMARY
# ============================================================================
Section "11. RESUMEN Y RECOMENDACIONES"

$issues = @()

if (-not $steamPath) { $issues += "❌ Steam no está instalado" }
if (-not $ycorePath) { $issues += "❌ Y-core no está instalado" }

if ($steamPath -and $ycorePath) {
    $hookDllPath = "$steamPath\YCoreTool.dll"
    if (-not (Test-Path $hookDllPath)) {
        $issues += "❌ Hook DLL (YCoreTool.dll) NO está instalado en Steam folder"
        $issues += "   → Esto explica por qué juegos muestran 'Comprar' en vez de 'Jugar'"
    }

    $consentPath = "$steamPath\ycoretool\hook_consent.txt"
    if (-not (Test-Path $consentPath)) {
        $issues += "⚠️  Usuario NO dio consentimiento para instalar hook automáticamente"
        $issues += "   → Necesita: Configuración → Steam → Verificar"
    }
}

if ($issues.Count -eq 0) {
    Log "✅ NO SE ENCONTRARON PROBLEMAS EVIDENTES"
} else {
    Log "⚠️  PROBLEMAS ENCONTRADOS:"
    $issues | ForEach-Object { Log "   $_" }
}

Log "`n"
Log "RECOMENDACIONES:"
Log "1. Si viste '❌ Steam Hook DLL NO está instalado':"
Log "   → Abre Y-core → Configuración → Steam → Botón 'Verificar'"
Log "   → Esto forzará la instalación del hook"
Log ""
Log "2. Si seguía sin funcionar después del verificar:"
Log "   → Desinstala Y-core completamente"
Log "   → Elimina: C:\Users\$env:USERNAME\AppData\Local\Y-core\"
Log "   → Reinstala la última versión desde GitHub"
Log ""
Log "3. Si Defender puso algo en cuarentena:"
Log "   → Abre Defender → Historial → Recupera los archivos"
Log ""

# ============================================================================
# GUARDAR RESULTADOS
# ============================================================================

$diagnostics | Out-File -FilePath $OutputFile -Encoding UTF8 -Force
Log "`n✅ Diagnóstico completo guardado en: $OutputFile"
Log "   Comparte este archivo con el equipo de Y-core"
