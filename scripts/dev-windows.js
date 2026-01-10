#!/usr/bin/env node
/**
 * Script to run Tauri dev from Windows, connecting to WSL dev server
 * This ensures the Tauri app runs as a native Windows app with access to Windows APIs
 */

import { execSync } from "child_process"
import { readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, "..")
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
try {
  execSync("bun tauri dev", {
    cwd: projectRoot,
    stdio: "inherit",
  })
} catch (error) {
  // Exit code is non-zero, but that's expected if user stops the dev server
  process.exit(error.status || 1)
}
