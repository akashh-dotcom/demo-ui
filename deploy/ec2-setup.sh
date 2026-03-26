#!/bin/bash

# =============================================================================
# EC2 Initial Setup Script
# =============================================================================
# Run this script on a fresh EC2 instance (Amazon Linux 2023 or Ubuntu 22.04)
# Usage: curl -sSL <raw-script-url> | bash
# =============================================================================

set -e

echo "=========================================="
echo "  Manuscript Processor - EC2 Setup"
echo "=========================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    OS="unknown"
fi

echo "Detected OS: $OS"

# -----------------------------------------------------------------------------
# Install Docker
# -----------------------------------------------------------------------------
echo ""
echo "[1/5] Installing Docker..."

if [ "$OS" = "amzn" ]; then
    # Amazon Linux 2023
    sudo dnf update -y
    sudo dnf install -y docker git
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
elif [ "$OS" = "ubuntu" ]; then
    # Ubuntu
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
    sudo usermod -aG docker $USER
else
    echo "Unsupported OS: $OS"
    echo "Please install Docker manually"
    exit 1
fi

# -----------------------------------------------------------------------------
# Install Docker Compose (standalone)
# -----------------------------------------------------------------------------
echo ""
echo "[2/5] Installing Docker Compose..."

DOCKER_COMPOSE_VERSION="v2.24.0"
sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version

# -----------------------------------------------------------------------------
# Create application directory
# -----------------------------------------------------------------------------
echo ""
echo "[3/5] Setting up application directory..."

sudo mkdir -p /opt/manuscript-processor
sudo chown $USER:$USER /opt/manuscript-processor
cd /opt/manuscript-processor

# -----------------------------------------------------------------------------
# Clone repository (if not exists)
# -----------------------------------------------------------------------------
echo ""
echo "[4/5] Cloning repository..."

if [ ! -d ".git" ]; then
    echo "Please enter your GitHub repository URL:"
    read -p "Repository URL: " REPO_URL
    git clone $REPO_URL .
else
    echo "Repository already exists, pulling latest..."
    git pull origin main
fi

# -----------------------------------------------------------------------------
# Create environment file
# -----------------------------------------------------------------------------
echo ""
echo "[5/5] Setting up environment..."

if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env file..."
    echo "Please provide the following values:"
    echo ""

    read -p "MongoDB URI (mongodb+srv://...): " MONGODB_URI
    read -p "JWT Secret (random string): " JWT_SECRET
    read -p "Server IP or Domain: " HOST_IP

    cat > .env << EOF
# Production Environment Variables
MONGODB_URI=${MONGODB_URI}
JWT_SECRET=${JWT_SECRET}
FRONTEND_URL=http://${HOST_IP}
VITE_API_URL=http://${HOST_IP}:5000/api
USE_EXTERNAL_APIS=true
NODE_ENV=production
EOF

    echo ".env file created!"
else
    echo ".env file already exists"
fi

# -----------------------------------------------------------------------------
# Setup complete
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Log out and back in (for docker group permissions)"
echo "   $ exit"
echo "   $ ssh <your-ec2-instance>"
echo ""
echo "2. Navigate to the app directory:"
echo "   $ cd /opt/manuscript-processor"
echo ""
echo "3. Review/edit environment variables:"
echo "   $ nano .env"
echo ""
echo "4. Start the application:"
echo "   $ docker-compose -f docker-compose.prod.yaml up -d --build"
echo ""
echo "5. View logs:"
echo "   $ docker-compose -f docker-compose.prod.yaml logs -f"
echo ""
echo "6. Open in browser:"
echo "   http://<your-server-ip>"
echo ""
echo "=========================================="
