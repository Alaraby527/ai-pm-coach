$ErrorActionPreference = "Stop"

try {
    $coachNode = (Get-Command node -ErrorAction Stop).Source
} catch {
    Write-Host "Node.js was not found. Install Node.js 24 or newer." -ForegroundColor Red
    exit 1
}

$coachPrompt = if ($env:AI_API_KEY -or $env:DEEPSEEK_API_KEY) {
    "Existing model key found. Enter a new DeepSeek API Key, or press Enter to keep it"
} else {
    "Enter DeepSeek API Key (used only for this run)"
}
$coachSecret = Read-Host $coachPrompt -AsSecureString
$coachPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($coachSecret)
try {
    $coachNewKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($coachPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($coachPointer)
}
if ($coachNewKey) { $env:AI_API_KEY = $coachNewKey }
if (-not $env:AI_API_KEY -and -not $env:DEEPSEEK_API_KEY) { throw "No API Key was provided." }

$coachListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$coachListener.Start()
$coachPort = $coachListener.LocalEndpoint.Port
$coachListener.Stop()
$coachUrl = "http://127.0.0.1:$coachPort"
$coachServer = Start-Process -FilePath $coachNode -ArgumentList @("--use-env-proxy", "$PSScriptRoot\server.js", $coachPort) -WindowStyle Hidden -PassThru

try {
    for ($coachAttempt = 0; $coachAttempt -lt 30; $coachAttempt++) {
        try {
            Invoke-RestMethod "$coachUrl/api/health" -TimeoutSec 1 | Out-Null
            break
        } catch {
            Start-Sleep -Milliseconds 200
        }
    }
    if ($coachServer.HasExited) { throw "The local server failed to start." }
    Start-Process $coachUrl
    Write-Host "AI PM Coach started: $coachUrl" -ForegroundColor Green
    Read-Host "Keep this window open. Press Enter to stop the server"
} finally {
    if (-not $coachServer.HasExited) { Stop-Process -Id $coachServer.Id }
}

