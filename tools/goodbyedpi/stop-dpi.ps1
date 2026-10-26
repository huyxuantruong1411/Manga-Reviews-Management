# Stop GoodbyeDPI and unload the WinDivert driver (elevates via UAC if needed).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/goodbyedpi/stop-dpi.ps1

. "$PSScriptRoot\_common.ps1"
Exit-IfNotWindows

$hasDriver = [bool](Get-Service -Name 'WinDivert*' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' })
if (-not (Get-DpiProcess) -and -not $hasDriver) {
    Write-Host '[goodbyedpi] Not running. Nothing to stop.' -ForegroundColor Green
    exit 0
}

$stopCmd = "Stop-Process -Name 'goodbyedpi' -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500; " +
    "sc.exe stop WinDivert > `$null 2>&1; sc.exe stop WinDivert1.4 > `$null 2>&1"

try {
    if (Test-DpiIsAdmin) {
        Invoke-Expression $stopCmd
    } else {
        Write-Host '[goodbyedpi] Requesting Administrator rights to stop (accept the UAC prompt) ...' -ForegroundColor Yellow
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$stopCmd`"" `
            -Verb RunAs -WindowStyle Hidden -Wait
    }
} catch {
    Write-Host "[goodbyedpi] Failed to stop (UAC declined?): $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1
$proc = Get-DpiProcess
if ($proc) {
    Write-Host "[goodbyedpi] Still running (PID: $($proc.Id -join ', '))." -ForegroundColor Red
    exit 1
}
Write-Host '[goodbyedpi] Stopped. WinDivert driver unloaded.' -ForegroundColor Green
exit 0
