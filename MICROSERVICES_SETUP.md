# Microservices Architecture Setup Guide

This guide explains how to set up and run the Manuscript Processor with the new microservices architecture, integrating external PDF and EPUB processing pipelines.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                         │
│                            Port 3000                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Backend Gateway (Node.js/Express)                   │
│                            Port 5000                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  • User Authentication (JWT)                                     │   │
│  │  • File Upload & Job Tracking                                    │   │
│  │  • Job-User Association for Reporting                            │   │
│  │  • Routes to External Processing APIs                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                         │                        │
              ┌──────────┘                        └──────────┐
              ▼                                              ▼
┌─────────────────────────────┐              ┌─────────────────────────────┐
│   PDF Processing API        │              │   EPUB Processing API       │
│      Port 8000              │              │      Port 5001              │
│  ┌───────────────────────┐  │              │  ┌───────────────────────┐  │
│  │ • PDF to XML/DocBook  │  │              │  │ • EPUB to XML         │  │
│  │ • AI-assisted editing │  │              │  │ • Publisher configs   │  │
│  │ • Finalization        │  │              │  │ • Chapter management  │  │
│  └───────────────────────┘  │              │  └───────────────────────┘  │
│         │                   │              │         │                   │
│         ▼                   │              │         ▼                   │
│  ┌───────────────────────┐  │              │  ┌───────────────────────┐  │
│  │   PDF Editor          │  │              │  │   EPUB Editor         │  │
│  │   (Built-in)          │  │              │  │   Port 5000           │  │
│  └───────────────────────┘  │              │  └───────────────────────┘  │
└─────────────────────────────┘              └─────────────────────────────┘
                                    │
                                    ▼
                        ┌─────────────────────┐
                        │    MongoDB          │
                        │    Port 27017       │
                        └─────────────────────┘
```

## Processing Workflow

1. **Upload**: User uploads PDF/EPUB via frontend
2. **Detection**: Backend detects file type and routes to appropriate API
3. **Processing**: External API converts file to structured XML
4. **Review**: File status changes to `ready_for_review`
5. **Edit**: User clicks "Open Editor" - external editor opens in new tab
6. **Finalize**: User clicks "Finalize" when done editing
7. **Complete**: Final output files are generated and available for download

## Status Flow

```
uploaded → processing → ready_for_review → editing → finalizing → completed
                              │                           │
                              └─────────────────────────────→ failed
```

## Quick Start (Development with Mock Services)

### Prerequisites
- Docker and Docker Compose installed
- Node.js 18+ (for local development without Docker)

### Option 1: Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd demo-ui
   ```

2. **Create environment files**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. **Start all services**
   ```bash
   docker-compose up --build
   ```

   This starts:
   - Frontend at http://localhost:3000
   - Backend at http://localhost:5000
   - Mock PDF API at http://localhost:8000
   - Mock EPUB API at http://localhost:5001
   - MongoDB at localhost:27017

4. **Access the application**
   Open http://localhost:3000 in your browser

### Option 2: Local Development

1. **Start MongoDB**
   ```bash
   docker run -d -p 27017:27017 --name manuscript-mongo mongo:5.0
   ```

2. **Start Mock Services**
   ```bash
   # Terminal 1 - PDF Mock API
   cd mocks/pdf-api
   npm install
   npm start

   # Terminal 2 - EPUB Mock API
   cd mocks/epub-api
   npm install
   npm start
   ```

3. **Start Backend**
   ```bash
   # Terminal 3
   cd backend
   cp .env.example .env
   # Edit .env and set USE_EXTERNAL_APIS=true
   npm install
   npm run dev
   ```

4. **Start Frontend**
   ```bash
   # Terminal 4
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```

## Production Setup (Real External APIs)

### Environment Configuration

Update `backend/.env`:

```env
# Enable external API mode
USE_EXTERNAL_APIS=true

# PDF Processing API
PDF_API_URL=https://your-pdf-api.example.com
PDF_API_TIMEOUT=30000
PDF_POLL_INTERVAL=2000

# EPUB Processing API
EPUB_API_URL=https://your-epub-api.example.com
EPUB_API_TIMEOUT=30000
EPUB_POLL_INTERVAL=2000

# EPUB Editor Service
EPUB_EDITOR_URL=https://your-epub-editor.example.com
```

### Docker Compose for Production

1. **Comment out mock services in docker-compose.yaml**

2. **Update environment variables**
   ```yaml
   backend:
     environment:
       USE_EXTERNAL_APIS: "true"
       PDF_API_URL: https://your-pdf-api.example.com
       EPUB_API_URL: https://your-epub-api.example.com
       EPUB_EDITOR_URL: https://your-epub-editor.example.com
   ```

3. **Remove mock service dependencies**
   ```yaml
   backend:
     depends_on:
       - mongo
       # Remove: - pdf-api
       # Remove: - epub-api
   ```

## API Contract

### Backend Gateway Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files/upload` | POST | Upload file for processing |
| `/api/files` | GET | List user's files |
| `/api/files/:id` | GET | Get file details |
| `/api/files/:id/editor` | POST | Launch editor |
| `/api/files/:id/finalize` | POST | Finalize document |
| `/api/files/:id/download/:filename` | GET | Download output file |
| `/api/config/health` | GET | Check external service health |
| `/api/config/dashboard` | GET | Aggregated dashboard stats |

### External PDF API (Expected Contract)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/convert` | POST | Start conversion job |
| `/jobs/:jobId` | GET | Get job status |
| `/jobs/:jobId/editor` | POST | Launch editor |
| `/jobs/:jobId/editor/stop` | POST | Stop editor |
| `/jobs/:jobId/finalize` | POST | Finalize conversion |
| `/jobs/:jobId/files` | GET | List output files |
| `/jobs/:jobId/files/:filename` | GET | Download file |
| `/dashboard` | GET | Get stats |

### External EPUB API (Expected Contract)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/convert` | POST | Start conversion job |
| `/api/jobs/:jobId` | GET | Get job status |
| `/api/jobs/:jobId/download` | GET | Download result |
| `/api/editor/load` | POST | Load in editor |
| `/api/editor/save` | POST | Save and finalize |
| `/api/publishers` | GET/POST | Manage publishers |
| `/api/dashboard` | GET | Get stats |

## File Model Changes

The File model has been extended with:

```javascript
{
  // Existing fields...

  // External API integration
  externalJobId: String,      // Job ID from external API
  externalService: String,    // 'pdf', 'epub', or 'local'
  editorUrl: String,          // URL to external editor

  // Extended status enum
  status: [
    'uploaded',
    'pending',
    'processing',
    'ready_for_review',
    'editing',
    'finalizing',
    'completed',
    'failed'
  ]
}
```

## Feature Flag

The system supports gradual migration via the `USE_EXTERNAL_APIS` flag:

- `false` (default): Uses legacy local Python converters
- `true`: Routes to external PDF/EPUB APIs

This allows running both systems in parallel during migration.

## Troubleshooting

### Mock Services Not Starting

```bash
# Check if ports are in use
lsof -i :8000
lsof -i :5001

# Kill processes if needed
kill -9 <PID>
```

### External API Connection Errors

1. Check if external services are running:
   ```bash
   curl http://localhost:8000/health
   curl http://localhost:5001/health
   ```

2. Verify environment variables are set correctly

3. Check backend logs for connection errors

### Editor Not Opening

1. Verify `editorUrl` is being returned from the external API
2. Check browser popup blocker settings
3. Ensure CORS is configured correctly on external services

## Development Notes

### Adding New External Services

1. Create a new service file in `backend/services/`
2. Add API client functions following the pattern in `pdfApiService.js`
3. Update `fileController.js` to route based on file type
4. Add configuration to `.env.example`

### Testing

```bash
# Run backend tests
cd backend
npm test

# Run frontend tests
cd frontend
npm test
```

## Support

For issues, please create a ticket at:
https://github.com/akashh-dotcom/demo-ui/issues
