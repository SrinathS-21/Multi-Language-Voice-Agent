# External health check script for Render.com (PowerShell)
# Can be used with Windows Task Scheduler or external monitoring

param(
    [string]$ServiceUrl = "https://livekit-sarvam-agent.onrender.com",
    [int]$Timeout = 10
)

$ErrorActionPreference = "Stop"

$HealthEndpoint = "$ServiceUrl/health"

Write-Host "🏥 Checking health of: $ServiceUrl" -ForegroundColor Cyan
Write-Host "Endpoint: $HealthEndpoint" -ForegroundColor Gray
Write-Host "Timeout: ${Timeout}s" -ForegroundColor Gray
Write-Host ""

try {
    # Perform health check with timeout
    $Response = Invoke-RestMethod -Uri $HealthEndpoint -TimeoutSec $Timeout -ErrorAction Stop
    
    if ($Response.status -eq "healthy") {
        Write-Host "✅ Health check PASSED" -ForegroundColor Green
        Write-Host "Response: $($Response | ConvertTo-Json -Compress)" -ForegroundColor Gray
        exit 0
    } else {
        Write-Host "⚠️  Health check returned unexpected status: $($Response.status)" -ForegroundColor Yellow
        Write-Host "Response: $($Response | ConvertTo-Json)" -ForegroundColor Gray
        exit 1
    }
}
catch {
    Write-Host "❌ Health check FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
