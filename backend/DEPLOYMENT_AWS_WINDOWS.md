# AWS EC2 Windows Server Deployment Guide

This guide covers deploying the application on AWS EC2 Windows Server instance.

## Prerequisites

- AWS Account with EC2 access
- Basic knowledge of Windows Server administration
- RDP client for connecting to Windows instance

## Step 1: Launch EC2 Windows Instance

### 1.1 Create EC2 Instance

1. Go to AWS EC2 Console
2. Click **Launch Instance**
3. Configure:
   - **Name**: demo-ui-server (or your preferred name)
   - **AMI**: Windows Server 2022 Base (or latest)
   - **Instance Type**: t3.medium (minimum) or t3.large (recommended)
   - **Key Pair**: Create new or use existing for RDP access
   - **Storage**: 30 GB minimum (50 GB recommended)

### 1.2 Security Group Configuration

Configure inbound rules:
```
Type            Protocol    Port Range    Source          Description
RDP             TCP         3389          Your IP         Remote Desktop
HTTP            TCP         80            0.0.0.0/0       HTTP
HTTPS           TCP         443           0.0.0.0/0       HTTPS
Custom TCP      TCP         5000          0.0.0.0/0       Backend API
Custom TCP      TCP         4201          0.0.0.0/0       Frontend (if needed)
```

### 1.3 Connect to Instance

1. Wait for instance to be "Running"
2. Get Windows password:
   - Select instance → **Connect** → **RDP client**
   - Click **Get Password**
   - Upload your key pair file
   - Copy the decrypted password
3. Use RDP to connect with Administrator user

## Step 2: Install Required Software

### 2.1 Install Node.js

1. Open PowerShell as Administrator
2. Download and install Node.js:

```powershell
# Using Chocolatey (recommended)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Node.js
choco install nodejs-lts -y

# Verify installation
node --version
npm --version
```

Or download manually from: https://nodejs.org/

### 2.2 Install Python 3

```powershell
# Using Chocolatey
choco install python -y

# Verify installation
python --version
pip --version
```

Or download from: https://www.python.org/downloads/

**Important**: During Python installation, check "Add Python to PATH"

### 2.3 Install Git

```powershell
choco install git -y

# Verify
git --version
```

Or download from: https://git-scm.com/download/win

### 2.4 Install Visual C++ Build Tools (for Python packages)

Some Python packages require C++ compilers:

```powershell
choco install visualstudio2022buildtools -y
```

Or download from: https://visualstudio.microsoft.com/downloads/

## Step 3: Clone and Setup Application

### 3.1 Clone Repository

```powershell
# Navigate to desired directory
cd C:\
mkdir apps
cd apps

# Clone your repository
git clone https://github.com/akashh-dotcom/demo-ui.git
cd demo-ui
```

### 3.2 Setup Backend

```powershell
cd backend

# Install Node.js dependencies
npm install

# Create uploads and outputs directories
mkdir uploads, outputs, temp -Force
```

## Step 4: Configure Python Converters

### 4.1 Setup PDFtoXMLUsingExcel Converter

```powershell
cd PDFtoXMLUsingExcel

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Deactivate
deactivate

cd ..
```

### 4.2 Setup RittDocConverter

```powershell
cd RittDocConverter

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies (if requirements.txt exists)
pip install --upgrade pip
# If you have a requirements.txt:
pip install -r requirements.txt
# Otherwise install common packages:
pip install lxml beautifulsoup4 pillow

# Deactivate
deactivate

cd ..
```

## Step 5: Configure Environment Variables

### 5.1 Create .env File

In the `backend` directory, create `.env` file:

```powershell
# Copy from example
copy .env.example .env

# Edit with notepad
notepad .env
```

### 5.2 Configure .env for Windows

Update the `.env` file with Windows-specific paths:

```env
# Server Configuration
PORT=5000
NODE_ENV=production

# MongoDB Configuration
MONGODB_URI=mongodb+srv://akashh_db_user1:CWuy4lk400DQMZlf@cluster0.brymbbc.mongodb.net/?appName=Cluster0

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_CHANGE_THIS
JWT_EXPIRE=7d

# Frontend URL (use your EC2 public IP or domain)
FRONTEND_URL=http://YOUR_EC2_PUBLIC_IP:4201

# Email Configuration
EMAIL_ENABLED=true
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=akashh@zentrovia.tech
EMAIL_PASS=xarr gvwr bfcs advo

# =============================================================================
# PDF Converter Configuration - WINDOWS PATHS
# =============================================================================
# Use backslashes or forward slashes (Node.js handles both)
PDF_CONVERTER_DIR=./PDFtoXMLUsingExcel
PDF_CONVERTER_PYTHON=./PDFtoXMLUsingExcel/venv/Scripts/python.exe
PDF_CONVERTER_SCRIPT=pdf_to_unified_xml.py

# =============================================================================
# EPUB/RittDoc Converter Configuration - WINDOWS PATHS
# =============================================================================
CONVERTER_PYTHON=./RittDocConverter/venv/Scripts/python.exe
CONVERTER_SCRIPT_PATH=./RittDocConverter/integrated_pipeline.py
```

**Important Notes**:
- Replace `YOUR_EC2_PUBLIC_IP` with your actual EC2 public IP
- Change `JWT_SECRET` to a strong random string
- The paths use `./` which works on Windows with Node.js

## Step 6: Test the Application

### 6.1 Test Backend

```powershell
cd C:\apps\demo-ui\backend

# Start the server
npm start
```

You should see:
```
Server running on port 5000
Environment: production
MongoDB: Connected
WebSocket: Enabled
```

### 6.2 Test Converters

Open a new PowerShell window:

```powershell
# Test PDF converter
cd C:\apps\demo-ui\backend\PDFtoXMLUsingExcel
.\venv\Scripts\python.exe pdf_to_unified_xml.py --help

# Test EPUB converter (if integrated_pipeline.py exists)
cd C:\apps\demo-ui\backend\RittDocConverter
.\venv\Scripts\python.exe integrated_pipeline.py --help
```

## Step 7: Setup as Windows Service (Production)

### 7.1 Install PM2 (Process Manager)

```powershell
npm install -g pm2
npm install -g pm2-windows-startup

# Configure PM2 to start on boot
pm2-startup install
```

### 7.2 Start Application with PM2

```powershell
cd C:\apps\demo-ui\backend

# Start application
pm2 start server.js --name demo-ui-backend

# Save PM2 configuration
pm2 save

# Check status
pm2 status
pm2 logs demo-ui-backend
```

### 7.3 PM2 Useful Commands

```powershell
pm2 restart demo-ui-backend    # Restart app
pm2 stop demo-ui-backend       # Stop app
pm2 delete demo-ui-backend     # Remove from PM2
pm2 logs demo-ui-backend       # View logs
pm2 monit                      # Monitor
```

## Step 8: Configure Windows Firewall

```powershell
# Allow Node.js through firewall
New-NetFirewallRule -DisplayName "Node.js Server" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow

# If running frontend on same server
New-NetFirewallRule -DisplayName "Frontend Server" -Direction Inbound -Protocol TCP -LocalPort 4201 -Action Allow
```

## Step 9: Setup Frontend (Optional)

If deploying frontend on same server:

```powershell
cd C:\apps\demo-ui\frontend

# Install dependencies
npm install

# Build for production
npm run build

# Or run dev server
# Update .env with backend URL
# VITE_API_URL=http://YOUR_EC2_PUBLIC_IP:5000
pm2 start "npm run dev" --name demo-ui-frontend
pm2 save
```

## Step 10: Configure Nginx or IIS (Optional)

### Option A: Using IIS

1. Install IIS:
```powershell
Install-WindowsFeature -name Web-Server -IncludeManagementTools
```

2. Install URL Rewrite Module and ARR (Application Request Routing)
3. Configure reverse proxy to Node.js app

### Option B: Using Nginx for Windows

```powershell
choco install nginx -y

# Edit nginx.conf
notepad C:\tools\nginx\conf\nginx.conf
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4201;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Python Path Issues

If you get "Python not found" errors:

```powershell
# Use absolute paths in .env
PDF_CONVERTER_PYTHON=C:\apps\demo-ui\backend\PDFtoXMLUsingExcel\venv\Scripts\python.exe
CONVERTER_PYTHON=C:\apps\demo-ui\backend\RittDocConverter\venv\Scripts\python.exe
```

### Port Already in Use

```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill process (replace PID with actual number)
taskkill /PID <PID> /F
```

### MongoDB Connection Issues

- Check EC2 security group allows outbound HTTPS (443)
- Verify MongoDB Atlas whitelist includes EC2 IP or use 0.0.0.0/0
- Test connection: `ping cluster0.brymbbc.mongodb.net`

### Module Not Found Errors

```powershell
# Reinstall dependencies
cd C:\apps\demo-ui\backend
rm -r node_modules
npm install
```

### Python Package Errors

```powershell
# Reinstall in virtual environment
cd PDFtoXMLUsingExcel
.\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt --force-reinstall
deactivate
```

## Security Best Practices

1. **Change Default Passwords**: Update JWT_SECRET, database passwords
2. **Enable HTTPS**: Use Let's Encrypt or AWS Certificate Manager
3. **Update Security Groups**: Restrict RDP (3389) to your IP only
4. **Windows Updates**: Keep server updated
5. **Backup**: Configure automated backups
6. **Monitoring**: Set up CloudWatch for monitoring

## Accessing Your Application

After deployment:
- **Backend API**: `http://YOUR_EC2_PUBLIC_IP:5000`
- **Frontend**: `http://YOUR_EC2_PUBLIC_IP:4201`
- **Health Check**: `http://YOUR_EC2_PUBLIC_IP:5000/api/health`

## Updating the Application

```powershell
cd C:\apps\demo-ui

# Pull latest changes
git pull origin main

# Update backend
cd backend
npm install
pm2 restart demo-ui-backend

# Update frontend (if applicable)
cd ..\frontend
npm install
npm run build
pm2 restart demo-ui-frontend
```

## Next Steps

1. Configure domain name (Route 53)
2. Set up SSL/TLS certificates
3. Configure automated backups
4. Set up monitoring and alerts
5. Configure log rotation
6. Set up CI/CD pipeline

## Support

For issues:
- Check PM2 logs: `pm2 logs demo-ui-backend`
- Check Windows Event Viewer
- Review backend logs in `backend/logs/` directory
