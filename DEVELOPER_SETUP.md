# Developer Setup Guide

Quick guide to run the complete Manuscript Processor stack locally.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- [Git](https://git-scm.com/downloads) installed
- Access to the GitHub repositories

---

## Step 1: Clone All Repositories

```bash
# Create project folder
mkdir ~/ritt-projects
cd ~/ritt-projects

# Clone all 3 repos
git clone https://github.com/akashh-dotcom/demo-ui.git
git clone https://github.com/akashh-dotcom/PDFtoXMLUsingExcel.git
git clone https://github.com/akashh-dotcom/RittDocConverter.git
```

---

## Step 2: Create Environment File

```bash
cd ~/ritt-projects/demo-ui

# Create .env file
cat > .env << 'EOF'
MONGODB_URI=mongodb+srv://ritt_admin:rittdbuser@cluster0.lk4msmt.mongodb.net/RittenhouseXMLConverter?appName=Cluster0
JWT_SECRET=dev-secret-change-in-production
HOST_IP=localhost
NODE_ENV=development
USE_EXTERNAL_APIS=true
FRONTEND_URL=http://localhost:3000
VITE_API_URL=http://localhost:5000/api
EOF
```

---

## Step 3: Start All Services

```bash
cd ~/ritt-projects/demo-ui

# Start everything
docker-compose -f docker-compose.master.yaml up --build
```

Wait for all services to start (first run may take 5-10 minutes to build).

---

## Step 4: Access the Application

| Service | URL |
|---------|-----|
| **Frontend (UI)** | http://localhost:3000 |
| **Backend API** | http://localhost:5000/api |
| **PDF API** | http://localhost:8000 |
| **EPUB API** | http://localhost:5001 |
| **EPUB Editor** | http://localhost:5002 |

---

## Common Commands

```bash
# Start all services
docker-compose -f docker-compose.master.yaml up --build

# Start in background (detached mode)
docker-compose -f docker-compose.master.yaml up -d --build

# View logs
docker-compose -f docker-compose.master.yaml logs -f

# View logs for specific service
docker-compose -f docker-compose.master.yaml logs -f backend

# Stop all services
docker-compose -f docker-compose.master.yaml down

# Rebuild a specific service
docker-compose -f docker-compose.master.yaml up --build backend

# Remove everything (including volumes)
docker-compose -f docker-compose.master.yaml down -v
```

---

## Troubleshooting

### Port already in use
```bash
# Find what's using the port
lsof -i :3000  # or 5000, 8000, etc.

# Kill the process
kill -9 <PID>
```

### Docker build fails
```bash
# Clean Docker cache and rebuild
docker system prune -af
docker-compose -f docker-compose.master.yaml up --build
```

### Changes not reflecting
```bash
# Force rebuild without cache
docker-compose -f docker-compose.master.yaml build --no-cache
docker-compose -f docker-compose.master.yaml up
```

---

## Project Structure

```
~/ritt-projects/
├── demo-ui/                  # UI + Backend API
│   ├── frontend/             # React frontend
│   ├── backend/              # Node.js backend
│   └── docker-compose.master.yaml
├── PDFtoXMLUsingExcel/       # PDF Converter Service
└── RittDocConverter/         # EPUB Converter + Editor
```

---

## Need Help?

- Check container logs: `docker-compose -f docker-compose.master.yaml logs -f`
- Verify all containers are running: `docker ps`
