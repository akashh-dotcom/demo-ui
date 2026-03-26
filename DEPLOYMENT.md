# Deployment Guide

This guide covers deploying the Manuscript Processor to AWS EC2 with Docker Compose.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    EC2 Instance                          │   │
│   │                                                          │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│   │   │  Frontend   │  │   Backend   │  │  PDF/EPUB   │     │   │
│   │   │   (nginx)   │  │   (Node)    │  │   (mocks)   │     │   │
│   │   │   :80       │  │   :5000     │  │  :8000/5001 │     │   │
│   │   └─────────────┘  └─────────────┘  └─────────────┘     │   │
│   │         │                │                │              │   │
│   │         └────────────────┴────────────────┘              │   │
│   │                          │                               │   │
│   └──────────────────────────┼───────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              MongoDB Atlas (External)                    │   │
│   │         mongodb+srv://...mongodb.net                     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **AWS Account** with EC2 access
2. **MongoDB Atlas** account (free tier works)
3. **GitHub repository** with this code
4. **Domain name** (optional, for HTTPS)

---

## Step 1: MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free M0 cluster
3. Create a database user:
   - Click "Database Access" → "Add New Database User"
   - Choose password authentication
   - Note the username and password
4. Configure network access:
   - Click "Network Access" → "Add IP Address"
   - For testing: "Allow Access from Anywhere" (0.0.0.0/0)
   - For production: Add your EC2 IP only
5. Get connection string:
   - Click "Connect" → "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your password

Example:
```
mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/manuscript-processor
```

---

## Step 2: Launch EC2 Instance

### Option A: AWS Console

1. Go to EC2 Dashboard → "Launch Instance"
2. Configure:
   - **Name**: `manuscript-processor`
   - **AMI**: Amazon Linux 2023 or Ubuntu 22.04
   - **Instance type**: `t3.small` (2 GB RAM minimum)
   - **Key pair**: Create or select existing
   - **Security Group**: Create new with these rules:

| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | Your IP | SSH access |
| HTTP | 80 | 0.0.0.0/0 | Frontend |
| Custom TCP | 5000 | 0.0.0.0/0 | Backend API |
| Custom TCP | 8000 | 0.0.0.0/0 | PDF API (optional) |
| Custom TCP | 5001 | 0.0.0.0/0 | EPUB API (optional) |

3. **Storage**: 20 GB gp3 (minimum)
4. Launch instance

### Option B: AWS CLI

```bash
# Create security group
aws ec2 create-security-group \
  --group-name manuscript-sg \
  --description "Manuscript Processor Security Group"

# Add rules
aws ec2 authorize-security-group-ingress \
  --group-name manuscript-sg \
  --protocol tcp --port 22 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-name manuscript-sg \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-name manuscript-sg \
  --protocol tcp --port 5000 --cidr 0.0.0.0/0

# Launch instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.small \
  --key-name your-key-pair \
  --security-groups manuscript-sg \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=manuscript-processor}]'
```

---

## Step 3: Setup EC2 Instance

SSH into your instance:

```bash
ssh -i your-key.pem ec2-user@<EC2-PUBLIC-IP>
# or for Ubuntu:
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

Run the setup script:

```bash
# Download and run setup script
curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/deploy/ec2-setup.sh | bash
```

Or manually:

```bash
# Install Docker (Amazon Linux 2023)
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes
exit
```

---

## Step 4: Deploy Application

```bash
# SSH back in
ssh -i your-key.pem ec2-user@<EC2-PUBLIC-IP>

# Clone repository
cd /opt
sudo mkdir -p manuscript-processor
sudo chown $USER:$USER manuscript-processor
cd manuscript-processor
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .

# Create environment file
cat > .env << 'EOF'
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/manuscript-processor
JWT_SECRET=your-super-secret-jwt-key-change-this
FRONTEND_URL=http://YOUR_EC2_IP
VITE_API_URL=http://YOUR_EC2_IP:5000/api
USE_EXTERNAL_APIS=true
NODE_ENV=production
EOF

# Start the application
docker-compose -f docker-compose.prod.yaml up -d --build

# View logs
docker-compose -f docker-compose.prod.yaml logs -f
```

---

## Step 5: Setup GitHub Actions (CI/CD)

### Required Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `EC2_HOST` | Your EC2 public IP or domain |
| `EC2_USER` | `ec2-user` (Amazon Linux) or `ubuntu` |
| `EC2_SSH_PRIVATE_KEY` | Contents of your .pem file |
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `JWT_SECRET` | A secure random string |
| `FRONTEND_URL` | `http://your-ec2-ip` |
| `VITE_API_URL` | `http://your-ec2-ip:5000/api` |

### Generate SSH Key for Deployment

```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -f deploy_key -N ""

# Copy public key to EC2
ssh -i your-key.pem ec2-user@<EC2-IP> 'cat >> ~/.ssh/authorized_keys' < deploy_key.pub

# Add private key content to GitHub secret EC2_SSH_PRIVATE_KEY
cat deploy_key
```

---

## Step 6: Verify Deployment

```bash
# Check running containers
docker-compose -f docker-compose.prod.yaml ps

# Check logs
docker-compose -f docker-compose.prod.yaml logs backend
docker-compose -f docker-compose.prod.yaml logs frontend

# Test endpoints
curl http://localhost:5000/api/health
curl http://localhost/health
```

Open in browser: `http://<EC2-PUBLIC-IP>`

---

## Maintenance Commands

```bash
# View logs
docker-compose -f docker-compose.prod.yaml logs -f

# Restart services
docker-compose -f docker-compose.prod.yaml restart

# Stop services
docker-compose -f docker-compose.prod.yaml down

# Update and redeploy
git pull origin main
docker-compose -f docker-compose.prod.yaml up -d --build

# Clean up disk space
docker system prune -af
```

---

## Adding HTTPS with Let's Encrypt

1. Point a domain to your EC2 IP
2. Install certbot:

```bash
sudo dnf install -y certbot python3-certbot-nginx  # Amazon Linux
# or
sudo apt install -y certbot python3-certbot-nginx  # Ubuntu
```

3. Get certificate:

```bash
sudo certbot --nginx -d yourdomain.com
```

---

## Troubleshooting

### Container won't start
```bash
docker-compose -f docker-compose.prod.yaml logs backend
# Check for MongoDB connection errors, missing env vars
```

### MongoDB connection failed
- Check MONGODB_URI is correct
- Check IP whitelist in MongoDB Atlas
- Check security group allows outbound traffic

### Frontend can't reach backend
- Verify VITE_API_URL matches your server IP/domain
- Check security group allows port 5000
- Rebuild frontend: `docker-compose -f docker-compose.prod.yaml build frontend`

---

## Cost Estimation

| Resource | Monthly Cost |
|----------|--------------|
| EC2 t3.small | ~$15-20 |
| MongoDB Atlas M0 | Free |
| Data transfer | ~$5-10 |
| **Total** | **~$20-30/month** |

---

## Future: Migrating to Fargate/Kubernetes

When you're ready to scale:

1. **Fargate**: Use AWS Copilot or CDK to deploy containers
2. **EKS**: Create Kubernetes manifests from docker-compose

The Dockerfiles and compose configuration are already compatible with these platforms.
