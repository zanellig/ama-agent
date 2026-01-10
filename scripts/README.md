# WSL + Windows Development Setup

This directory contains scripts to run the Tauri app in development mode with the following setup:
- **Vite dev server** runs in WSL (where your project files are)
- **Tauri app** runs in Windows (native Windows app with access to Windows APIs, microphone, system tray, etc.)

## Quick Start

### Step 1: Start Vite Dev Server in WSL

In your WSL terminal:
```bash
cd /path/to/desktop-audio-agent
./scripts/dev-wsl.sh
```

This will:
- Get your WSL IP address
- Start the Vite dev server bound to all interfaces (accessible from Windows)
- Display instructions for the next step

### Step 2: Start Tauri Dev in Windows PowerShell

In Windows PowerShell:
```powershell
cd "\\wsl$<distro-name><path-to-project>"
.\scripts\dev-windows.ps1
```

Or if you prefer using Node.js directly:
```powershell
cd "\\wsl$<distro-name><path-to-project>"
node scripts/dev-windows.js
```

This will:
- Get your WSL IP address
- Temporarily modify `tauri.conf.json` to point to the WSL dev server
- Run `bun tauri dev` which compiles and runs the app as a native Windows application
- Automatically restore the config when you stop the dev server (Ctrl+C)

## How It Works

1. **Vite dev server** runs in WSL and binds to `0.0.0.0:1420`, making it accessible from Windows via the WSL IP address
2. **Tauri dev** runs from Windows PowerShell, which:
   - Compiles the Rust code for Windows (not Linux)
   - Opens a native Windows window (not a Linux/X11 window)
   - Has full access to Windows APIs (microphone, system tray, etc.)
   - Connects to the Vite dev server running in WSL via the WSL IP address

## Troubleshooting

### "Could not get WSL IP address"
- Make sure WSL is running: `wsl --list --running`
- Try running `wsl hostname -I` manually in PowerShell

### "Project path not found"
- Verify your WSL distribution name is correct (might be `Ubuntu` instead of `<distro-name>`)
- Check the path: `Get-ChildItem "\\wsl$\"` in PowerShell

### "bun: command not found: tauri"
- Make sure you're running from Windows PowerShell, not from WSL
- Install bun on Windows if needed: `powershell -c "irm bun.sh/install.ps1 | iex"`

### Dev server not accessible
- Make sure the Vite dev server is running in WSL first
- Check Windows Firewall isn't blocking the connection
- Verify the WSL IP address is correct

## Manual Setup (if scripts don't work)

1. **In WSL**, get your IP and start dev server:
   ```bash
   WSL_IP=$(hostname -I | awk '{print $1}')
   TAURI_DEV_HOST=$WSL_IP bun run dev
   ```

2. **In Windows PowerShell**, get WSL IP and update config:
   ```powershell
   $wslIp = (wsl hostname -I).Trim().Split()[0]
   # Manually edit src-tauri/tauri.conf.json:
   # Change "devUrl" to "http://$wslIp:1420"
   # Set "beforeDevCommand" to null
   bun tauri dev
   # Remember to restore the config afterwards!
   ```
