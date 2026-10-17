#!/bin/bash
###############################################################################
# bootstrap-node.sh — Manually bootstrap a CraftHost worker node
#
# Run ON each node VM (as root or with sudo):
#   sudo bash bootstrap-node.sh \
#     --control-plane https://crafthost.saikumar.co.in \
#     --secret "your-daemon-secret" \
#     --name crafthost-node-india \
#     --region ap-south-1
###############################################################################
set -e

CONTROL_PLANE_URL=""
DAEMON_SECRET=""
VM_NAME=""
VM_REGION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --control-plane) CONTROL_PLANE_URL="$2"; shift 2 ;;
    --secret) DAEMON_SECRET="$2"; shift 2 ;;
    --name) VM_NAME="$2"; shift 2 ;;
    --region) VM_REGION="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$CONTROL_PLANE_URL" || -z "$DAEMON_SECRET" || -z "$VM_NAME" || -z "$VM_REGION" ]]; then
  echo "Usage:"
  echo "  sudo bash bootstrap-node.sh --control-plane <URL> --secret <SECRET> --name <VM_NAME> --region <REGION>"
  echo ""
  echo "Example:"
  echo "  sudo bash bootstrap-node.sh --control-plane https://crafthost.saikumar.co.in --secret crafthost-internal-node-secret --name crafthost-node-india --region ap-south-1"
  exit 1
fi

echo "============================================"
echo " CraftHost Node Bootstrap"
echo " VM: $VM_NAME ($VM_REGION)"
echo " Control Plane: $CONTROL_PLANE_URL"
echo "============================================"

# --- Step 1: Install dependencies ---
echo ""
echo "📦 Installing dependencies (Docker, Java)..."
apt-get update -qq
apt-get install -y curl wget software-properties-common apt-transport-https ca-certificates gnupg openjdk-21-jre-headless

# Docker
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  usermod -aG docker root || true
  usermod -aG docker ubuntu || true
  usermod -aG docker ec2-user || true
fi

# Node.js 20 (if not present)
if ! command -v node &> /dev/null || [[ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# PM2
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi

echo "✅ Dependencies ready"

# --- Step 2: Create daemon directory ---
echo ""
echo "📁 Setting up daemon directory..."
mkdir -p /opt/crafthost-daemon
cd /opt/crafthost-daemon

# --- Step 3: Download daemon files from control plane ---
echo ""
echo "⬇️  Downloading daemon files from control plane..."
for i in {1..5}; do
  echo "[Download] daemon.js attempt $i..."
  curl -fsSL -H "x-daemon-secret: $DAEMON_SECRET" "$CONTROL_PLANE_URL/api/system/daemon-script" -o daemon.js && break
  echo "Failed attempt $i, retrying in 5s..."
  sleep 5
done

for i in {1..5}; do
  echo "[Download] package.json attempt $i..."
  curl -fsSL -H "x-daemon-secret: $DAEMON_SECRET" "$CONTROL_PLANE_URL/api/system/daemon-package" -o package.json && break
  echo "Failed attempt $i, retrying in 5s..."
  sleep 5
done

if [[ ! -f daemon.js || ! -f package.json ]]; then
  echo "❌ CRITICAL: Failed to download daemon files after 5 attempts."
  echo "   Check that the control plane is reachable and the daemon secret is correct."
  exit 1
fi

echo "✅ Daemon files downloaded"

# --- Step 4: Install npm dependencies ---
echo ""
echo "📦 Installing npm dependencies (this may take 1-2 minutes)..."
npm install --omit=dev

echo "✅ Dependencies installed"

# --- Step 5: PM2 ecosystem ---
echo ""
echo "🔧 Configuring PM2..."
pm2 delete crafthost-daemon 2>/dev/null || true

cat > /opt/crafthost-daemon/ecosystem.config.js << PM2EOF
module.exports = {
  apps: [{
    name: 'crafthost-daemon',
    script: './daemon.js',
    cwd: '/opt/crafthost-daemon',
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
pm2 save --force

# Auto-start on boot
PM2_STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo env" | head -n1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
fi
pm2 save --force

echo ""
echo "============================================"
echo " ✅ Node Bootstrap Complete!"
echo "============================================"
echo ""
pm2 list

# --- Step 6: Verify registration ---
echo ""
echo "⏳ Waiting 10s for daemon to register with control plane..."
sleep 10

curl -s -o /dev/null -w "%{http_code}" "$CONTROL_PLANE_URL/api/daemon/status" \
  -H "x-daemon-secret: $DAEMON_SECRET" 2>/dev/null || true

echo ""
echo "🎉 Done! The daemon should now appear in the control plane's VM registry."
echo "   Check MongoDB: db.vmnodes.find({ vmName: '$VM_NAME' })"
