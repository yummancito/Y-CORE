# ============================================================================
# configure-all-games.ps1
# Configura TODOS los juegos con steam_appid.txt y steam_settings/
# ============================================================================

$games = @{
    "BeamNG.drive" = "284160"
    "Black Mesa" = "362890"
    "Counter-Strike Source" = "240"
    "Left 4 Dead 2" = "550"
    "Overwatch" = "10"
    "ARC Raiders" = "2559590"
}

$steamPath = "C:\Program Files (x86)\Steam\steamapps\common"

foreach ($game in $games.GetEnumerator()) {
    $gameName = $game.Key
    $appId = $game.Value
    $gamePath = Join-Path $steamPath $gameName

    if (Test-Path $gamePath) {
        Write-Host "Configurando: $gameName (AppId: $appId)" -ForegroundColor Cyan

        # Crear steam_appid.txt
        $appIdFile = Join-Path $gamePath "steam_appid.txt"
        $appId | Out-File -FilePath $appIdFile -Encoding ASCII -Force

        # Crear steam_settings/
        $settingsDir = Join-Path $gamePath "steam_settings"
        if (!(Test-Path $settingsDir)) {
            mkdir $settingsDir -Force | Out-Null
        }

        # Crear archivos de configuración
        "1" | Out-File -FilePath (Join-Path $settingsDir "offline.txt") -Encoding ASCII -Force
        "1" | Out-File -FilePath (Join-Path $settingsDir "disable_overlay.txt") -Encoding ASCII -Force
        "YCorePlayer" | Out-File -FilePath (Join-Path $settingsDir "force_account_name.txt") -Encoding ASCII -Force
        $appId | Out-File -FilePath (Join-Path $settingsDir "appid.txt") -Encoding ASCII -Force

        Write-Host "  ✓ $gameName configurado" -ForegroundColor Green
    } else {
        Write-Host "  ✗ No encontrado: $gamePath" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "✓ TODOS LOS JUEGOS CONFIGURADOS" -ForegroundColor Green
Write-Host ""
Write-Host "Ahora los juegos deberían:"
Write-Host "  1. Detectar steam_api64.dll (OpenSteamTool)"
Write-Host "  2. NO pedir 'compra este juego'"
Write-Host "  3. Funcionar con OnlineFix"
