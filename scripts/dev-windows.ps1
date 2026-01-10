# PowerShell script to run Tauri dev from Windows, connecting to WSL dev server
# This ensures the Tauri app runs as a native Windows app with access to Windows APIs

# Navigate to project directory
$projectPath = "\\wsl$<distro-name><path-to-project>"
if (-not (Test-Path $projectPath)) {
    Write-Host "Error: Project path not found: $projectPath" -ForegroundColor Red
    Write-Host "Make sure WSL distribution name is correct (<distro-name>)" -ForegroundColor Yellow
    exit 1
}

Set-Location $projectPath

# Run the Node.js script which handles config modification and cleanup
Write-Host "Starting Tauri dev (Windows native)..." -ForegroundColor Green
node scripts/dev-windows.js
