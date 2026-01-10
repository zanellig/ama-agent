#!/bin/bash
# Script to run Vite dev server in WSL, accessible from Windows

# Get WSL IP address
WSL_IP=$(hostname -I | awk '{print $1}')

echo "Starting Vite dev server in WSL..."
echo "WSL IP: $WSL_IP"
echo "Dev server will be accessible at: http://$WSL_IP:1420"
echo ""
echo "In Windows PowerShell, run:"
echo "  \$wslIp = (wsl hostname -I).Trim()"
echo "  cd '\\wsl$<distro-name><path-to-project>'"
echo "  \$env:TAURI_DEV_URL = \"http://\$wslIp:1420\""
echo "  bun tauri dev -- --no-dev-server"
echo ""

# Start Vite dev server, binding to all interfaces
TAURI_DEV_HOST=$WSL_IP bun run dev
