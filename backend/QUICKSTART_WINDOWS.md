# Quick Start Guide - AWS EC2 Windows Server

This is a condensed guide to get your application running quickly on AWS EC2 Windows Server.

## Prerequisites

✅ AWS EC2 Windows Server instance running
✅ RDP access to the instance
✅ Administrator access

## Fast Setup (3 Steps)

### Step 1: Connect and Clone

1. **Connect via RDP** to your EC2 instance
2. **Open PowerShell as Administrator**
3. **Clone the repository**:

```powershell
cd C:\
mkdir apps
cd apps
git clone https://github.com/akashh-dotcom/demo-ui.git
cd demo-ui\backend
```

### Step 2: Run Automated Setup

```powershell
# Enable script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Run setup script
.\setup-windows.ps1
```

The script will:
- Check and install Node.js, Python, Git (with your permission)
- Install all Node.js dependencies
- Setup Python virtual environments for converters
- Create required directories
- Configure Windows Firewall
- Install PM2 process manager
- Create .env file from template

### Step 3: Configure and Start

```powershell
# Edit environment variables
notepad .env
```

**Update these required fields in .env**:
- `FRONTEND_URL=http://YOUR_EC2_PUBLIC_IP:4201`
- `JWT_SECRET=` (generate a strong random string)
- Verify MongoDB URI and email settings

**Start the application**:

```powershell
# Option A: Start with npm (for testing)
npm start

# Option B: Start with PM2 (recommended for production)
pm2 start server.js --name demo-ui-backend
pm2 save
pm2 logs demo-ui-backend
```

## Verify Installation

Open browser and navigate to:
- **Health Check**: `http://YOUR_EC2_PUBLIC_IP:5000/api/health`
- **API Root**: `http://YOUR_EC2_PUBLIC_IP:5000`

You should see a JSON response indicating the server is running.

## EC2 Security Group

Make sure your EC2 Security Group allows:
```
Port 5000 (Backend API) - TCP from 0.0.0.0/0
Port 3389 (RDP) - TCP from YOUR_IP (restrict for security)
```

## Common Commands

### PM2 Management
```powershell
pm2 status                    # View status
pm2 logs demo-ui-backend      # View logs
pm2 restart demo-ui-backend   # Restart app
pm2 stop demo-ui-backend      # Stop app
pm2 monit                     # Monitor resources
```

### Troubleshooting
```powershell
# Test converters
cd PDFtoXMLUsingExcel
.\venv\Scripts\python.exe pdf_to_unified_xml.py --help

cd ..\RittDocConverter
.\venv\Scripts\python.exe integrated_pipeline.py --help

# Check ports
netstat -ano | findstr :5000

# View logs
pm2 logs demo-ui-backend --lines 100
```

## Manual Setup (If Script Fails)

If the automated script doesn't work, follow these manual steps:

### 1. Install Software
```powershell
# Install Chocolatey
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install packages
choco install nodejs-lts python git -y
```

### 2. Setup Backend
```powershell
cd C:\apps\demo-ui\backend
npm install
copy .env.example .env
mkdir uploads, outputs, temp
```

### 3. Setup Converters
```powershell
# PDF Converter
cd PDFtoXMLUsingExcel
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
deactivate

# EPUB Converter
cd ..\RittDocConverter
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install lxml beautifulsoup4 pillow
deactivate

cd ..
```

### 4. Configure .env
Edit `.env` file with your settings (see Step 3 above)

### 5. Start Application
```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start server.js --name demo-ui-backend
pm2 save
```

## Get Your EC2 Public IP

```powershell
# From EC2 instance
Invoke-RestMethod -Uri http://169.254.169.254/latest/meta-data/public-ipv4
```

Or check in AWS Console → EC2 → Instances → Your Instance → Public IPv4 address

## Next Steps

✅ Configure domain name (optional)
✅ Setup SSL certificate (optional)
✅ Deploy frontend (if needed)
✅ Setup automated backups
✅ Configure monitoring

## Need Help?

- **Detailed Guide**: See `DEPLOYMENT_AWS_WINDOWS.md`
- **PM2 Logs**: `pm2 logs demo-ui-backend`
- **Application Logs**: Check `logs/` directory
- **Windows Event Viewer**: For system-level issues

## Security Checklist

- [ ] Change JWT_SECRET in .env
- [ ] Restrict RDP access to your IP only
- [ ] Update Windows Server
- [ ] Configure SSL/HTTPS
- [ ] Enable Windows Firewall
- [ ] Setup automated backups
- [ ] Monitor with CloudWatch

---

**Estimated Setup Time**: 15-30 minutes

For production deployment best practices, refer to `DEPLOYMENT_AWS_WINDOWS.md`
