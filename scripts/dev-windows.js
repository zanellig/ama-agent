#!/usr/bin/env node
/**
 * Script to run Tauri dev from Windows, connecting to WSL dev server
 * This ensures the Tauri app runs as a native Windows app with access to Windows APIs
 */

import { execSync } from "child_process"
import { existsSync, readFileSync, realpathSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Use environment variable if set (PowerShell script sets this after pushd)
// Otherwise use current working directory (PowerShell script sets this to mapped drive via pushd)
// Fallback to __dirname if cwd doesn't look right
let projectRoot = process.env.TAURI_PROJECT_ROOT || process.cwd()

// Verify we're in the project root by checking for package.json and src-tauri
if (!existsSync(join(projectRoot, "package.json")) || !existsSync(join(projectRoot, "src-tauri"))) {
  // Fallback to __dirname
  projectRoot = join(__dirname, "..")
  // Try to resolve it
  try {
    projectRoot = realpathSync(projectRoot)
  } catch (error) {
    // If realpathSync fails, use as-is
  }
} else {
  // Resolve the actual path - if we're in a mapped drive (from pushd), this will give us the mapped drive letter
  try {
    projectRoot = realpathSync(projectRoot)
  } catch (error) {
    // If realpathSync fails (e.g., UNC path), use as-is
    // The PowerShell script should have used pushd to map it to a drive letter
  }
}

// Check if we're still in a UNC path (shouldn't happen if pushd worked)
const isUncPath = projectRoot.startsWith("\\\\") && (projectRoot.startsWith("\\\\wsl$") || projectRoot.startsWith("\\\\wsl.localhost"))

const tauriConfigPath = join(projectRoot, "src-tauri", "tauri.conf.json")

// Get WSL IP address
let wslIp
try {
  const wslHostnameOutput = execSync("wsl hostname -I", { encoding: "utf-8" })
  wslIp = wslHostnameOutput.trim().split(/\s+/)[0]
  if (!wslIp) {
    throw new Error("Could not parse WSL IP")
  }
} catch (error) {
  console.error("Error: Could not get WSL IP address. Is WSL running?")
  console.error(error.message)
  process.exit(1)
}

console.log(`WSL IP: ${wslIp}`)
console.log(`Connecting to dev server at: http://${wslIp}:1420\n`)

// Read current config
let config
try {
  const configContent = readFileSync(tauriConfigPath, "utf-8")
  config = JSON.parse(configContent)
} catch (error) {
  console.error("Error: Could not read tauri.conf.json")
  console.error(error.message)
  process.exit(1)
}

// Backup original devUrl
const originalDevUrl = config.build.devUrl
const originalBeforeDevCommand = config.build.beforeDevCommand

// Update config to use WSL IP and skip beforeDevCommand
config.build.devUrl = `http://${wslIp}:1420`
config.build.beforeDevCommand = null

// Write updated config
try {
  writeFileSync(tauriConfigPath, JSON.stringify(config, null, 2) + "\n")
} catch (error) {
  console.error("Error: Could not write tauri.conf.json")
  console.error(error.message)
  process.exit(1)
}

// Restore function
function restoreConfig() {
  config.build.devUrl = originalDevUrl
  config.build.beforeDevCommand = originalBeforeDevCommand
  try {
    writeFileSync(tauriConfigPath, JSON.stringify(config, null, 2) + "\n")
  } catch (error) {
    console.error("Warning: Could not restore tauri.conf.json")
    console.error("Please manually restore devUrl to:", originalDevUrl)
  }
}

// Handle cleanup on exit
process.on("SIGINT", () => {
  console.log("\nRestoring config...")
  restoreConfig()
  process.exit(0)
})

process.on("SIGTERM", () => {
  restoreConfig()
  process.exit(0)
})

process.on("exit", () => {
  restoreConfig()
})

// Run tauri dev
console.log("Starting Tauri dev (Windows native)...\n")
console.log(`Project root: ${projectRoot}\n`)

// The PowerShell script should have used pushd to map UNC paths to a drive letter
// So projectRoot should be a normal Windows path (e.g., "Z:\")
// Use PowerShell to execute, which handles paths better than CMD
try {
  // Escape the path properly for PowerShell - only escape single quotes, NOT $ signs
  // The -LiteralPath parameter treats $ literally, so we don't need to escape it
  const escapedPath = projectRoot.replace(/'/g, "''")
  // Use PowerShell with Set-Location for better path handling
  // The cwd option ensures we're in the right directory
  // Note: PowerShell requires proper boolean syntax - wrap conditions in parentheses
  const psCommand = `Set-Location -LiteralPath '${escapedPath}'; if ((Test-Path 'package.json') -and (Test-Path 'src-tauri')) { bun tauri dev } else { Write-Host 'Error: Not in project root'; exit 1 }`
  execSync(psCommand, {
    shell: "powershell.exe",
    stdio: "inherit",
    cwd: projectRoot, // Also set cwd as backup
  })
} catch (error) {
  // If we're still in a UNC path, provide helpful error
  if (isUncPath) {
    console.error("Error: Still in UNC path. The PowerShell script should have mapped it.")
    console.error("This might indicate that pushd failed. Try running the script again.")
  } else {
    console.error("Error running Tauri dev")
    console.error(error.message)
  }
  process.exit(error.status || 1)
}
