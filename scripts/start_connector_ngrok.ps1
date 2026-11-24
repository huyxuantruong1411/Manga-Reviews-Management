<#
.SYNOPSIS
    Starts the isolated External Source Connector (port 8001) and exposes it via ngrok HTTPS
    so the downstream Manga Reader system (QL-DocTruyen) can connect and run ETL/CDC ingestion.

.EXAMPLE
    .\scripts\start_connector_ngrok.ps1 -InitSecrets
.EXAMPLE
    .\scripts\start_connector_ngrok.ps1 -Domain my-manga-source.ngrok-free.app
.EXAMPLE
    .\scripts\start_connector_ngrok.ps1 -UseMainBackend
#>
[CmdletBinding()]
param(
    [int]$Port = 8001,
    [switch]$UseMainBackend,
    [string]$Domain = "",
    [switch]$InitSecrets,
    [switch]$SkipVerify,
    [switch]$Detach
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvFile = Join-Path $RepoRoot "backend\.env"

function Get-EnvMap([string]$Path) {
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $idx = $trimmed.IndexOf("=")
        if ($idx -gt 0) {
            $k = $trimmed.Substring(0, $idx).Trim()
            $v = $trimmed.Substring($idx + 1).Trim().Trim('"').Trim("'")
            $map[$k] = $v
        }
    }
    return $map
}

function New-RandomHexSecret([int]$Bytes = 24) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $Bytes
    $rng.GetBytes($buf)
    return ([System.BitConverter]::ToString($buf) -replace "-", "").ToLowerInvariant()
}

function Upsert-EnvKey([string]$Path, [string]$Key, [string]$Value) {
    if (-not (Test-Path $Path)) {
        Set-Content -Path $Path -Value "$Key=$Value" -Encoding UTF8
        return
    }
    $lines = Get-Content $Path
    $found = $false
    $updated = foreach ($line in $lines) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
            $found = $true
            "$Key=$Value"
        } else {
            $line
        }
    }
    if (-not $found) {
        $updated = @($updated) + "" + "$Key=$Value"
    }
    Set-Content -Path $Path -Value $updated -Encoding UTF8
}

if ($UseMainBackend) {
    $Port = 8000
}

# 1. Verify prerequisites
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Error "ngrok CLI was not found in PATH. Install ngrok (https://ngrok.com/download) and run 'ngrok config add-authtoken <token>'."
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Error "uv CLI was not found in PATH."
}

# 2. Ensure CONNECTOR_API_KEY & CONNECTOR_WEBHOOK_SECRET in untracked backend/.env
$envMap = Get-EnvMap $EnvFile
$apiKey = $envMap["CONNECTOR_API_KEY"]
$webhookSecret = $envMap["CONNECTOR_WEBHOOK_SECRET"]

$placeholderValues = @("", "replace_with_strong_random_connector_api_key", "replace_with_strong_random_webhook_hmac_secret")
$needsApiKey = ($null -eq $apiKey) -or ($placeholderValues -contains $apiKey)
$needsWebhookSecret = ($null -eq $webhookSecret) -or ($placeholderValues -contains $webhookSecret)

if ($needsApiKey -or $needsWebhookSecret) {
    if ($InitSecrets) {
        if ($needsApiKey) {
            $apiKey = "mconn_" + (New-RandomHexSecret 24)
            Upsert-EnvKey -Path $EnvFile -Key "CONNECTOR_API_KEY" -Value $apiKey
            Write-Host "[INIT] Generated CONNECTOR_API_KEY in backend/.env" -ForegroundColor Green
        }
        if ($needsWebhookSecret) {
            $webhookSecret = "whsec_" + (New-RandomHexSecret 24)
            Upsert-EnvKey -Path $EnvFile -Key "CONNECTOR_WEBHOOK_SECRET" -Value $webhookSecret
            Write-Host "[INIT] Generated CONNECTOR_WEBHOOK_SECRET in backend/.env" -ForegroundColor Green
        }
    } else {
        Write-Error "CONNECTOR_API_KEY / CONNECTOR_WEBHOOK_SECRET not configured in backend/.env. Re-run with -InitSecrets to generate strong keys automatically."
    }
}

$connectorProc = $null
$ngrokProc = $null

try {
    # 3. Boot isolated Connector ASGI server (unless already listening)
    $portOpen = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet
    if (-not $portOpen) {
        if ($UseMainBackend) {
            Write-Host "[1/3] Starting main backend on 127.0.0.1:$Port (Tunnel Path Guard active)..." -ForegroundColor Cyan
            $appTarget = "backend.main:app"
        } else {
            Write-Host "[1/3] Starting isolated External Source Connector (backend.connector_app:app) on 127.0.0.1:$Port..." -ForegroundColor Cyan
            $appTarget = "backend.connector_app:app"
        }
        $connectorProc = Start-Process -FilePath "uv" `
            -ArgumentList @("run", "--project", "backend", "uvicorn", $appTarget, "--host", "127.0.0.1", "--port", "$Port") `
            -WorkingDirectory $RepoRoot `
            -PassThru `
            -WindowStyle Hidden

        $ready = $false
        for ($i = 0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
                if ($h.status -eq "ok") { $ready = $true; break }
            } catch {}
        }
        if (-not $ready) {
            throw "Connector server did not become healthy on http://127.0.0.1:$Port/health within 20s."
        }
        Write-Host "[OK] Connector server healthy at http://127.0.0.1:$Port" -ForegroundColor Green
    } else {
        Write-Host "[1/3] Reusing running server on http://127.0.0.1:$Port" -ForegroundColor Yellow
    }

    # 4. Launch ngrok tunnel targeting 127.0.0.1:$Port (or reuse existing matching tunnel)
    $publicUrl = $null
    try {
        $existingTunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
        $matchTunnel = $existingTunnels.tunnels | Where-Object {
            $_.proto -eq "https" -and ($_.config.addr -match ":$Port$")
        } | Select-Object -First 1
        if ($matchTunnel -and $matchTunnel.public_url) {
            $publicUrl = $matchTunnel.public_url.TrimEnd("/")
            Write-Host "[2/3] Reusing active ngrok tunnel -> $publicUrl ($($matchTunnel.config.addr))" -ForegroundColor Yellow
        }
    } catch {}

    if (-not $publicUrl) {
        Write-Host "[2/3] Launching ngrok tunnel -> http://127.0.0.1:$Port..." -ForegroundColor Cyan
        $ngrokArgs = @("http", "http://127.0.0.1:$Port")
        if ($Domain) {
            $ngrokArgs += @("--domain=$Domain")
        }
        $ngrokProc = Start-Process -FilePath "ngrok" `
            -ArgumentList $ngrokArgs `
            -WorkingDirectory $RepoRoot `
            -PassThru `
            -WindowStyle Hidden

        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $tunnelsResp = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
                $httpsTunnel = $tunnelsResp.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
                if ($httpsTunnel -and $httpsTunnel.public_url) {
                    $publicUrl = $httpsTunnel.public_url.TrimEnd("/")
                    break
                }
            } catch {}
        }
        if (-not $publicUrl) {
            throw "Could not obtain ngrok public HTTPS URL from http://127.0.0.1:4040/api/tunnels. Verify 'ngrok config check' and authtoken."
        }
        Write-Host "[OK] ngrok HTTPS tunnel LIVE: $publicUrl" -ForegroundColor Green
    }

    # 5. Run automated end-to-end ETL verification through the live ngrok HTTPS tunnel
    if (-not $SkipVerify) {
        Write-Host "[3/3] Running live ETL/Media/Security verification through ngrok..." -ForegroundColor Cyan
        & uv run --project backend python scripts/verify_connector_etl.py `
            --base-url $publicUrl `
            --api-key $apiKey `
            --test-cdc
        if ($LASTEXITCODE -ne 0) {
            throw "Live connector verification failed!"
        }
    }

    Write-Host ""
    Write-Host "========================================================================" -ForegroundColor Magenta
    Write-Host " MANGA DATA LAKE -> EXTERNAL SOURCE CONNECTOR IS LIVE" -ForegroundColor Magenta
    Write-Host "========================================================================" -ForegroundColor Magenta
    Write-Host " Public Base URL (ngrok) : $publicUrl"
    Write-Host " Local Target            : http://127.0.0.1:$Port"
    Write-Host " ngrok Inspector UI      : http://127.0.0.1:4040"
    Write-Host " Contract                : manga-reader-package v2.0 (Draft 2020-12)"
    Write-Host ""
    Write-Host " Paste into downstream Reader App (QL-DocTruyen) .env:" -ForegroundColor Yellow
    Write-Host "   UPSTREAM_SOURCE_BASE_URL=$publicUrl"
    Write-Host "   UPSTREAM_SOURCE_API_KEY=<see CONNECTOR_API_KEY in backend/.env>"
    Write-Host "   UPSTREAM_WEBHOOK_SECRET=<see CONNECTOR_WEBHOOK_SECRET in backend/.env>"
    Write-Host ""
    Write-Host " Key Connector Endpoints (send header X-Connector-API-Key & ngrok-skip-browser-warning: true):"
    Write-Host "   GET    $publicUrl/api/connector/v1/info"
    Write-Host "   GET    $publicUrl/api/connector/v1/contract/schema"
    Write-Host "   GET    $publicUrl/api/connector/v1/catalog"
    Write-Host "   GET    $publicUrl/api/connector/v1/packages/{pool_manga_id}"
    Write-Host "   GET    $publicUrl/api/connector/v1/media/{bucket}/{object_key}"
    Write-Host "   POST   $publicUrl/api/connector/v1/cdc/subscriptions"
    Write-Host "   GET    $publicUrl/api/connector/v1/cdc/events"
    Write-Host "========================================================================" -ForegroundColor Magenta

    if ($Detach) {
        Write-Host "[DETACH] Connector PID=$($connectorProc.Id) | ngrok PID=$($ngrokProc.Id)" -ForegroundColor Yellow
        return
    }

    Write-Host "Press Ctrl+C to stop ngrok and the connector server..." -ForegroundColor Gray
    while (-not $ngrokProc.HasExited) {
        Start-Sleep -Seconds 2
    }
} finally {
    if (-not $Detach) {
        if ($ngrokProc -and -not $ngrokProc.HasExited) {
            Stop-Process -Id $ngrokProc.Id -Force -ErrorAction SilentlyContinue
        }
        if ($connectorProc -and -not $connectorProc.HasExited) {
            Stop-Process -Id $connectorProc.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
