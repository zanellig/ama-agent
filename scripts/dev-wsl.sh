#!/bin/bash
# Script to run Vite dev server in WSL, accessible from Windows

# Get WSL IP address
WSL_IP=$(hostname -I | awk '{print $1}')

if [ -z "$WSL_IP" ]; then
    echo "Error: Could not determine WSL IP address" >&2
    exit 1
fi

echo "Starting Vite dev server in WSL..."
echo "WSL IP: $WSL_IP"
echo "Dev server will be accessible at: http://$WSL_IP:1420"
echo ""
echo "In Windows PowerShell, navigate to this project directory and run:"
echo "  .\scripts\dev-windows.ps1"
echo ""
echo "Or manually:"
echo "  cd '\\wsl\$<distro-name><path-to-project>'"
echo "  node scripts/dev-windows.js"
echo ""

# Start Vite dev server, binding to all interfaces
TAURI_DEV_HOST=$WSL_IP bun run dev
