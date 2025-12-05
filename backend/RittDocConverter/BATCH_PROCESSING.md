# RittDocConverter Batch Processing

Comprehensive batch processing system for automated PDF and ePub conversion with S3/SFTP integration.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [CLI Mode](#cli-mode)
  - [Automated Mode](#automated-mode)
- [S3 Folder Structure](#s3-folder-structure)
- [File Registry](#file-registry)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

## Overview

The batch processing system extends RittDocConverter to support:

- **Automated processing**: Monitor S3/SFTP folders and automatically process new files
- **Batch operations**: Process multiple files concurrently
- **File tracking**: SQLite-based registry to track all processed files
- **Scheduled jobs**: Run processing jobs at regular intervals (default: hourly)
- **Publisher organization**: Organize inputs and outputs by publisher name
- **Retry logic**: Automatically retry failed conversions
- **Configuration-based**: Switch between CLI and automated modes via config

## Features

### Core Features

- ✓ **Dual Mode Operation**
  - CLI mode: Process local files manually
  - Automated mode: Monitor S3 and process automatically

- ✓ **S3/SFTP Integration**
  - Connect to AWS S3 or SFTP-enabled S3 gateways
  - Auto-discover files in publisher folders
  - Upload results to organized output folders

- ✓ **File Registry**
  - SQLite database tracking all files
  - Status tracking (pending, processing, completed, failed)
  - Retry count management
  - Timestamp tracking for discovery, start, completion

- ✓ **Concurrent Processing**
  - Process multiple files in parallel
  - Configurable worker count
  - Timeout protection

- ✓ **Scheduler**
  - APScheduler-based job scheduling
  - Configurable intervals (default: 1 hour)
  - Graceful shutdown handling

- ✓ **Publisher Organization**
  - Files organized by publisher name
  - Outputs written to publisher-specific folders
  - Statistics per publisher

### Quality Features

- ✓ Comprehensive error handling
- ✓ Detailed logging (file and console)
- ✓ Progress tracking
- ✓ Statistics and reporting
- ✓ Configuration validation
- ✓ Clean code organization

## Architecture

```
RittDocConverter/
├── src/
│   ├── batch/
│   │   ├── processor.py      # Main batch processor
│   │   ├── registry.py        # File registry (SQLite)
│   │   ├── s3_client.py       # S3/SFTP client
│   │   └── scheduler.py       # Job scheduler
│   ├── config/
│   │   └── settings.py        # Configuration management
│   └── utils/
│       └── logger.py          # Logging utilities
├── batch_processor.py         # CLI entry point
├── config.yaml                # Main configuration
└── data/
    └── file_registry.db       # SQLite registry
```

### Processing Flow

```
1. Discovery Phase (Automated Mode)
   ├── List all publisher folders in S3
   ├── For each publisher:
   │   ├── List all PDF/ePub files
   │   └── Add new files to registry
   └── Log discovery statistics

2. Processing Phase
   ├── Get pending files from registry
   ├── For each file (concurrent):
   │   ├── Download from S3 (if automated)
   │   ├── Run integrated_pipeline.py
   │   ├── Upload output to S3 (if automated)
   │   └── Update registry status
   └── Log processing results

3. Retry Phase (Optional)
   ├── Get failed files within retry limit
   ├── Reset to pending status
   └── Process in next batch

4. Reporting Phase
   ├── Generate statistics
   ├── Log summary
   └── Return results
```

## Installation

### 1. Install Dependencies

```bash
# Install all dependencies including batch processing packages
pip install --break-system-packages -r requirements.txt

# Or install batch-specific dependencies only
pip install boto3 PyYAML APScheduler
```

### 2. Configure AWS Credentials

```bash
# Option 1: Environment variables (recommended)
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=us-east-1

# Option 2: AWS CLI configuration
aws configure

# Option 3: IAM role (for EC2/ECS deployments)
# No configuration needed - uses instance role automatically
```

### 3. Create Configuration File

```bash
# Copy example configuration
cp config.yaml.example config.yaml

# Edit configuration
nano config.yaml
```

## Configuration

### Configuration Files

Three example configurations are provided:

1. **config.yaml.example** - General purpose configuration
2. **config.cli.yaml.example** - CLI-only mode (no S3)
3. **config.production.yaml.example** - Production deployment

### Configuration Options

```yaml
# Processing mode: "cli" or "automated"
mode: automated

# S3 Configuration
s3:
  enabled: true
  bucket_name: "your-bucket"
  region: "us-east-1"
  access_key_id: ""           # Optional - uses env vars if empty
  secret_access_key: ""       # Optional - uses env vars if empty
  endpoint_url: ""            # Optional - for SFTP or MinIO
  input_prefix: "sftp"        # Root folder in bucket
  use_sftp: false

# Processing Configuration
processing:
  supported_formats: [".pdf", ".epub", ".epub3"]
  max_concurrent_jobs: 4
  timeout_seconds: 3600
  font_only_structure: false
  retry_failed: true
  max_retries: 3

# Scheduler Configuration
scheduler:
  enabled: true
  interval_minutes: 60
  run_on_startup: false

# Logging
log_level: "INFO"
log_file: "logs/rittdoc.log"

# Registry
registry_db: "data/file_registry.db"
output_dir: "Output"
```

## Usage

### CLI Mode

Process local files manually:

```bash
# Process single file
python3 batch_processor.py --mode cli \
    --files document.pdf \
    --publisher "MyPublisher"

# Process multiple files
python3 batch_processor.py --mode cli \
    --files book1.pdf book2.epub book3.epub \
    --publisher "AcmeBooks"

# With custom configuration
python3 batch_processor.py --mode cli \
    --config config.cli.yaml \
    --files *.pdf \
    --publisher "LocalTest"
```

### Automated Mode

#### Run Once (Manual Trigger)

```bash
# Run batch job once and exit
python3 batch_processor.py --mode automated \
    --config config.yaml \
    --run-once
```

#### Scheduled Mode (Continuous)

```bash
# Start scheduler (runs every N minutes)
python3 batch_processor.py --mode automated \
    --config config.yaml \
    --schedule

# With custom interval (configured in config.yaml)
python3 batch_processor.py --mode automated \
    --config config.yaml \
    --schedule
```

#### Run as Background Service

```bash
# Using nohup
nohup python3 batch_processor.py --mode automated \
    --config config.yaml --schedule > batch.log 2>&1 &

# Using systemd (create service file)
sudo systemctl start rittdoc-batch
sudo systemctl enable rittdoc-batch  # Start on boot

# Using screen/tmux
screen -S rittdoc
python3 batch_processor.py --mode automated --config config.yaml --schedule
# Detach: Ctrl+A, D
```

### Utility Commands

```bash
# View registry statistics
python3 batch_processor.py --stats --config config.yaml

# Reset failed files for retry
python3 batch_processor.py --reset-failed --config config.yaml

# Custom log level
python3 batch_processor.py --mode automated --run-once \
    --config config.yaml --log-level DEBUG
```

## S3 Folder Structure

### Required Structure

```
s3://your-bucket/
└── sftp/                          # Root prefix (configurable)
    ├── PublisherA/                # Publisher folder
    │   ├── book1.pdf              # Input files
    │   ├── book2.epub
    │   └── Output XML/            # Output folder (auto-created)
    │       ├── book1.zip
    │       └── book2.zip
    ├── PublisherB/
    │   ├── novel.epub
    │   └── Output XML/
    │       └── novel.zip
    └── PublisherC/
        ├── textbook.pdf
        └── Output XML/
            └── textbook.zip
```

### Folder Naming

- **Root prefix**: Configurable (default: `sftp`)
- **Publisher folders**: Any name (alphanumeric recommended)
- **Output folder**: `Output XML` (created automatically)

### File Naming

- Input files can have any name
- Output files preserve input name with `.zip` extension
- Example: `my-book.pdf` → `my-book.zip`

## File Registry

The file registry is a SQLite database that tracks all discovered and processed files.

### Database Schema

```sql
CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    publisher TEXT NOT NULL,
    filename TEXT NOT NULL,
    s3_key TEXT NOT NULL UNIQUE,
    file_size INTEGER,
    file_format TEXT,
    status TEXT NOT NULL,           -- pending, processing, completed, failed
    discovered_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER,
    output_path TEXT
);
```

### File Status Flow

```
PENDING → PROCESSING → COMPLETED
                    ↘ FAILED → PENDING (retry) → ...
```

### Querying Registry

```bash
# Using SQLite CLI
sqlite3 data/file_registry.db

# Example queries
SELECT * FROM files WHERE status = 'failed';
SELECT publisher, status, COUNT(*) FROM files GROUP BY publisher, status;
SELECT * FROM files WHERE retry_count > 0;
```

## Monitoring

### Logging

```bash
# Tail logs in real-time
tail -f logs/rittdoc.log

# Search for errors
grep ERROR logs/rittdoc.log

# Filter by publisher
grep "PublisherA" logs/rittdoc.log
```

### Statistics

```bash
# View current statistics
python3 batch_processor.py --stats

# Example output:
# REGISTRY STATISTICS
# ===================
# Overall Statistics:
#   pending     :    15
#   processing  :     2
#   completed   :   123
#   failed      :     3
#
# Publisher Statistics:
#   PublisherA:
#     completed :    50
#     pending   :     5
#   PublisherB:
#     completed :    73
#     failed    :     3
```

### Health Checks

```bash
# Check if scheduler is running
ps aux | grep batch_processor

# Check last log entry
tail -1 logs/rittdoc.log

# Check disk space
df -h data/

# Check S3 connectivity
aws s3 ls s3://your-bucket/sftp/ --profile your-profile
```

## Troubleshooting

### Common Issues

#### 1. S3 Connection Errors

```bash
# Test S3 credentials
aws s3 ls s3://your-bucket/ --profile your-profile

# Check environment variables
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY

# Verify endpoint (for SFTP)
curl -I https://your-sftp-endpoint.com
```

#### 2. Pipeline Failures

```bash
# Check individual file with integrated_pipeline.py
python3 integrated_pipeline.py test.pdf Output/

# Enable debug logging
python3 batch_processor.py --mode cli --files test.pdf \
    --publisher Test --log-level DEBUG

# Check disk space
df -h .
```

#### 3. Database Lock Errors

```bash
# Check for stale locks
lsof data/file_registry.db

# Reset registry (caution: loses history)
rm data/file_registry.db
python3 batch_processor.py --stats  # Recreates DB
```

#### 4. Scheduler Not Running

```bash
# Check if process is running
ps aux | grep batch_processor

# Check for errors in logs
tail -50 logs/rittdoc.log | grep ERROR

# Test single run first
python3 batch_processor.py --mode automated --run-once
```

### Reset and Recovery

```bash
# Reset all failed files
python3 batch_processor.py --reset-failed

# Clear old completed records (90+ days)
sqlite3 data/file_registry.db \
    "DELETE FROM files WHERE status='completed'
     AND completed_at < datetime('now', '-90 days')"

# Full reset (clears all history)
rm data/file_registry.db
```

## API Reference

### BatchProcessor

```python
from src.batch import BatchProcessor
from src.config import load_config
from src.batch import FileRegistry, S3Client

# Initialize
config = load_config(Path("config.yaml"))
registry = FileRegistry(Path("data/file_registry.db"))
s3_client = S3Client(bucket_name="my-bucket")
processor = BatchProcessor(config, registry, s3_client)

# Methods
processor.discover_files()              # Discover new files in S3
processor.process_file(file_record)     # Process single file
processor.process_pending_files()       # Process all pending
processor.run_batch_job()               # Complete batch job
processor.add_local_files([Path("test.pdf")])  # Add local files
```

### FileRegistry

```python
from src.batch import FileRegistry, FileStatus

registry = FileRegistry(Path("data/file_registry.db"))

# Add file
registry.add_file("PublisherA", "book.pdf", "s3://key", 1024, ".pdf")

# Update status
registry.update_status("s3://key", FileStatus.COMPLETED)

# Query
pending = registry.get_pending_files(limit=10)
failed = registry.get_failed_files(max_retries=3)
stats = registry.get_statistics()
```

### S3Client

```python
from src.batch import S3Client

s3 = S3Client(bucket_name="my-bucket", region="us-east-1")

# Discovery
publishers = s3.list_publisher_folders(prefix="sftp")
files = s3.list_files_in_folder("PublisherA", prefix="sftp")
all_files = s3.discover_new_files(prefix="sftp")

# File operations
s3.download_file("sftp/PublisherA/book.pdf", Path("book.pdf"))
s3.upload_file(Path("output.zip"), "sftp/PublisherA/Output XML/output.zip")
s3.upload_output(Path("output.zip"), "PublisherA", "book.pdf")
```

### JobScheduler

```python
from src.batch import JobScheduler

def my_job():
    print("Running job...")

scheduler = JobScheduler(
    job_func=my_job,
    interval_minutes=60,
    run_on_startup=True
)

scheduler.start()  # Blocks until stopped
```

## Production Deployment

### Systemd Service

Create `/etc/systemd/system/rittdoc-batch.service`:

```ini
[Unit]
Description=RittDocConverter Batch Processor
After=network.target

[Service]
Type=simple
User=rittdoc
WorkingDirectory=/opt/rittdoc
ExecStart=/usr/bin/python3 batch_processor.py --mode automated --config config.yaml --schedule
Restart=always
RestartSec=10
StandardOutput=append:/var/log/rittdoc/batch.log
StandardError=append:/var/log/rittdoc/batch.error.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl start rittdoc-batch
sudo systemctl enable rittdoc-batch
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["python3", "batch_processor.py", "--mode", "automated", "--config", "config.yaml", "--schedule"]
```

```bash
docker build -t rittdoc-batch .
docker run -d --name rittdoc \
    -v $(pwd)/config.yaml:/app/config.yaml \
    -v $(pwd)/data:/app/data \
    -v $(pwd)/logs:/app/logs \
    -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
    rittdoc-batch
```

### Monitoring Setup

```bash
# CloudWatch (AWS)
aws logs create-log-group --log-group-name /rittdoc/batch
aws logs put-retention-policy --log-group-name /rittdoc/batch --retention-in-days 30

# Prometheus (metrics)
# Add metrics endpoint to batch_processor.py

# Email notifications
# Add email alerts in processor.py on failures
```

## Performance Tuning

### Concurrency

```yaml
processing:
  max_concurrent_jobs: 8  # Increase for more CPU cores
```

### Timeouts

```yaml
processing:
  timeout_seconds: 7200  # Increase for large files
```

### Batch Size

```python
# Process in smaller batches
results = processor.process_pending_files(max_files=10)
```

### Memory Management

```bash
# Limit memory usage (Linux)
ulimit -v 8000000  # 8GB

# Monitor memory
watch -n 5 'ps aux | grep batch_processor'
```

## Support

For issues, questions, or contributions:

- GitHub Issues: [JCZentrovia/RittDocConverter](https://github.com/JCZentrovia/RittDocConverter/issues)
- Documentation: See README.md and other docs/

## License

Same as RittDocConverter main project.
