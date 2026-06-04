#!/bin/bash
###############################################################################
# setup-control-plane.sh — Run ON the India VM to set up the control plane
#
# Upload this + backend files + dist/ to the VM, then run:
#   sudo bash setup-control-plane.sh
###############################################################################
set -e

REMOTE_DIR="/opt/crafthost-control"
DOMAIN="crafthost.saikumar.co.in"

echo "============================================"
echo " CraftHost Control Plane Setup"
echo " Domain: $DOMAIN"
echo "============================================"

# --- Step 1: Install dependencies ---
echo ""
echo "📦 Installing Redis, Nginx, Certbot..."
apt-get update -qq
apt-get install -y redis-server nginx certbot python3-certbot-nginx

systemctl enable redis-server
systemctl start redis-server
echo "✅ Redis running"

# --- Step 2: Install npm dependencies ---
echo ""
echo "📦 Installing npm dependencies..."
cd "$REMOTE_DIR"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
echo "✅ Dependencies installed"

# --- Step 3: Nginx config ---
echo ""
echo "🔧 Configuring Nginx..."
cat > /etc/nginx/sites-available/crafthost << 'NGINXCONF'
server {
    listen 80;
    server_name crafthost.saikumar.co.in;

    client_max_body_size 50M;

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

ln -sf /etc/nginx/sites-available/crafthost /etc/nginx/sites-enabled/crafthost
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "✅ Nginx configured"

# --- Step 4: PM2 setup ---
echo ""
echo "🔧 Setting up PM2 processes..."
which pm2 > /dev/null 2>&1 || npm install -g pm2

# Stop existing control plane processes
pm2 delete crafthost-control 2>/dev/null || true
pm2 delete crafthost-scheduler 2>/dev/null || true

cat > "$REMOTE_DIR/ecosystem.control.config.js" << 'PM2EOF'
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
    }
  ]
};
PM2EOF

cd "$REMOTE_DIR"
pm2 start ecosystem.control.config.js
pm2 save --force

# PM2 startup on boot
PM2_STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo env" | head -n1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
fi
pm2 save --force

echo "✅ PM2 processes started"
pm2 list

# --- Step 5: SSL (optional — run after DNS propagates) ---
echo ""
echo "============================================"
echo " ✅ Setup Complete!"
echo "============================================"
echo ""
echo " HTTP:  http://$DOMAIN (working now)"
echo ""
echo " For HTTPS, run after DNS propagates:"
echo "   sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m your@email.com"
echo ""
