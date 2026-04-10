# install.ps1 — Register the Claude Code Bridge native messaging host (Windows)
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NativeHostScript = Join-Path $ScriptDir "bridge\native_host.py"
$ManifestTemplate = Join-Path $ScriptDir "host-manifest\com.myapp.bridge.json"

# ── Preflight checks ──────────────────────────────────────────────────────

if (-not (Test-Path $NativeHostScript)) {
    Write-Error "Error: $NativeHostScript not found. Run this script from the project root."
    exit 1
}

$ClaudePath = (Get-Command claude -ErrorAction SilentlyContinue)?.Source
if (-not $ClaudePath) {
    Write-Warning "'claude' not found in PATH. The native host will fail at runtime."
    Write-Warning "Install Claude Code first: https://claude.ai/code"
}

# ── Determine Python path ─────────────────────────────────────────────────

$PythonPath = (Get-Command python3 -ErrorAction SilentlyContinue)?.Source
if (-not $PythonPath) {
    $PythonPath = (Get-Command python -ErrorAction SilentlyContinue)?.Source
}
if (-not $PythonPath) {
    Write-Error "Python not found. Install Python 3.10+ and ensure it is in PATH."
    exit 1
}

# ── Write manifest to a stable location ──────────────────────────────────

$ManifestDir = Join-Path $env:APPDATA "Claude Code Bridge"
New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null

# Build the wrapper script path: "python absolute\path\to\native_host.py"
# Chrome requires "path" to be an executable, so we wrap via a .bat file.
$BatPath = Join-Path $ManifestDir "run_native_host.bat"
@"
@echo off
"$PythonPath" "$NativeHostScript" %*
"@ | Set-Content $BatPath -Encoding ASCII

# Substitute path in manifest
$ManifestContent = Get-Content $ManifestTemplate -Raw
$ManifestContent = $ManifestContent -replace '__NATIVE_HOST_PATH__', ($BatPath -replace '\\', '\\')
$FinalManifestPath = Join-Path $ManifestDir "com.myapp.bridge.json"
$ManifestContent | Set-Content $FinalManifestPath -Encoding UTF8

# ── Register in the Windows registry ─────────────────────────────────────

$RegKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.myapp.bridge"
New-Item -Path $RegKey -Force | Out-Null
Set-ItemProperty -Path $RegKey -Name "(Default)" -Value $FinalManifestPath

# ── Done ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "✓ Native host manifest installed: $FinalManifestPath"
Write-Host "✓ Registry key created: $RegKey"
Write-Host ""
Write-Host "─────────────────────────────────────────────────────────────────────"
Write-Host "Next steps:"
Write-Host ""
Write-Host "1. Load the extension in Chrome:"
Write-Host "   chrome://extensions → Enable 'Developer mode' → 'Load unpacked'"
Write-Host "   → Select: $ScriptDir\extension"
Write-Host ""
Write-Host "2. Copy your extension ID from chrome://extensions"
Write-Host ""
Write-Host "3. Update allowed_origins in: $FinalManifestPath"
Write-Host "   Replace  YOUR_EXTENSION_ID  with the real ID."
Write-Host ""
Write-Host "4. In extension/background.js, set:  const USE_NATIVE = true;"
Write-Host "   Then reload the extension."
Write-Host "─────────────────────────────────────────────────────────────────────"
