#!/bin/bash
exec > /var/log/crafthost-install.log 2>&1
set -e
set -x

# =========================================================================
# CraftHost Manual Node Installer
# 
# Run this script on your Worker Nodes (e.g., crafthost-node-koera).
# It will download the daemon from your Control Plane and start it.
# 
# Usage:
#   sudo bash install-node.sh "https://your-domain.com" "node-name" "region" "secret"
# Example:
#   sudo bash install-node.sh "https://crafthost.saikumar.co.in" "crafthost-node-koera" "koreacentral" "crafthost-internal-node-secret"
# =========================================================================

if [ "$#" -ne 4 ]; then
    echo "Usage: sudo bash install-node.sh <CONTROL_PLANE_URL> <VM_NAME> <REGION> <DAEMON_SECRET>"
    exit 1
fi

export CONTROL_PLANE_URL="$1"
export VM_NAME="$2"
export VM_REGION="$3"
export DAEMON_SECRET="$4"

echo "[Installer] Starting CraftHost Daemon Setup on ${VM_REGION} (VM: ${VM_NAME})..."

# 1. Install Dependencies
apt-get update
apt-get install -y curl wget software-properties-common apt-transport-https ca-certificates gnupg openjdk-21-jre-headless

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker root

# 2. Prepare Directory
mkdir -p /opt/crafthost-daemon
cd /opt/crafthost-daemon

# 3. Download Daemon Files from Control Plane
for i in {1..5}; do
  echo "[Installer] Downloading daemon.js (attempt $i)..."
  curl -fsSL -H "x-daemon-secret: $DAEMON_SECRET" "$CONTROL_PLANE_URL/api/system/daemon-script" -o daemon.js && break || { echo "Failed attempt $i, retrying..."; sleep 5; }
done

for i in {1..5}; do
  echo "[Installer] Downloading package.json (attempt $i)..."
  curl -fsSL -H "x-daemon-secret: $DAEMON_SECRET" "$CONTROL_PLANE_URL/api/system/daemon-package" -o package.json && break || { echo "Failed attempt $i, retrying..."; sleep 5; }
done

if [ ! -f daemon.js ] || [ ! -f package.json ]; then
  echo "[Installer] CRITICAL: Failed to download daemon files after 5 attempts. Is the Control Plane URL correct?"
  exit 1
fi

# 4. Install Node Packages
npm ci --omit=dev || npm install --omit=dev

# 5. Setup PM2
npm install -g pm2

cat > /opt/crafthost-daemon/ecosystem.config.js << PM2EOF
module.exports = {
  apps: [{
    name: 'crafthost-daemon',
    script: './daemon.js',
    env: {
      PORT: 4000,
      DAEMON_SECRET: '${DAEMON_SECRET}',
      VM_NAME: '${VM_NAME}',
      VM_REGION: '${VM_REGION}',
      CONTROL_PLANE_URL: '${CONTROL_PLANE_URL}'
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    min_uptime: '10s',
    kill_timeout: 5000
  }]
};
PM2EOF

pm2 start ecosystem.config.js
pm2 save

PM2_STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo env" | head -n1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
else
  pm2 startup systemd -u root --hp /root || true
fi
pm2 save --force

echo "[Installer] CraftHost Daemon Setup Complete! Daemon is now running."
