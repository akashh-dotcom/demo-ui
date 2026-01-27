#!/bin/bash

set -e
MARKER_FILE="/var/lib/certbot/.certbot_initialized"
DOMAIN="epubconverter.zentrovia.tech"
EMAIL="<email-id>"
echo "🔍 Checking and installing required packages..."

# Update package index
sudo apt-get update -y

# Function to check and install a package
install_pkg() {
    local pkg=$1
    if dpkg -l | grep -qw "$pkg"; then
        echo "✅ $pkg is already installed"
    else
        echo "⬇️ Installing $pkg..."
        sudo apt-get install -y "$pkg"
    fi
}

if command -v docker >/dev/null 2>&1; then
    echo "✅ docker.io already installed"
else
    echo "⬇️ Installing docker.io..."
    sudo apt-get install -y docker.io
    sudo systemctl enable docker
    sudo systemctl start docker
fi

# Add current user to docker group (if not already)
if groups $USER | grep -qw docker; then
    echo "✅ User already in docker group"
else
    sudo usermod -aG docker $USER
    echo "⚠️ Added $USER to docker group. Logout/login required."
fi

# Install docker-compose
if command -v docker-compose >/dev/null 2>&1; then
    echo "✅ docker-compose already installed"
else
    echo "⬇️ Installing docker-compose..."
    sudo apt-get install -y docker-compose
fi

# installing nginx
if command -v nginx >/dev/null 2>&1; then
    echo "✅ nginx already installed"
else
    echo "⬇️ Installing nginx..."
    sudo apt-get install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
fi

# Install awscli
if command -v aws >/dev/null 2>&1; then
    echo "✅ awscli already installed"
else
    echo "⬇️ Installing awscli..."
    sudo apt-get install -y unzip 
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    sudo ./aws/install
fi



echo "🔍 Checking snapd..."

# -----------------------------
# Install snapd if not present
# -----------------------------
if ! command -v snap >/dev/null 2>&1; then
    echo "⬇️ Installing snapd..."
    sudo apt update -y
    sudo apt install -y snapd
else
    echo "✅ snapd already installed"
fi

# -----------------------------
# Install / refresh core snap
# -----------------------------
if ! snap list | grep -qw core; then
    echo "⬇️ Installing snap core..."
    sudo snap install core
else
    echo "✅ snap core already installed"
fi

echo "🔄 Refreshing snap core..."
sudo snap refresh core

# -----------------------------
# Install certbot
# -----------------------------
if ! command -v certbot >/dev/null 2>&1; then
    echo "⬇️ Installing certbot..."
    sudo snap install --classic certbot
else
    echo "✅ certbot already installed"
fi

# -----------------------------
# Create certbot symlink
# -----------------------------
if [ ! -L /usr/bin/certbot ]; then
    echo "🔗 Creating certbot symlink..."
    sudo ln -s /snap/bin/certbot /usr/bin/certbot
else
    echo "✅ certbot symlink already exists"
fi

# -----------------------------
# Verify certbot
# -----------------------------
certbot --version

# -----------------------------
# Issue certificate ONLY if missing
# -----------------------------
if [ -f "$MARKER_FILE" ]; then
    echo "✅ Certbot already initialized — skipping SSL setup"
else
    echo "🔐 First run detected — setting up SSL..."
sudo certbot --nginx \
  -d "$DOMAIN" \
  -m "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  --reinstall
    # Create marker AFTER successful run
    sudo mkdir -p /var/lib/certbot
    sudo touch "$MARKER_FILE"
    echo "🎉 SSL setup completed and marked as done"
fi
echo "🎉 All required packages are installed! with Certbot setup completed successfully"