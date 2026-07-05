$ErrorActionPreference = "Stop"

param(
    [string]$ManifestGid = "2433595362169971478",
    [string[]]$ApiBases = @(
        "http://localhost:3000/api/manifests",
        "https://manifest.steam.run/api/manifest",
        "https://manifest.opensteamtool.com"
    )
)

foreach ($base in $ApiBases) {
    $api = "$base/$ManifestGid"
    Write-Host "Testing: $api"
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "Mozilla/5.0")
        $result = $wc.DownloadString($api)
        Write-Host "  SUCCESS: $result"
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)"
    }
    Write-Host ""
}
