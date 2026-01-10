# PowerShell script to run Tauri dev from Windows, connecting to WSL dev server
# This ensures the Tauri app runs as a native Windows app with access to Windows APIs

# Function to find project root (directory containing package.json and src-tauri)
function Find-ProjectRoot {
    # Start with current working directory (simplest and most reliable)
    # Note: $PWD.Path may include PowerShell provider prefix like "Microsoft.PowerShell.Core\FileSystem::"
    # We need to strip this to get the actual filesystem path
    $currentPath = $PWD.Path
    if ($currentPath -like "Microsoft.PowerShell.Core\FileSystem::*") {
        $currentPath = $currentPath -replace "^Microsoft\.PowerShell\.Core\\FileSystem::", ""
    }
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

# Check if we're in a UNC path (WSL path) - Windows tools can't work directly with these
$isUncPath = $projectRoot -like "\\wsl$*" -or $projectRoot -like "\\wsl.localhost*"

if ($isUncPath) {
    Write-Host "WSL path detected - will create temporary drive mapping..." -ForegroundColor Yellow
}

# Find an available drive letter for mapping (start from Z and work backwards)
function Get-AvailableDriveLetter {
    $usedDrives = (Get-PSDrive -PSProvider FileSystem).Name
    for ($i = [int][char]'Z'; $i -ge [int][char]'D'; $i--) {
        $letter = [char]$i
        if ($letter -notin $usedDrives) {
            return $letter
        }
    }
    return $null
}

$originalLocation = $PWD.Path
$mappedDrive = $null
$originalProjectRoot = $projectRoot

try {
    if ($isUncPath) {
        # PowerShell's pushd doesn't map UNC paths to drive letters like CMD does
        # We need to use net use to create an explicit drive mapping
        $driveLetter = Get-AvailableDriveLetter
        if (-not $driveLetter) {
            Write-Host "Error: No available drive letters for mapping" -ForegroundColor Red
            exit 1
        }
        
        # Map the UNC path to a drive letter
        $mappedDrive = "${driveLetter}:"
        Write-Host "Mapping $projectRoot to $mappedDrive ..." -ForegroundColor Yellow
        
        # Use net use to create the mapping (works for UNC paths)
        $netResult = net use $mappedDrive $projectRoot 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Warning: net use failed, trying subst..." -ForegroundColor Yellow
            # Fallback: try subst (may not work for UNC paths on all systems)
            $substResult = subst $mappedDrive $projectRoot 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Error: Could not map drive. Running directly from UNC path..." -ForegroundColor Yellow
                $mappedDrive = $null
            }
        }
        
        if ($mappedDrive) {
            $projectRoot = $mappedDrive
            Set-Location $projectRoot
            Write-Host "Using mapped drive: $projectRoot" -ForegroundColor Green
        } else {
            # Fallback: try to run from UNC path directly using CMD's pushd
            Write-Host "Attempting to use CMD pushd for drive mapping..." -ForegroundColor Yellow
        }
    } else {
        Set-Location $projectRoot
    }
    
    # Verify we're in the right place
    if (-not ((Test-Path "package.json") -and (Test-Path "src-tauri"))) {
        Write-Host "Error: Project structure not found in $projectRoot" -ForegroundColor Red
        exit 1
    }
    
    # Run the Node.js script which handles config modification and cleanup
    Write-Host "Starting Tauri dev (Windows native)..." -ForegroundColor Green
    
    # Pass the project root as an environment variable so Node.js knows the correct path
    $env:TAURI_PROJECT_ROOT = $projectRoot
    
    # Run the dev script - if bun fails to find tauri, suggest installing it
    try {
        bun scripts/dev-windows.js
    } catch {
        Write-Host "If you see 'tauri: command not found', run: bun add -D @tauri-apps/cli" -ForegroundColor Yellow
        throw
    }
} finally {
    # Clean up: remove the drive mapping we created
    if ($mappedDrive) {
        Write-Host "`nCleaning up drive mapping $mappedDrive ..." -ForegroundColor Yellow
        net use $mappedDrive /delete 2>&1 | Out-Null
        # Also try subst in case that's what was used
        subst $mappedDrive /d 2>&1 | Out-Null
    }
    # Restore original location if we changed it
    if ($originalLocation -and (Test-Path $originalLocation -ErrorAction SilentlyContinue)) {
        Set-Location $originalLocation -ErrorAction SilentlyContinue
    }
}
