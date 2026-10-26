# Shared helpers for GoodbyeDPI lifecycle scripts.
# Dot-source this file:  . "$PSScriptRoot\_common.ps1"
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 reads BOM-less files as ANSI).

$ErrorActionPreference = 'Stop'

$script:DpiRoot = $PSScriptRoot
$script:DpiBinDir = Join-Path $DpiRoot 'bin'
$script:DpiExe64 = Join-Path $DpiBinDir 'x86_64\goodbyedpi.exe'
$script:DpiExe86 = Join-Path $DpiBinDir 'x86\goodbyedpi.exe'
$script:DpiLogFile = Join-Path $DpiBinDir 'goodbyedpi.log'
$script:RepoRoot = (Resolve-Path (Join-Path $DpiRoot '..\..')).Path

# Tuned for Vietnamese ISPs (FPT / Viettel / VNPT): SNI fragmentation + fake packets (-9)
# and DNS redirection to a non-standard port to dodge DNS poisoning.
$script:DefaultDpiArgs = '-9 --dns-addr 77.88.8.8 --dns-port 1253 --dnsv6-addr 2a02:6b8::feed:0ff --dnsv6-port 1253'

function Test-DpiIsWindows {
    if (Get-Variable -Name IsWindows -ErrorAction SilentlyContinue) {
        return [bool]$IsWindows
    }
    return $env:OS -eq 'Windows_NT'
}

function Exit-IfNotWindows {
    if (-not (Test-DpiIsWindows)) {
        Write-Host '[goodbyedpi] GoodbyeDPI only supports Windows. Skipping (no-op).' -ForegroundColor Yellow
        exit 0
    }
}

function Test-DpiIsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-DpiExePath {
    if ([Environment]::Is64BitOperatingSystem) { return $DpiExe64 }
    return $DpiExe86
}

function Get-DpiProcess {
    return Get-Process -Name 'goodbyedpi' -ErrorAction SilentlyContinue
}

function Read-DotEnvValue {
    param([string]$Path, [string]$Key)
    if (-not (Test-Path $Path)) { return $null }
    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        if ($trimmed -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            $value = $Matches[1].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            if ($value -ne '') { return $value }
        }
    }
    return $null
}

# Resolution order: process env var > repo-root .env > backend/.env > built-in default.
function Get-DpiArguments {
    if ($env:GOODBYEDPI_ARGS) { return $env:GOODBYEDPI_ARGS }
    foreach ($envFile in @((Join-Path $RepoRoot '.env'), (Join-Path $RepoRoot 'backend\.env'))) {
        $value = Read-DotEnvValue -Path $envFile -Key 'GOODBYEDPI_ARGS'
        if ($value) { return $value }
    }
    return $DefaultDpiArgs
}
