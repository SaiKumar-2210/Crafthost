###############################################################################
# upload-to-vm.ps1 — Upload CraftHost control plane to India VM
#
# Usage: Open PowerShell, cd to project root, run:
#   .\backend\scripts\upload-to-vm.ps1
#
# This will:
#   1. Upload backend files to /opt/crafthost-control/
#   2. Upload built frontend (dist/) 
#   3. Upload the setup script
#   4. You then SSH in and run the setup script
###############################################################################

$VM_USER = "SAYMYNAME"
$VM_IP = "20.197.43.70"
$REMOTE_DIR = "/opt/crafthost-control"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " CraftHost Upload to India VM" -ForegroundColor Cyan
Write-Host " Target: $VM_USER@$VM_IP" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check dist folder exists
if (-not (Test-Path "dist")) {
    Write-Host "ERROR: dist/ folder not found. Run 'npm run build' first." -ForegroundColor Red
    exit 1
}

Write-Host "`n[1/5] Creating remote directories..." -ForegroundColor Yellow
ssh "$VM_USER@$VM_IP" "sudo mkdir -p $REMOTE_DIR/dist $REMOTE_DIR/routes $REMOTE_DIR/scripts && sudo chown -R $VM_USER`:$VM_USER $REMOTE_DIR"

Write-Host "`n[2/5] Uploading backend files..." -ForegroundColor Yellow
# Core files
scp backend/control.js backend/scheduler.js backend/db.js backend/queues.js backend/azure-provisioner.js backend/package.json "${VM_USER}@${VM_IP}:${REMOTE_DIR}/"
if (Test-Path "backend/package-lock.json") {
    scp backend/package-lock.json "${VM_USER}@${VM_IP}:${REMOTE_DIR}/"
}

# Routes
scp backend/routes/* "${VM_USER}@${VM_IP}:${REMOTE_DIR}/routes/"

# .env
scp backend/.env "${VM_USER}@${VM_IP}:${REMOTE_DIR}/.env"

Write-Host "`n[3/5] Uploading frontend build..." -ForegroundColor Yellow
scp -r dist/* "${VM_USER}@${VM_IP}:${REMOTE_DIR}/dist/"

Write-Host "`n[4/5] Uploading setup script..." -ForegroundColor Yellow
scp backend/scripts/setup-control-plane.sh "${VM_USER}@${VM_IP}:${REMOTE_DIR}/"

Write-Host "`n[5/5] Done! Now SSH in and run setup:" -ForegroundColor Green
Write-Host ""
Write-Host "  ssh $VM_USER@$VM_IP" -ForegroundColor White
Write-Host "  sudo bash /opt/crafthost-control/setup-control-plane.sh" -ForegroundColor White
Write-Host ""
