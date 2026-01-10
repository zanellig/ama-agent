# PowerShell script to run Tauri dev from Windows, connecting to WSL dev server
# This ensures the Tauri app runs as a native Windows app with access to Windows APIs

# Function to find project root (directory containing package.json and src-tauri)
function Find-ProjectRoot {
    # Start with current working directory (simplest and most reliable)
    $currentPath = $PWD.Path
    if ($currentPath) {
        $dir = $currentPath
        while ($dir) {
            if ((Test-Path (Join-Path $dir "package.json")) -and 
                (Test-Path (Join-Path $dir "src-tauri"))) {
                return $dir
            }
            $parent = Split-Path -Parent $dir -ErrorAction SilentlyContinue
            if (-not $parent -or $parent -eq $dir) {
                break
            }
            $dir = $parent
        }
    }
    
    # If we're in a WSL path and didn't find it, try to detect WSL distribution
    if ($currentDir.Path -like "\\wsl$\*") {
        try {
            $wslList = wsl --list --quiet 2>$null
            if ($LASTEXITCODE -eq 0 -and $wslList) {
                # Get first running distribution, or first distribution if none running
                $running = wsl --list --running --quiet 2>$null
                $distro = $null
                if ($running) {
                    $distro = ($running -split "`n" | Where-Object { $_ -match '\S' } | Select-Object -First 1)
                    if ($distro) { $distro = $distro.Trim() }
                } else {
                    $distro = ($wslList -split "`n" | Where-Object { $_ -match '\S' -and $_ -notmatch 'NAME' } | Select-Object -First 1)
                    if ($distro) { $distro = $distro.Trim() }
                }
                
                if ($distro) {
                    # Try common project locations in WSL
                    $homePath = wsl -d $distro -e bash -c "echo `$HOME" 2>$null
                    if ($homePath) {
                        $homePath = $homePath.Trim()
                        if ($homePath) {
                            # Try to find project by looking for package.json with tauri
                            $wslPath = "\\wsl$\$distro$homePath"
                            if ($wslPath -and (Test-Path $wslPath)) {
                                # Search for project (this is a best-effort approach)
                                $possiblePaths = @(
                                    Join-Path $wslPath "projects\cogniar\desktop-audio-agent",
                                    Join-Path $wslPath "projects\desktop-audio-agent",
                                    Join-Path $wslPath "desktop-audio-agent"
                                )
                                foreach ($path in $possiblePaths) {
                                    if ($path -and (Test-Path $path) -and 
                                        (Test-Path (Join-Path $path "package.json")) -and 
                                        (Test-Path (Join-Path $path "src-tauri"))) {
                                        return $path
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch {
            # Fall through - return null
        }
    }
    
    return $null
}

# Find project root
$projectRoot = Find-ProjectRoot

if (-not $projectRoot) {
    Write-Host "Error: Could not find project root (directory with package.json and src-tauri)" -ForegroundColor Red
    Write-Host "Please navigate to the project directory first, or run this script from within the project." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Example:" -ForegroundColor Yellow
    Write-Host "  cd '\\wsl$\<distro-name>\<path-to-project>'" -ForegroundColor Cyan
    Write-Host "  .\scripts\dev-windows.ps1" -ForegroundColor Cyan
    exit 1
}

Write-Host "Found project at: $projectRoot" -ForegroundColor Green
Set-Location $projectRoot

# Verify we're in the right place
if (-not ((Test-Path "package.json") -and (Test-Path "src-tauri"))) {
    Write-Host "Error: Project structure not found in $projectRoot" -ForegroundColor Red
    exit 1
}

# Run the Node.js script which handles config modification and cleanup
Write-Host "Starting Tauri dev (Windows native)..." -ForegroundColor Green
node scripts/dev-windows.js
