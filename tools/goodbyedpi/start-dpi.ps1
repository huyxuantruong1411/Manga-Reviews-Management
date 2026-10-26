# Start GoodbyeDPI in the background with Administrator rights (UAC prompt if needed).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/goodbyedpi/start-dpi.ps1
# Override arguments with GOODBYEDPI_ARGS (env var, .env or backend/.env).

. "$PSScriptRoot\_common.ps1"
Exit-IfNotWindows

$exePath = Get-DpiExePath
if (-not (Test-Path $exePath)) {
    Write-Host '[goodbyedpi] Not installed yet. Running install-dpi.ps1 ...'
    & "$PSScriptRoot\install-dpi.ps1"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exePath)) {
        Write-Host '[goodbyedpi] Installation failed. Aborting start.' -ForegroundColor Red
        exit 1
    }
}

$running = Get-DpiProcess
if ($running) {
    Write-Host "[goodbyedpi] Already running (PID: $($running.Id -join ', '))." -ForegroundColor Green
    exit 0
}

$dpiArgs = Get-DpiArguments
$exeDir = Split-Path $exePath -Parent
if (Test-Path $DpiLogFile) { Remove-Item -Force $DpiLogFile -ErrorAction SilentlyContinue }

# Wrap in cmd.exe so the hidden, elevated process still writes diagnostics to a log file.
$cmdLine = "/c `"`"$exePath`" $dpiArgs > `"$DpiLogFile`" 2>&1`""
$startParams = @{
    FilePath         = 'cmd.exe'
    ArgumentList     = $cmdLine
    WorkingDirectory = $exeDir
    WindowStyle      = 'Hidden'
}

if (Test-DpiIsAdmin) {
    Write-Host '[goodbyedpi] Terminal is elevated. Starting directly ...'
} else {
    Write-Host '[goodbyedpi] Requesting Administrator rights (accept the UAC prompt) ...' -ForegroundColor Yellow
    $startParams['Verb'] = 'RunAs'
}

Write-Host "[goodbyedpi] Args: $dpiArgs"
try {
    Start-Process @startParams | Out-Null
} catch {
    Write-Host "[goodbyedpi] Failed to start: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Message -match 'not supported') {
        Write-Host '[goodbyedpi] This terminal cannot show a UAC prompt (sandboxed / non-interactive session).' -ForegroundColor Yellow
        Write-Host '[goodbyedpi] Double-click tools\goodbyedpi\start-dpi.cmd, or run this from an Administrator terminal.' -ForegroundColor Yellow
    } else {
        Write-Host '[goodbyedpi] Was the UAC prompt declined?' -ForegroundColor Yellow
    }
    exit 1
}

$proc = $null
for ($i = 0; $i -lt 10 -and -not $proc; $i++) {
    Start-Sleep -Milliseconds 500
    $proc = Get-DpiProcess
}
# Give the driver a moment: an early crash (e.g. WinDivert load failure) exits within ~1s.
Start-Sleep -Seconds 2
$proc = Get-DpiProcess

if ($proc) {
    Write-Host "[goodbyedpi] Running (PID: $($proc.Id -join ', '))." -ForegroundColor Green
    exit 0
}

Write-Host '[goodbyedpi] Process is not running after start.' -ForegroundColor Red
if (Test-Path $DpiLogFile) {
    Write-Host '----- goodbyedpi.log -----'
    Get-Content $DpiLogFile -Tail 30 | ForEach-Object { Write-Host $_ }
    Write-Host '--------------------------'
}
exit 1
