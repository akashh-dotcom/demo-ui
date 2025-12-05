# Batch Processing Quick Start

Get started with RittDocConverter batch processing in 5 minutes.

## Quick Start - CLI Mode

Process local PDF/ePub files:

```bash
# 1. Install dependencies
pip install --break-system-packages -r requirements.txt

# 2. Process files
python3 batch_processor.py --mode cli \
    --files mybook.pdf another.epub \
    --publisher "MyPublisher"

# 3. Check output
ls -lh Output/MyPublisher/
```

That's it! Your converted files are in `Output/MyPublisher/`.

## Quick Start - Automated S3 Mode

Automatically process files from S3:

```bash
# 1. Configure AWS credentials
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret

# 2. Create configuration file
cp config.yaml.example config.yaml
nano config.yaml  # Update bucket name and settings

# 3. Organize your S3 bucket like this:
# s3://your-bucket/
#   └── sftp/
#       ├── PublisherA/
#       │   ├── book1.pdf
#       │   └── book2.epub
#       └── PublisherB/
#           └── novel.epub

# 4. Run batch job once
python3 batch_processor.py --mode automated --config config.yaml --run-once

# 5. Or start scheduler (runs every hour)
python3 batch_processor.py --mode automated --config config.yaml --schedule
```

Outputs are automatically uploaded to `s3://your-bucket/sftp/{Publisher}/Output XML/`.

## What Happens?

### CLI Mode
1. Files are added to processing queue
2. Each file is converted using integrated_pipeline.py
3. Output ZIP files are saved to `Output/{Publisher}/`

### Automated Mode
1. **Discovery**: Scans S3 for new PDF/ePub files in publisher folders
2. **Registry**: Tracks files in SQLite database
3. **Processing**: Downloads, converts, uploads to S3
4. **Scheduling**: Repeats every hour (configurable)

## Monitoring

```bash
# View statistics
python3 batch_processor.py --stats

# Example output:
# Overall Statistics:
#   pending     :    15
#   processing  :     2
#   completed   :   123
#   failed      :     3
```

## Common Commands

```bash
# Process local files
python3 batch_processor.py --mode cli --files *.pdf --publisher "Test"

# Run batch once
python3 batch_processor.py --mode automated --run-once

# Start scheduler
python3 batch_processor.py --mode automated --schedule

# View stats
python3 batch_processor.py --stats

# Reset failed files
python3 batch_processor.py --reset-failed

# Debug mode
python3 batch_processor.py --mode cli --files test.pdf --publisher Test --log-level DEBUG
```

## Configuration

Edit `config.yaml`:

```yaml
# CLI or Automated
mode: automated

# S3 settings
s3:
  enabled: true
  bucket_name: "your-bucket"
  region: "us-east-1"

# Processing
processing:
  max_concurrent_jobs: 4
  timeout_seconds: 3600
  retry_failed: true
  max_retries: 3

# Scheduler (runs every N minutes)
scheduler:
  enabled: true
  interval_minutes: 60
```

## S3 Folder Structure

```
s3://your-bucket/
└── sftp/                      # Root prefix (configurable)
    └── PublisherName/         # One folder per publisher
        ├── book1.pdf          # Input files (PDF/ePub)
        ├── book2.epub
        └── Output XML/        # Output folder (auto-created)
            ├── book1.zip      # Converted outputs
            └── book2.zip
```

## Troubleshooting

### "S3 connection failed"
```bash
# Test S3 access
aws s3 ls s3://your-bucket/

# Check credentials
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY
```

### "Pipeline failed"
```bash
# Test single file manually
python3 integrated_pipeline.py test.pdf Output/

# Check logs
tail -f logs/rittdoc.log
```

### "No files discovered"
```bash
# Check S3 folder structure
aws s3 ls s3://your-bucket/sftp/ --recursive

# Verify supported formats in config.yaml
# Should include: .pdf, .epub, .epub3
```

## Next Steps

- Read full documentation: [BATCH_PROCESSING.md](BATCH_PROCESSING.md)
- Configure for production: See `config.production.yaml.example`
- Set up systemd service for automated processing
- Monitor logs: `tail -f logs/rittdoc.log`

## Support

- Issues: https://github.com/JCZentrovia/RittDocConverter/issues
- Main docs: [README.md](README.md)
