#!/bin/bash
###############################################################################
# deploy-control-plane.sh — Deploy CraftHost Control Plane to India VM
#
# Prerequisites:
#   1. Run `npm run build` in the project root first (builds frontend to dist/)
#   2. SSH access to the India VM (crafthostadmin@20.207.197.215)
#   3. GoDaddy DNS: crafthost.saikumar.co.in → 20.207.197.215 (only India IP)
#
# Usage:
#   bash scripts/deploy-control-plane.sh
###############################################################################
set -e

VM_IP="20.207.197.215"
VM_USER="crafthostadmin"
REMOTE_DIR="/opt/crafthost-control"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
DIST_DIR="$PROJECT_ROOT/dist"

echo "============================================"
echo " CraftHost Control Plane Deployment"
echo " Target: $VM_USER@$VM_IP"
echo "============================================"

# --- Step 1: Check frontend build ---
if [ ! -d "$DIST_DIR" ]; then
  echo "❌ dist/ folder not found. Run 'npm run build' in project root first."
  exit 1
fi
echo "✅ Frontend build found (dist/)"

# --- Step 2: Create remote directory ---
echo ""
echo "📁 Creating remote directories..."
ssh "$VM_USER@$VM_IP" "sudo mkdir -p $REMOTE_DIR/dist && sudo chown -R $VM_USER:$VM_USER $REMOTE_DIR"

# --- Step 3: Upload backend files ---
echo ""
echo "📦 Uploading backend files..."
# Upload core backend files (not node_modules, not .env)
scp "$BACKEND_DIR/control.js" "$VM_USER@$VM_IP:$REMOTE_DIR/"
scp "$BACKEND_DIR/scheduler.js" "$VM_USER@$VM_IP:$REMOTE_DIR/"
scp "$BACKEND_DIR/db.js" "$VM_USER@$VM_IP:$REMOTE_DIR/"
scp "$BACKEND_DIR/queues.js" "$VM_USER@$VM_IP:$REMOTE_DIR/"
scp "$BACKEND_DIR/azure-provisioner.js" "$VM_USER@$VM_IP:$REMOTE_DIR/"
scp "$BACKEND_DIR/package.json" "$VM_USER@$VM_IP:$REMOTE_DIR/"
scp "$BACKEND_DIR/package-lock.json" "$VM_USER@$VM_IP:$REMOTE_DIR/" 2>/dev/null || true

# Upload routes directory
ssh "$VM_USER@$VM_IP" "mkdir -p $REMOTE_DIR/routes"
scp "$BACKEND_DIR/routes/"* "$VM_USER@$VM_IP:$REMOTE_DIR/routes/"

# Upload scripts directory
ssh "$VM_USER@$VM_IP" "mkdir -p $REMOTE_DIR/scripts"
scp "$BACKEND_DIR/scripts/"* "$VM_USER@$VM_IP:$REMOTE_DIR/scripts/" 2>/dev/null || true

echo "✅ Backend files uploaded"

# --- Step 4: Upload built frontend ---
echo ""
echo "📦 Uploading frontend build..."
scp -r "$DIST_DIR/"* "$VM_USER@$VM_IP:$REMOTE_DIR/dist/"
echo "✅ Frontend build uploaded"

# --- Step 5: Upload production .env ---
echo ""
echo "📦 Uploading .env..."
scp "$BACKEND_DIR/.env" "$VM_USER@$VM_IP:$REMOTE_DIR/.env"
echo "✅ .env uploaded"

# --- Step 6: Remote setup (Redis, Nginx, npm, PM2, SSL) ---
echo ""
echo "🔧 Running remote setup..."
ssh "$VM_USER@$VM_IP" "bash -s" << 'REMOTE_SCRIPT'
set -e

echo "[Remote] Installing Redis, Nginx, and Certbot..."
sudo apt-get update -qq
sudo apt-get install -y redis-server nginx certbot python3-certbot-nginx

# Enable and start Redis
sudo systemctl enable redis-server
sudo systemctl start redis-server
echo "[Remote] ✅ Redis running"

# Install npm dependencies
echo "[Remote] Installing npm dependencies..."
cd /opt/crafthost-control
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
echo "[Remote] ✅ Dependencies installed"

# --- Nginx config ---
echo "[Remote] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/crafthost > /dev/null << 'NGINXCONF'
server {
    listen 80;
    server_name crafthost.saikumar.co.in;

    # Frontend (built React SPA)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
NGINXCONF

sudo ln -sf /etc/nginx/sites-available/crafthost /etc/nginx/sites-enabled/crafthost
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
echo "[Remote] ✅ Nginx configured"

# --- PM2: Control plane + Scheduler ---
echo "[Remote] Setting up PM2 processes..."

# Check if pm2 is installed
which pm2 > /dev/null 2>&1 || sudo npm install -g pm2

# Stop existing control plane processes if any
pm2 delete crafthost-control 2>/dev/null || true
pm2 delete crafthost-scheduler 2>/dev/null || true

cd /opt/crafthost-control

# Create ecosystem config
cat > ecosystem.control.config.js << 'PM2EOF'
module.exports = {
  apps: [
    {
      name: 'crafthost-control',
      script: './control.js',
      cwd: '/opt/crafthost-control',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      min_uptime: '10s',
    },
    {
      name: 'crafthost-scheduler',
      script: './scheduler.js',
      cwd: '/opt/crafthost-control',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      min_uptime: '10s',
    }
  ]
};
PM2EOF

pm2 start ecosystem.control.config.js
pm2 save --force

# Ensure PM2 starts on boot
PM2_STARTUP_CMD=$(pm2 startup systemd -u $USER --hp $HOME 2>&1 | grep "sudo env" | head -n1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
fi
pm2 save --force

echo "[Remote] ✅ PM2 processes started"
echo ""
echo "[Remote] PM2 status:"
pm2 list

REMOTE_SCRIPT

echo ""
echo "✅ Deployment complete!"
echo ""
echo "============================================"
echo " Next Steps"
echo "============================================"
echo ""
echo "1. Update GoDaddy DNS:"
echo "   - crafthost    → 20.207.197.215 (India - dashboard + game)"
echo "   - kr.crafthost → 4.217.197.224  (Korea - game only)"
echo ""
echo "2. Open ports 80/443 on India VM NSG (run once):"
echo "   node scripts/open-web-ports.js"
echo ""
echo "3. Get SSL certificate (after DNS propagates):"
echo "   ssh $VM_USER@$VM_IP 'sudo certbot --nginx -d crafthost.saikumar.co.in --non-interactive --agree-tos -m your@email.com'"
echo ""
echo "4. Visit: https://crafthost.saikumar.co.in"
echo ""
