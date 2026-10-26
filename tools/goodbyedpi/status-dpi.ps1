# Report GoodbyeDPI process / WinDivert driver state and test reachability of blocked manga APIs.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/goodbyedpi/status-dpi.ps1

. "$PSScriptRoot\_common.ps1"
Exit-IfNotWindows

$exitCode = 0

Write-Host '=== GoodbyeDPI status ==='
Write-Host ("Installed : {0}" -f $(if (Test-Path (Get-DpiExePath)) { "yes ($(Get-DpiExePath))" } else { 'no (run dpi:install)' }))

$proc = Get-DpiProcess
if ($proc) {
    Write-Host "Process   : Running (PID: $($proc.Id -join ', '))" -ForegroundColor Green
} else {
    Write-Host 'Process   : Stopped' -ForegroundColor Yellow
}

$services = Get-Service -Name 'WinDivert*' -ErrorAction SilentlyContinue
if ($services) {
    foreach ($svc in $services) { Write-Host "Driver    : $($svc.Name) = $($svc.Status)" }
} else {
    Write-Host 'Driver    : WinDivert service not registered'
}
Write-Host "Args      : $(Get-DpiArguments)"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$targets = @(
    'https://api.mangadex.org/ping',
    'https://uploads.mangadex.org/'
)

Write-Host ''
Write-Host '=== Connectivity test (timeout 5s) ==='
foreach ($url in $targets) {
    try {
        $resp = Invoke-WebRequest -Uri $url -TimeoutSec 5 -UseBasicParsing -Method Get
        Write-Host ("[OK]   {0} -> HTTP {1}" -f $url, [int]$resp.StatusCode) -ForegroundColor Green
    } catch {
        $httpResp = $_.Exception.Response
        if ($httpResp -and $httpResp.StatusCode) {
            # An HTTP status (even 4xx) means TLS handshake passed: the block is bypassed.
            Write-Host ("[OK]   {0} -> HTTP {1} (reachable)" -f $url, [int]$httpResp.StatusCode) -ForegroundColor Green
        } else {
            Write-Host ("[FAIL] {0} -> {1}" -f $url, $_.Exception.Message) -ForegroundColor Red
            $exitCode = 1
        }
    }
}

exit $exitCode
