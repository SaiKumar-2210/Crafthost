#!/bin/bash
###############################################################################
# vm-git-deploy.sh — Pull from Git, Build, and Deploy on the VM
#
# Upload this script AND your backend/.env to the VM:
#   scp backend/scripts/vm-git-deploy.sh SAYMYNAME@20.197.43.70:~/
#   scp backend/.env SAYMYNAME@20.197.43.70:~/.env
#
# Then SSH into the VM and run:
#   sudo bash ~/vm-git-deploy.sh
###############################################################################
set -e

REPO_URL="https://github.com/SaiKumar-2210/Crafthost.git"
REMOTE_DIR="/opt/crafthost-control"
DOMAIN="crafthost.saikumar.co.in"

echo "============================================"
echo " CraftHost Git Deployment"
echo " Domain: $DOMAIN"
echo "============================================"

# --- Step 1: Install dependencies (Git, Redis, Nginx) ---
echo ""
echo "📦 Installing system dependencies..."
apt-get update -qq
apt-get install -y git redis-server nginx certbot python3-certbot-nginx

systemctl enable redis-server
systemctl start redis-server

# --- Step 2: Clone or Pull Repository ---
echo ""
echo "📦 Fetching code from Git..."
if [ -d "$REMOTE_DIR/.git" ]; then
  cd "$REMOTE_DIR"
  git pull origin main
else
  # If folder exists but isn't git, remove it
  if [ -d "$REMOTE_DIR" ]; then rm -rf "$REMOTE_DIR"; fi
  git clone "$REPO_URL" "$REMOTE_DIR"
  cd "$REMOTE_DIR"
fi

# Move .env into place if provided in home dir
if [ -f /home/$SUDO_USER/.env ]; then
  echo "🔒 Copying .env file..."
  cp /home/$SUDO_USER/.env "$REMOTE_DIR/backend/.env"
fi

# --- Step 3: Install Node dependencies & Build Frontend ---
echo ""
echo "📦 Installing npm dependencies and building frontend..."
cd "$REMOTE_DIR"
npm ci
npm run build

echo "📦 Installing backend dependencies..."
cd "$REMOTE_DIR/backend"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# --- Step 4: Nginx config ---
echo ""
echo "🔧 Configuring Nginx..."
cat > /etc/nginx/sites-available/crafthost << 'NGINXCONF'
server {
    listen 80;
    server_name crafthost.saikumar.co.in;

    client_max_body_size 50M;

    # Backend API & Socket.IO
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Frontend (built React SPA)
    location / {
        root /opt/crafthost-control/dist;
        try_files $uri $uri/ /index.html;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/crafthost /etc/nginx/sites-enabled/crafthost
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# --- Step 5: PM2 setup ---
echo ""
echo "🔧 Setting up PM2 processes..."
which pm2 > /dev/null 2>&1 || npm install -g pm2

pm2 delete crafthost-control 2>/dev/null || true
pm2 delete crafthost-scheduler 2>/dev/null || true

cat > "$REMOTE_DIR/backend/ecosystem.control.config.js" << 'PM2EOF'
module.exports = {
  apps: [
    {
      name: 'crafthost-control',
      script: './control.js',
      cwd: '/opt/crafthost-control/backend',
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
      cwd: '/opt/crafthost-control/backend',
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

cd "$REMOTE_DIR/backend"
pm2 start ecosystem.control.config.js
pm2 save --force

# PM2 startup on boot
PM2_STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo env" | head -n1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
fi
pm2 save --force

echo ""
echo "============================================"
echo " ✅ Git Deployment Complete!"
echo "============================================"
echo ""
echo " HTTP:  http://$DOMAIN (working now)"
echo ""
echo " For HTTPS, run after DNS propagates:"
echo "   sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m your@email.com"
echo ""
