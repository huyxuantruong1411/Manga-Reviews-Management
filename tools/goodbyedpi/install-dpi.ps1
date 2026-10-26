# Download and extract the newest official GoodbyeDPI release into tools/goodbyedpi/bin.
# Pre-releases are included by default because the -9 modeset only exists in 0.2.3rc+.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/goodbyedpi/install-dpi.ps1 [-Force] [-StableOnly]
param([switch]$Force, [switch]$StableOnly)

. "$PSScriptRoot\_common.ps1"
Exit-IfNotWindows

if ((Test-Path $DpiExe64) -and -not $Force) {
    Write-Host "[goodbyedpi] Already installed: $DpiExe64 (use -Force to reinstall)." -ForegroundColor Green
    exit 0
}

if ($Force -and (Get-DpiProcess)) {
    Write-Host '[goodbyedpi] GoodbyeDPI is running. Run dpi:stop before reinstalling.' -ForegroundColor Red
    exit 1
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$apiUrl = if ($StableOnly) {
    'https://api.github.com/repos/ValdikSS/GoodbyeDPI/releases/latest'
} else {
    'https://api.github.com/repos/ValdikSS/GoodbyeDPI/releases?per_page=10'
}
Write-Host "[goodbyedpi] Querying $apiUrl ..."
try {
    $response = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'Manga-Reviews-Management-dpi-installer' } -UseBasicParsing
} catch {
    Write-Host "[goodbyedpi] Failed to query GitHub releases: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# The list endpoint is ordered newest-first; skip drafts and releases without a zip asset.
$release = $null
$asset = $null
foreach ($candidate in @($response)) {
    if ($candidate.draft) { continue }
    $zip = $candidate.assets | Where-Object { $_.name -match '^goodbyedpi-.*\.zip$' } | Select-Object -First 1
    if ($zip) { $release = $candidate; $asset = $zip; break }
}
if (-not $asset) {
    Write-Host '[goodbyedpi] No goodbyedpi-*.zip asset found in GitHub releases.' -ForegroundColor Red
    exit 1
}
Write-Host "[goodbyedpi] Release $($release.tag_name) -> $($asset.name) ($([math]::Round($asset.size / 1KB)) KB)"

New-Item -ItemType Directory -Force -Path $DpiBinDir | Out-Null
$zipPath = Join-Path $DpiBinDir 'goodbyedpi.zip'
$extractDir = Join-Path $DpiBinDir '_extract'

try {
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    foreach ($arch in @('x86_64', 'x86')) {
        $src = Get-ChildItem -Path $extractDir -Directory -Recurse | Where-Object { $_.Name -eq $arch } | Select-Object -First 1
        if (-not $src) { throw "Architecture folder '$arch' not found in archive." }
        $dest = Join-Path $DpiBinDir $arch
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Copy-Item -Path $src.FullName -Destination $dest -Recurse
    }

    # Keep upstream blacklist / helper .cmd files for reference.
    $releaseRoot = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    if ($releaseRoot) {
        Get-ChildItem -Path $releaseRoot.FullName -File | Copy-Item -Destination $DpiBinDir -Force
    }
} catch {
    Write-Host "[goodbyedpi] Install failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '[goodbyedpi] Hint: Windows Defender may quarantine WinDivert (flagged as HackTool). Allow it in Protection history if so.' -ForegroundColor Yellow
    exit 1
} finally {
    if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
}

if (-not (Test-Path $DpiExe64)) {
    Write-Host "[goodbyedpi] goodbyedpi.exe missing after extraction (quarantined by antivirus?)." -ForegroundColor Red
    exit 1
}

Write-Host "[goodbyedpi] Installed to $DpiBinDir" -ForegroundColor Green
Get-ChildItem (Join-Path $DpiBinDir 'x86_64') | ForEach-Object { Write-Host "    x86_64\$($_.Name)" }
exit 0
