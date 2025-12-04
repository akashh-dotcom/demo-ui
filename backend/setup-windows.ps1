# ============================================================================
# Demo UI - Windows Server Setup Script
# ============================================================================
# This script automates the deployment setup on AWS EC2 Windows Server
# Run as Administrator
# ============================================================================

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Demo UI - Windows Server Setup" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Please run this script as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Function to check if a command exists
function Test-Command {
    param($Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

Write-Host "Step 1: Checking Prerequisites..." -ForegroundColor Yellow
Write-Host ""

# Check Node.js
if (Test-Command node) {
    $nodeVersion = node --version
    Write-Host "✓ Node.js is installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js is NOT installed" -ForegroundColor Red
    Write-Host "  Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    $install = Read-Host "Install Node.js using Chocolatey? (y/n)"
    if ($install -eq 'y') {
        Write-Host "Installing Chocolatey..." -ForegroundColor Yellow
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

        Write-Host "Installing Node.js..." -ForegroundColor Yellow
        choco install nodejs-lts -y

        # Refresh environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } else {
        Write-Host "Please install Node.js manually and run this script again." -ForegroundColor Red
        exit 1
    }
}

# Check Python
if (Test-Command python) {
    $pythonVersion = python --version
    Write-Host "✓ Python is installed: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Python is NOT installed" -ForegroundColor Red
    $install = Read-Host "Install Python using Chocolatey? (y/n)"
    if ($install -eq 'y') {
        choco install python -y
        # Refresh environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } else {
        Write-Host "Please install Python manually and run this script again." -ForegroundColor Red
        exit 1
    }
}

# Check Git
if (Test-Command git) {
    $gitVersion = git --version
    Write-Host "✓ Git is installed: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Git is NOT installed" -ForegroundColor Red
    $install = Read-Host "Install Git using Chocolatey? (y/n)"
    if ($install -eq 'y') {
        choco install git -y
        # Refresh environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    }
}

Write-Host ""
Write-Host "Step 2: Installing Backend Dependencies..." -ForegroundColor Yellow
Write-Host ""

# Get script directory (backend folder)
$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backendDir

# Install Node modules
Write-Host "Installing Node.js packages..." -ForegroundColor Cyan
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install Node.js packages" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Node.js packages installed successfully" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Setting up Python Converters..." -ForegroundColor Yellow
Write-Host ""

# Setup PDFtoXMLUsingExcel
Write-Host "Setting up PDFtoXMLUsingExcel converter..." -ForegroundColor Cyan
$pdfConverterDir = Join-Path $backendDir "PDFtoXMLUsingExcel"

if (Test-Path $pdfConverterDir) {
    Set-Location $pdfConverterDir

    # Create virtual environment
    Write-Host "  Creating virtual environment..." -ForegroundColor Cyan
    python -m venv venv

    if (Test-Path ".\venv\Scripts\Activate.ps1") {
        # Activate venv
        & .\venv\Scripts\Activate.ps1

        # Upgrade pip
        Write-Host "  Upgrading pip..." -ForegroundColor Cyan
        python -m pip install --upgrade pip --quiet

        # Install requirements
        if (Test-Path "requirements.txt") {
            Write-Host "  Installing Python packages..." -ForegroundColor Cyan
            pip install -r requirements.txt --quiet
            Write-Host "✓ PDFtoXMLUsingExcel setup complete" -ForegroundColor Green
        } else {
            Write-Host "⚠ No requirements.txt found in PDFtoXMLUsingExcel" -ForegroundColor Yellow
        }

        # Deactivate
        deactivate
    }
} else {
    Write-Host "⚠ PDFtoXMLUsingExcel directory not found" -ForegroundColor Yellow
}

# Setup RittDocConverter
Write-Host ""
Write-Host "Setting up RittDocConverter..." -ForegroundColor Cyan
$rittConverterDir = Join-Path $backendDir "RittDocConverter"
Set-Location $backendDir

if (Test-Path $rittConverterDir) {
    Set-Location $rittConverterDir

    # Create virtual environment
    Write-Host "  Creating virtual environment..." -ForegroundColor Cyan
    python -m venv venv

    if (Test-Path ".\venv\Scripts\Activate.ps1") {
        # Activate venv
        & .\venv\Scripts\Activate.ps1

        # Upgrade pip
        Write-Host "  Upgrading pip..." -ForegroundColor Cyan
        python -m pip install --upgrade pip --quiet

        # Install requirements
        if (Test-Path "requirements.txt") {
            Write-Host "  Installing Python packages..." -ForegroundColor Cyan
            pip install -r requirements.txt --quiet
            Write-Host "✓ RittDocConverter setup complete" -ForegroundColor Green
        } else {
            Write-Host "⚠ No requirements.txt found, installing common packages..." -ForegroundColor Yellow
            pip install lxml beautifulsoup4 pillow --quiet
            Write-Host "✓ RittDocConverter setup complete" -ForegroundColor Green
        }

        # Deactivate
        deactivate
    }
} else {
    Write-Host "⚠ RittDocConverter directory not found" -ForegroundColor Yellow
}

Set-Location $backendDir

Write-Host ""
Write-Host "Step 4: Creating Required Directories..." -ForegroundColor Yellow
Write-Host ""

# Create directories
$directories = @("uploads", "outputs", "temp")
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✓ Created directory: $dir" -ForegroundColor Green
    } else {
        Write-Host "✓ Directory already exists: $dir" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Step 5: Environment Configuration..." -ForegroundColor Yellow
Write-Host ""

# Check if .env exists
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "Copying .env.example to .env..." -ForegroundColor Cyan
        Copy-Item ".env.example" ".env"
        Write-Host "✓ .env file created" -ForegroundColor Green
        Write-Host ""
        Write-Host "⚠ IMPORTANT: Please edit .env file and update the following:" -ForegroundColor Yellow
        Write-Host "  - MONGODB_URI (your MongoDB connection string)" -ForegroundColor Yellow
        Write-Host "  - JWT_SECRET (change to a strong random string)" -ForegroundColor Yellow
        Write-Host "  - FRONTEND_URL (your EC2 public IP or domain)" -ForegroundColor Yellow
        Write-Host "  - EMAIL credentials (if using email features)" -ForegroundColor Yellow
        Write-Host ""

        # Ask if user wants to edit now
        $edit = Read-Host "Edit .env file now? (y/n)"
        if ($edit -eq 'y') {
            notepad .env
        }
    } else {
        Write-Host "✗ .env.example not found" -ForegroundColor Red
    }
} else {
    Write-Host "✓ .env file already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 6: Configuring Windows Firewall..." -ForegroundColor Yellow
Write-Host ""

# Configure firewall
try {
    $firewallRule = Get-NetFirewallRule -DisplayName "Node.js Server" -ErrorAction SilentlyContinue
    if (-not $firewallRule) {
        New-NetFirewallRule -DisplayName "Node.js Server" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow | Out-Null
        Write-Host "✓ Firewall rule created for port 5000" -ForegroundColor Green
    } else {
        Write-Host "✓ Firewall rule already exists" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ Could not configure firewall (may require admin privileges)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 7: Installing PM2 (Process Manager)..." -ForegroundColor Yellow
Write-Host ""

if (Test-Command pm2) {
    Write-Host "✓ PM2 is already installed" -ForegroundColor Green
} else {
    Write-Host "Installing PM2..." -ForegroundColor Cyan
    npm install -g pm2
    npm install -g pm2-windows-startup

    if (Test-Command pm2) {
        Write-Host "✓ PM2 installed successfully" -ForegroundColor Green

        # Configure startup
        $startup = Read-Host "Configure PM2 to start on Windows boot? (y/n)"
        if ($startup -eq 'y') {
            pm2-startup install
            Write-Host "✓ PM2 startup configured" -ForegroundColor Green
        }
    } else {
        Write-Host "⚠ PM2 installation may have failed" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Edit .env file with your configuration:" -ForegroundColor White
Write-Host "   notepad .env" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Test the application:" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Or start with PM2 (for production):" -ForegroundColor White
Write-Host "   pm2 start server.js --name demo-ui-backend" -ForegroundColor Gray
Write-Host "   pm2 save" -ForegroundColor Gray
Write-Host "   pm2 logs demo-ui-backend" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Access your application:" -ForegroundColor White
Write-Host "   Backend API: http://localhost:5000" -ForegroundColor Gray
Write-Host "   Health Check: http://localhost:5000/api/health" -ForegroundColor Gray
Write-Host ""
Write-Host "5. View PM2 status:" -ForegroundColor White
Write-Host "   pm2 status" -ForegroundColor Gray
Write-Host "   pm2 monit" -ForegroundColor Gray
Write-Host ""
Write-Host "For detailed deployment instructions, see:" -ForegroundColor Cyan
Write-Host "  DEPLOYMENT_AWS_WINDOWS.md" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Green
