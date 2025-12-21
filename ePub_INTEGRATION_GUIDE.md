# RittDoc EPUB Converter - Microservices Integration Guide

> **For Developer Agents**: This document provides comprehensive instructions for integrating the RittDoc EPUB processing pipeline with a full-stack UI project using a **microservices architecture**.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [OpenAPI Specification](#openapi-specification)
3. [Service Communication](#service-communication)
4. [Docker Deployment](#docker-deployment)
5. [Environment Configuration](#environment-configuration)
6. [API Gateway](#api-gateway)
7. [API Reference](#api-reference)
8. [Editor Component](#editor-component)
9. [UI Integration Patterns](#ui-integration-patterns)
10. [Developer Agent Prompts](#developer-agent-prompts)

---

## Architecture Overview

The RittDoc system uses a **microservices architecture** where each service runs independently in its own container and communicates via HTTP REST APIs.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              LOAD BALANCER                              │
│                         (nginx / traefik / etc)                         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│   UI SERVICE      │   │  EPUB SERVICE     │   │  OTHER SERVICES   │
│   (React/Next.js) │   │  (This Repo)      │   │  (Separate Repos) │
│                   │   │                   │   │                   │
│   Port: 3000      │   │   Port: 5001      │   │                   │
│                   │   │                   │   │                   │
│   - Dashboard     │   │   - /api/v1/*     │   │                   │
│   - Config UI     │   │   - Conversion    │   │                   │
│   - Upload        │   │   - Config APIs   │   │                   │
│   - Editor        │   │   - Dashboard     │   │                   │
└─────────┬─────────┘   └─────────┬─────────┘   └───────────────────┘
          │                       │
          │         ┌─────────────┴─────────────┐
          │         │                           │
          └─────────┤      MONGODB              │
                    │      Port: 27017          │
                    │                           │
                    │   - conversions           │
                    │   - publishers            │
                    │   - config                │
                    │   - jobs                  │
                    └───────────────────────────┘
```

### Key Principles

1. **Services communicate only via HTTP APIs** - No file sharing between services
2. **MongoDB is the shared data layer** - Dashboard data, config, publishers
3. **Each service is independently deployable** - Own Dockerfile, own scaling
4. **Configuration is fetched via API** - UI calls `/api/v1/config/schema` at runtime
5. **Stateless services** - No session state, all state in MongoDB

### Service URLs

| Service | Internal URL | External URL | Purpose |
|---------|--------------|--------------|---------|
| UI | `http://ui:3000` | `https://app.example.com` | Frontend |
| EPUB | `http://epub-service:5001` | `https://api.example.com/epub` | EPUB processing |
| MongoDB | `mongodb://mongodb:27017` | N/A (internal only) | Database |

---

## OpenAPI Specification

The API is fully documented using **OpenAPI 3.0** (formerly Swagger). This enables:

- **Auto-generated API clients** in any language
- **Interactive documentation** via Swagger UI
- **Request/response validation**
- **Type-safe integrations**

### Accessing the OpenAPI Spec

| Format | URL | Description |
|--------|-----|-------------|
| YAML | `GET /api/v1/openapi.yaml` | OpenAPI spec in YAML format |
| JSON | `GET /api/v1/openapi.json` | OpenAPI spec in JSON format |

### Quick Start

```bash
# Download the spec
curl http://localhost:5001/api/v1/openapi.yaml > openapi.yaml

# View in Swagger Editor (online)
# Copy contents to https://editor.swagger.io/

# Generate TypeScript client (using openapi-generator)
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:5001/api/v1/openapi.yaml \
  -g typescript-axios \
  -o ./src/api-client
```

### Using with Swagger UI

You can view the interactive API documentation by:

1. **Online**: Paste the spec URL into [Swagger Editor](https://editor.swagger.io/)
2. **Docker**: Run Swagger UI locally:

```bash
docker run -p 8080:8080 \
  -e SWAGGER_JSON_URL=http://host.docker.internal:5001/api/v1/openapi.json \
  swaggerapi/swagger-ui
```

Then open http://localhost:8080 to explore the API interactively.

### Generating Client SDKs

Use [OpenAPI Generator](https://openapi-generator.tech/) to generate clients:

```bash
# TypeScript/Axios (for React/Next.js)
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml -g typescript-axios -o ./client

# Python
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml -g python -o ./python-client

# Go
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml -g go -o ./go-client
```

### What's Documented

The OpenAPI spec includes:

| Category | Endpoints | Description |
|----------|-----------|-------------|
| Health | `/health`, `/info`, `/service-info` | Service status and discovery |
| Conversion | `/convert`, `/convert/batch`, `/reprocess` | EPUB conversion operations |
| Jobs | `/jobs`, `/jobs/{id}`, `/jobs/{id}/result` | Job management |
| Download | `/download/{id}`, `/download/{id}/report` | File downloads |
| Dashboard | `/mongodb/*` | Statistics and conversion history |
| Config | `/config/*` | Configuration management |
| Publishers | `/config/publishers/*` | Publisher profiles |

Each endpoint includes:
- Request parameters and body schemas
- Response schemas with examples
- Error response formats
- HTTP status codes

---

## Service Communication

### From UI to EPUB Service

The UI project should **never** import files from this repository. Instead, all communication happens via HTTP:

```typescript
// ❌ WRONG - Do not import files
import schema from 'rittdoc-converter/api/config/shared_config_schema.json';

// ✅ CORRECT - Fetch via API
const schema = await fetch(`${EPUB_API_URL}/api/v1/config/schema`).then(r => r.json());
```

### API Client Setup (UI Project)

Create an API client in your UI project:

```typescript
// services/api.ts

const EPUB_API_URL = process.env.NEXT_PUBLIC_EPUB_API_URL || 'http://localhost:5001';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  }

  async upload<T>(endpoint: string, file: File): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  }
}

export const epubApi = new ApiClient(EPUB_API_URL);
```

### Health Checks

Before making API calls, verify services are available:

```typescript
async function checkEpubService(): Promise<boolean> {
  try {
    const res = await fetch(`${EPUB_API_URL}/api/v1/health`, { timeout: 5000 });
    return res.ok;
  } catch {
    return false;
  }
}
```

---

## Docker Deployment

### Quick Start (Development)

```bash
# Clone and start EPUB service with MongoDB
git clone <this-repo>
cd RittDocConverter

# Copy environment file
cp .env.example .env

# Start services
docker-compose up -d

# View logs
docker-compose logs -f epub-service

# Service is available at http://localhost:5001
```

### Production Deployment

```bash
# Use production compose file
docker-compose -f docker-compose.prod.yml up -d
```

### Multi-Service Setup

Create a `docker-compose.yml` in your deployment repo that includes all services:

```yaml
# deployment/docker-compose.yml
version: '3.8'

services:
  # UI Service
  ui:
    image: your-registry/rittdoc-ui:latest
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_EPUB_API_URL=http://epub-service:5001
    depends_on:
      - epub-service
    networks:
      - rittdoc-network

  # EPUB Service (this repo)
  epub-service:
    image: your-registry/rittdoc-epub:latest
    ports:
      - "5001:5001"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017
      - MONGODB_DATABASE=rittdoc_converter
    depends_on:
      - mongodb
    networks:
      - rittdoc-network

  # Shared MongoDB
  mongodb:
    image: mongo:7.0
    volumes:
      - mongodb-data:/data/db
    networks:
      - rittdoc-network

networks:
  rittdoc-network:
    driver: bridge

volumes:
  mongodb-data:
```

### Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `EPUB_API_URL` | UI | URL to EPUB service |
| `MONGODB_URI` | EPUB | MongoDB connection string |
| `MONGODB_DATABASE` | EPUB | Database name |
| `MAX_CONCURRENT_JOBS` | EPUB | Processing parallelism |
| `LOG_LEVEL` | All | DEBUG, INFO, WARNING, ERROR |

---

## Environment Configuration

### The Problem

When moving between environments (local, staging, production, customer AWS), service URLs change:

```
Local:      http://localhost:5001
Staging:    https://api-staging.example.com/epub
Production: https://api.example.com/epub
Customer:   https://api.customer.example.com/epub
```

### The Solution: Environment-Based Configuration

The UI project should **never hardcode URLs**. Instead, use environment variables that are set per deployment.

### Environment Files

Pre-configured environment files are provided in `deploy/environments/`:

| File | Purpose |
|------|---------|
| `local.env` | Local development with Docker |
| `staging.env` | Staging/QA environment |
| `production.env` | Production deployment |
| `customer.env.template` | Template for customer deployments |

### UI Project Configuration

In your UI project, create environment files:

```bash
# .env.local (for local development)
NEXT_PUBLIC_API_GATEWAY_URL=http://localhost:5001
NEXT_PUBLIC_ENVIRONMENT=development

# .env.staging
NEXT_PUBLIC_API_GATEWAY_URL=https://api-staging.rittdoc.example.com
NEXT_PUBLIC_ENVIRONMENT=staging

# .env.production
NEXT_PUBLIC_API_GATEWAY_URL=https://api.rittdoc.example.com
NEXT_PUBLIC_ENVIRONMENT=production
```

### Dynamic Service Discovery

Each service exposes a `/api/v1/service-info` endpoint that returns:

```typescript
// Call this on app startup
const serviceInfo = await fetch(`${API_URL}/api/v1/service-info`).then(r => r.json());

// Response:
{
  "service": {
    "name": "epub-processor",
    "version": "2.0.0",
    "type": "conversion"
  },
  "environment": "production",
  "external_url": "https://api.example.com/epub",
  "endpoints": {
    "health": "/api/v1/health",
    "convert": "/api/v1/convert",
    "config": "/api/v1/config",
    "dashboard": "/api/v1/mongodb/dashboard"
  },
  "capabilities": ["epub_to_docbook", "batch_conversion", ...],
  "limits": {
    "max_file_size_mb": 100,
    "max_concurrent_jobs": 4
  }
}
```

### UI Service Discovery Pattern

```typescript
// services/serviceDiscovery.ts

interface ServiceInfo {
  service: { name: string; version: string };
  environment: string;
  endpoints: Record<string, string>;
  capabilities: string[];
  limits: { max_file_size_mb: number };
}

class ServiceRegistry {
  private services: Map<string, ServiceInfo> = new Map();
  private baseUrl: string;

  constructor() {
    // Get base URL from environment
    this.baseUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:5001';
  }

  async discoverServices(): Promise<void> {
    // Discover EPUB service
    try {
      const epubInfo = await fetch(`${this.baseUrl}/epub/api/v1/service-info`).then(r => r.json());
      this.services.set('epub', epubInfo);
    } catch (e) {
      console.warn('EPUB service not available');
    }
  }

  getService(name: string): ServiceInfo | undefined {
    return this.services.get(name);
  }

  hasCapability(service: string, capability: string): boolean {
    const info = this.services.get(service);
    return info?.capabilities.includes(capability) ?? false;
  }

  getEndpoint(service: string, endpoint: string): string {
    const info = this.services.get(service);
    const path = info?.endpoints[endpoint] || '';
    return `${this.baseUrl}/${service}${path}`;
  }
}

export const serviceRegistry = new ServiceRegistry();
```

---

## API Gateway

### Why Use an API Gateway?

Instead of the UI knowing about multiple service URLs, all traffic goes through a single gateway:

```
Without Gateway:
  UI → http://epub-service:5001/api/v1/convert

With Gateway:
  UI → https://api.example.com/epub/api/v1/convert
```

### Benefits

1. **Single URL** - UI only needs one base URL
2. **SSL Termination** - Gateway handles HTTPS
3. **Load Balancing** - Distribute traffic across instances
4. **Rate Limiting** - Protect against abuse
5. **Authentication** - Centralized auth handling

### Gateway Configuration Files

Pre-configured gateway files are in `deploy/gateway/`:

| File | Purpose |
|------|---------|
| `nginx.conf` | Nginx configuration |
| `traefik.yml` | Traefik configuration |
| `docker-compose.gateway.yml` | Docker setup with gateway |

### Using the Gateway

```bash
# Start with Traefik gateway
docker-compose -f docker-compose.yml -f deploy/gateway/docker-compose.gateway.yml up -d

# Gateway available at:
# - http://localhost (routes to UI)
# - http://localhost/epub/* (routes to EPUB service)
# - http://localhost:8080 (Traefik dashboard)
```

### Gateway Routing

| Path | Routes To |
|------|-----------|
| `/epub/*` | EPUB Service (strips /epub prefix) |
| `/api/v1/services` | Service discovery endpoint |
| `/health` | Gateway health check |
| `/*` | UI Service (catch-all) |

### UI Configuration with Gateway

When using the gateway, the UI only needs one URL:

```bash
# .env.production
NEXT_PUBLIC_API_GATEWAY_URL=https://api.example.com
```

```typescript
// API calls automatically route through gateway
const epubResponse = await fetch(`${GATEWAY_URL}/epub/api/v1/convert`, ...);
```

---

## API Reference

### Base Endpoints

All services expose these standard endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/info` | GET | API endpoint list |
| `/api/v1/service-info` | GET | Service discovery (capabilities, limits, environment) |

### Configuration APIs

**Fetch at runtime** - Do not hardcode or copy config files.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/config/schema` | GET | Full JSON schema with UI widget hints |
| `/api/v1/config/dropdown-options` | GET | All dropdown options for forms |
| `/api/v1/config` | GET | Current configuration values |
| `/api/v1/config` | PUT | Update configuration |
| `/api/v1/config/validate` | POST | Validate without saving |
| `/api/v1/config/reset` | POST | Reset to defaults |

**Example: Fetch Schema for Dynamic Form**
```typescript
// On config page load
const schema = await epubApi.get('/api/v1/config/schema');
// schema.properties contains field definitions with ui.widget hints
```

**Example: Fetch Dropdown Options**
```typescript
const { fields } = await epubApi.get('/api/v1/config/dropdown-options');
// fields is array of { path, title, widget, options, default }
```

### Publisher APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/config/publishers` | GET | List all publishers |
| `/api/v1/config/publishers` | POST | Create publisher |
| `/api/v1/config/publishers/{name}` | PUT | Update publisher |
| `/api/v1/config/publishers/{name}` | DELETE | Delete publisher |

### Dashboard APIs (MongoDB)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/mongodb/status` | GET | Check MongoDB connection |
| `/api/v1/mongodb/dashboard` | GET | Full dashboard data |
| `/api/v1/mongodb/statistics` | GET | Aggregated stats |
| `/api/v1/mongodb/conversions` | GET | Query with filters |
| `/api/v1/mongodb/recent` | GET | Recent conversions |
| `/api/v1/mongodb/failed` | GET | Failed conversions |

**Query Parameters for `/api/v1/mongodb/conversions`:**
- `status`: Success, Failure, In Progress
- `type`: ePub
- `start_date`, `end_date`: ISO date strings
- `limit`, `skip`: Pagination

### Conversion APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/convert` | POST | Start conversion (file upload) |
| `/api/v1/convert/batch` | POST | Batch convert |
| `/api/v1/reprocess` | POST | Reprocess edited package |
| `/api/v1/jobs` | GET | List all jobs |
| `/api/v1/jobs/{id}` | GET | Job status |
| `/api/v1/jobs/{id}` | DELETE | Cancel job |
| `/api/v1/download/{id}` | GET | Download result ZIP |
| `/api/v1/download/{id}/report` | GET | Download validation report |

---

## Editor Component

The RittDoc Editor is a web-based component for viewing and editing DocBook XML, with synchronized viewing of the source EPUB/PDF. It supports Package Mode for multi-chapter books.

### Editor Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RITTDOC EDITOR                                   │
├────────────────────────────────┬────────────────────────────────────────┤
│       SOURCE VIEWER            │          XML EDITOR                     │
│                                │                                         │
│   ┌──────────────────────┐    │   ┌─────────────────────────────────┐   │
│   │                      │    │   │ <?xml version="1.0"?>           │   │
│   │   EPUB/PDF Viewer    │    │   │ <book>                          │   │
│   │                      │    │   │   <chapter>                     │   │
│   │   (Continuous        │    │   │     <title>Chapter 1</title>    │   │
│   │    Scrolling)        │    │   │     <para>Content...</para>     │   │
│   │                      │    │   │   </chapter>                    │   │
│   └──────────────────────┘    │   └─────────────────────────────────┘   │
│                                │                                         │
│   [ << ] Page 1/10 [ >> ]      │   Mode: [XML] [HTML Preview] [HTML Edit]│
├────────────────────────────────┴────────────────────────────────────────┤
│  Chapter Navigator: [ch001.xml] [ch002.xml] [ch003.xml] ...             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Editor Deployment

The editor runs as a separate Flask server (standalone or alongside the API):

```bash
# Standalone editor
cd editor
pip install -r requirements.txt
python server.py --port 5000

# With specific files
python server.py --xml /path/to/doc.xml --pdf /path/to/file.epub
```

| Option | Description |
|--------|-------------|
| `--port` | Server port (default: 5000) |
| `--host` | Bind address (default: 127.0.0.1) |
| `--debug` | Enable debug mode |
| `--xml` | Path to XML file to edit |
| `--pdf` | Path to EPUB/PDF file for reference view |

### Package Mode

For multi-chapter EPUB conversions, the editor operates in **Package Mode**:

1. **Book.XML**: Main DocBook file that references chapters via entities:
   ```xml
   <!DOCTYPE book SYSTEM "RittDocBook.dtd" [
     <!ENTITY ch001 SYSTEM "ch001.xml">
     <!ENTITY ch002 SYSTEM "ch002.xml">
   ]>
   <book>
     &ch001;
     &ch002;
   </book>
   ```

2. **Chapter Files**: Individual XML files (ch001.xml, ch002.xml, etc.)

3. **Combined View**: Editor combines all chapters for viewing while editing individual files

4. **Auto-Reprocessing**: Saving triggers XSLT transformation, DTD fixes, and validation

### Editor API Endpoints

The editor exposes these REST API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main editor web interface |
| `/api/init` | GET | Auto-detect and load latest output files |
| `/api/init` | POST | Initialize with specific file paths |
| `/api/pdf` | GET | Serve PDF file for viewer |
| `/api/epub` | GET | Serve EPUB file for viewer |
| `/api/media/<filename>` | GET | Serve media files (images) |
| `/api/media-list` | GET | List available media files |
| `/api/save` | POST | Save XML or HTML changes |
| `/api/screenshot` | POST | Save screenshot from PDF viewer |
| `/api/render-html` | POST | Convert XML to HTML preview |
| `/api/render-book-html` | POST | Render combined book HTML |
| `/api/validate-dtd` | POST | Validate XML against RittDoc DTD |

**Package Mode Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/load-package` | POST | Load a ZIP package file |
| `/api/chapters` | GET | List chapters in current package |
| `/api/chapter/<filename>` | GET | Get specific chapter content |
| `/api/save-chapter` | POST | Save changes to a chapter |
| `/api/save-package` | POST | Save all changes and reprocess |

### Integrating Editor with UI

#### Option 1: Embed Editor in UI (iframe)

```typescript
// components/EditorEmbed.tsx
export function EditorEmbed({ packagePath }: { packagePath: string }) {
  const [editorUrl, setEditorUrl] = useState<string | null>(null);

  useEffect(() => {
    // Editor runs on separate port
    const EDITOR_URL = process.env.NEXT_PUBLIC_EDITOR_URL || 'http://localhost:5000';

    // Load package first
    fetch(`${EDITOR_URL}/api/load-package`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zipPath: packagePath })
    }).then(() => {
      setEditorUrl(EDITOR_URL);
    });
  }, [packagePath]);

  return editorUrl ? (
    <iframe
      src={editorUrl}
      style={{ width: '100%', height: '800px', border: 'none' }}
    />
  ) : (
    <div>Loading editor...</div>
  );
}
```

#### Option 2: Launch Editor in New Window

```typescript
// services/editor.ts
export async function openEditor(jobId: string): Promise<void> {
  const EDITOR_URL = process.env.NEXT_PUBLIC_EDITOR_URL || 'http://localhost:5000';

  // Get job result to find package path
  const job = await epubApi.get(`/api/v1/jobs/${jobId}/result`);

  if (job.output_file) {
    // Load package in editor
    await fetch(`${EDITOR_URL}/api/load-package`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zipPath: job.output_file })
    });

    // Open editor in new window
    window.open(EDITOR_URL, '_blank', 'width=1400,height=900');
  }
}
```

#### Option 3: Editor API Proxy

For deployment, proxy editor through the API gateway:

```yaml
# traefik.yml - Add editor routing
http:
  routers:
    editor:
      rule: "PathPrefix(`/editor`)"
      service: editor-service
  services:
    editor-service:
      loadBalancer:
        servers:
          - url: "http://editor:5000"
```

```typescript
// Now access editor through gateway
const EDITOR_URL = `${API_GATEWAY_URL}/editor`;
```

### Editor Workflow

```
┌────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Convert   │────►│  Edit in    │────►│  Save &      │────►│  Download   │
│  EPUB      │     │  Editor     │     │  Reprocess   │     │  Final ZIP  │
└────────────┘     └─────────────┘     └──────────────┘     └─────────────┘
      │                  │                    │
      ▼                  ▼                    ▼
 POST /convert      Open Editor        POST /save-package
 → job_id           (Package Mode)     → Validation
                         │             → DTD Fixes
                         ▼             → New ZIP
                    Edit chapters
                    Edit images
                    Validate DTD
```

### Environment Variables for Editor

| Variable | Description | Default |
|----------|-------------|---------|
| `EDITOR_PORT` | Editor server port | 5000 |
| `EDITOR_HOST` | Bind address | 127.0.0.1 |
| `EDITOR_DEBUG` | Enable debug mode | false |
| `NEXT_PUBLIC_EDITOR_URL` | Editor URL for UI | http://localhost:5000 |

**Example: Upload and Convert**
```typescript
async function convertFile(file: File) {
  // 1. Upload file
  const { job_id } = await epubApi.upload('/api/v1/convert', file);

  // 2. Poll for status
  let status;
  do {
    await new Promise(r => setTimeout(r, 2000));
    status = await epubApi.get(`/api/v1/jobs/${job_id}`);
  } while (status.status === 'running' || status.status === 'pending');

  // 3. Return result
  if (status.status === 'completed') {
    return { success: true, downloadUrl: `/api/v1/download/${job_id}` };
  } else {
    return { success: false, error: status.error };
  }
}
```

---

## UI Integration Patterns

### 1. Configuration Page

```typescript
// pages/config.tsx
import { useEffect, useState } from 'react';
import { epubApi } from '@/services/api';

export default function ConfigPage() {
  const [schema, setSchema] = useState(null);
  const [config, setConfig] = useState(null);
  const [dropdowns, setDropdowns] = useState([]);

  useEffect(() => {
    // Fetch everything from API on mount
    Promise.all([
      epubApi.get('/api/v1/config/schema'),
      epubApi.get('/api/v1/config'),
      epubApi.get('/api/v1/config/dropdown-options'),
    ]).then(([schema, configRes, dropdownRes]) => {
      setSchema(schema);
      setConfig(configRes.config);
      setDropdowns(dropdownRes.fields);
    });
  }, []);

  const handleSave = async (updates) => {
    await epubApi.post('/api/v1/config', {
      method: 'PUT',
      config: updates,
    });
  };

  // Render form based on schema
  return <DynamicForm schema={schema} values={config} onSave={handleSave} />;
}
```

### 2. Dashboard Page

```typescript
// pages/dashboard.tsx
export default function DashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const loadDashboard = async () => {
      const dashboard = await epubApi.get('/api/v1/mongodb/dashboard');
      setData(dashboard);
    };

    loadDashboard();
    const interval = setInterval(loadDashboard, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <StatsCards stats={data?.statistics} />
      <RecentConversions items={data?.recent_conversions} />
      <FailedConversions items={data?.failed_conversions} />
    </>
  );
}
```

### 3. File Upload Component

```typescript
// components/FileUpload.tsx
export function FileUpload({ onComplete }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);

  const handleUpload = async (file: File) => {
    setUploading(true);

    try {
      const { job_id } = await epubApi.upload('/api/v1/convert', file);

      // Poll for progress
      const pollStatus = async () => {
        const status = await epubApi.get(`/api/v1/jobs/${job_id}`);
        setProgress(status);

        if (status.status === 'completed') {
          onComplete({ success: true, jobId: job_id });
        } else if (status.status === 'failed') {
          onComplete({ success: false, error: status.error });
        } else {
          setTimeout(pollStatus, 2000);
        }
      };

      pollStatus();
    } catch (error) {
      onComplete({ success: false, error: error.message });
    }
  };

  return (
    <DropZone onDrop={handleUpload} disabled={uploading}>
      {progress && <ProgressBar value={progress.progress} />}
    </DropZone>
  );
}
```

---

## Developer Agent Prompts

Use these prompts when working on the UI project:

### Prompt 1: Initial API Integration

```
I need to integrate with the RittDocConverter EPUB service. The service runs at
${EPUB_API_URL} and communicates via REST APIs.

Please:
1. Create an API client service (services/epubApi.ts) with methods for:
   - Health check: GET /api/v1/health
   - Get config schema: GET /api/v1/config/schema
   - Get dropdown options: GET /api/v1/config/dropdown-options
   - Get/update config: GET/PUT /api/v1/config
   - Dashboard data: GET /api/v1/mongodb/dashboard
   - Start conversion: POST /api/v1/convert (file upload)
   - Get job status: GET /api/v1/jobs/{id}
   - Download result: GET /api/v1/download/{id}

2. Add environment variables:
   - NEXT_PUBLIC_EPUB_API_URL

3. Create error handling for API failures
4. Add TypeScript types for API responses

IMPORTANT: Do NOT copy any files from the EPUB service repo. All data must be
fetched via HTTP APIs at runtime.
```

### Prompt 2: Configuration UI

```
Create a Configuration Management page that fetches its structure from the API.

Requirements:
1. On page load, fetch:
   - GET /api/v1/config/schema (for form structure)
   - GET /api/v1/config (for current values)
   - GET /api/v1/config/dropdown-options (for select options)

2. Build a dynamic form based on schema.properties:
   - Check 'ui.widget' for widget type: dropdown, toggle, slider, text, etc.
   - Check 'ui.options' for select options
   - Handle nested objects (storage.s3.bucket_name)
   - Show/hide fields based on 'dependsOn' conditions

3. Group fields into sections:
   - Storage, Database, Processing, Scheduler, Quality, Notifications, Logging

4. Add buttons:
   - Save: PUT /api/v1/config with updated values
   - Validate: POST /api/v1/config/validate before saving
   - Reset: POST /api/v1/config/reset to restore defaults

5. Show success/error notifications after API calls
```

### Prompt 3: Dashboard Integration

```
Create a Dashboard page that displays conversion statistics from MongoDB.

Requirements:
1. Fetch GET /api/v1/mongodb/dashboard on page load

2. Display statistics cards:
   - Total conversions (statistics.total_conversions)
   - Successful (statistics.successful) - green
   - Failed (statistics.failed) - red
   - In Progress (statistics.in_progress) - yellow
   - Total images (statistics.total_images)
   - EPUB counts

3. Recent conversions table with columns:
   - Filename, Title, Status (badge), Type, Duration, Actions

4. Failed conversions section:
   - Show error messages
   - Add Retry button

5. Add filters using GET /api/v1/mongodb/conversions:
   - Status dropdown (Success, Failure, In Progress)
   - Date range picker
   - Use query params: ?status=X&start_date=Z

6. Auto-refresh every 30 seconds
```

### Prompt 4: File Upload & Conversion

```
Create a file upload component for starting EPUB conversions.

Requirements:
1. Drag-and-drop file upload area
2. Accept .epub, .epub3 files

3. Upload flow:
   - POST file to /api/v1/convert
   - Receive job_id
   - Poll GET /api/v1/jobs/{id} every 2 seconds
   - Show progress from response

4. On completion:
   - Success: Show download button linking to /api/v1/download/{id}
   - Failure: Show error message and retry option

5. Support batch upload:
   - POST to /api/v1/convert/batch with file list
   - Track each job independently
```

### Prompt 5: Publisher Management

```
Create a Publisher Management page for configuring publisher profiles.

Requirements:
1. List publishers from GET /api/v1/config/publishers
2. Table columns: Name, Confidence, Success Rate, Actions

3. Add Publisher modal with fields:
   - Name (required)
   - Confidence Base (slider 0-100)
   - Aliases (tag input)
   - ISBN Prefixes (tag input)
   - Known Issues (multi-line text)

4. CRUD operations:
   - Create: POST /api/v1/config/publishers
   - Update: PUT /api/v1/config/publishers/{name}
   - Delete: DELETE /api/v1/config/publishers/{name}

5. Color-code confidence:
   - 80+: green (auto-approve)
   - 50-79: yellow (notify)
   - <50: red (manual review)
```

### Prompt 6: Full Integration Review

```
Review the integration between UI and EPUB service:

1. Verify ALL data comes from APIs (no file imports from service repos)

2. Check API calls are correct:
   - Base URLs from environment variables
   - Correct HTTP methods
   - Proper error handling

3. Verify these API patterns:
   - Config schema fetched at runtime, not bundled
   - Dropdown options fetched at runtime
   - Dashboard data polled periodically
   - File uploads use FormData

4. Check service availability handling:
   - Health check on app start
   - Graceful degradation if service unavailable
   - Retry logic for failed requests

5. Verify Docker setup:
   - UI can reach EPUB service via internal network
   - Environment variables properly configured
   - CORS not blocking requests

6. Test complete workflows:
   - Upload EPUB file → conversion → download
   - Edit config → save → verify persisted
   - View dashboard → filter → pagination
```

---

## API Quick Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                    EPUB SERVICE API                             │
│                 http://epub-service:5001                        │
├─────────────────────────────────────────────────────────────────┤
│ HEALTH        GET  /api/v1/health                               │
│ INFO          GET  /api/v1/info                                 │
├─────────────────────────────────────────────────────────────────┤
│ CONFIG                                                          │
│ Schema        GET  /api/v1/config/schema                        │
│ Dropdowns     GET  /api/v1/config/dropdown-options              │
│ Get           GET  /api/v1/config                               │
│ Update        PUT  /api/v1/config                               │
│ Reset         POST /api/v1/config/reset                         │
│ Validate      POST /api/v1/config/validate                      │
├─────────────────────────────────────────────────────────────────┤
│ PUBLISHERS                                                      │
│ List          GET  /api/v1/config/publishers                    │
│ Create        POST /api/v1/config/publishers                    │
│ Update        PUT  /api/v1/config/publishers/{name}             │
│ Delete        DEL  /api/v1/config/publishers/{name}             │
├─────────────────────────────────────────────────────────────────┤
│ DASHBOARD (MongoDB)                                             │
│ Status        GET  /api/v1/mongodb/status                       │
│ Full          GET  /api/v1/mongodb/dashboard                    │
│ Stats         GET  /api/v1/mongodb/statistics                   │
│ Conversions   GET  /api/v1/mongodb/conversions?status=X&type=Y  │
│ Recent        GET  /api/v1/mongodb/recent?limit=10              │
│ Failed        GET  /api/v1/mongodb/failed?limit=50              │
├─────────────────────────────────────────────────────────────────┤
│ CONVERSION                                                      │
│ Start         POST /api/v1/convert (multipart/form-data)        │
│ Batch         POST /api/v1/convert/batch                        │
│ Reprocess     POST /api/v1/reprocess                            │
│ Jobs          GET  /api/v1/jobs                                 │
│ Status        GET  /api/v1/jobs/{id}                            │
│ Cancel        DEL  /api/v1/jobs/{id}                            │
│ Download      GET  /api/v1/download/{id}                        │
│ Report        GET  /api/v1/download/{id}/report                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Service Not Reachable

```bash
# Check if service is running
docker-compose ps

# Check logs
docker-compose logs epub-service

# Test health endpoint
curl http://localhost:5001/api/v1/health
```

### CORS Issues

Services include CORS headers for all origins. If still having issues:
- Verify API URL in environment variables
- Check browser console for specific error
- Ensure not mixing http/https

### MongoDB Connection Failed

```bash
# Check MongoDB is running
docker-compose logs mongodb

# Test connection
docker exec -it rittdoc-mongodb mongosh --eval "db.adminCommand('ping')"
```

---

*This guide is for microservices architecture. All communication between services is via HTTP APIs. Never import or copy files between service repositories.*
