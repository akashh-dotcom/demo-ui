#!/usr/bin/env python3
"""
RittDocConverter Batch Processor

Main entry point for batch processing of PDF and ePub files.
Supports both CLI mode (manual file processing) and automated mode
(S3/SFTP integration with scheduled jobs).

Usage:
    # CLI mode - process local files
    python3 batch_processor.py --mode cli --files file1.pdf file2.epub

    # Automated mode - single run
    python3 batch_processor.py --mode automated --config config.yaml --run-once

    # Automated mode - scheduled runs
    python3 batch_processor.py --mode automated --config config.yaml --schedule

Author: RittDocConverter Team
License: MIT
"""

import argparse
import sys
import logging
from pathlib import Path
from typing import Optional

from src.config import load_config, AppConfig
from src.batch import BatchProcessor, FileRegistry, S3Client, JobScheduler
from src.utils import setup_logger


def create_s3_client(config: AppConfig) -> Optional[S3Client]:
    """
    Create S3 client from configuration.

    Args:
        config: Application configuration

    Returns:
        S3Client instance or None if S3 is not enabled
    """
    if not config.s3.enabled:
        return None

    return S3Client(
        bucket_name=config.s3.bucket_name,
        region=config.s3.region,
        access_key_id=config.s3.access_key_id or None,
        secret_access_key=config.s3.secret_access_key or None,
        endpoint_url=config.s3.endpoint_url
    )


def main():
    """Main entry point for batch processor."""
    parser = argparse.ArgumentParser(
        description="RittDocConverter Batch Processor - Process PDF and ePub files in batch mode",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process local files (CLI mode)
  %(prog)s --mode cli --files file1.pdf file2.epub --publisher "MyPublisher"

  # Run automated batch job once
  %(prog)s --mode automated --config config.yaml --run-once

  # Start automated scheduler (runs every N minutes)
  %(prog)s --mode automated --config config.yaml --schedule

  # View registry statistics
  %(prog)s --stats --config config.yaml

  # Reset failed files for retry
  %(prog)s --reset-failed --config config.yaml
        """
    )

    # Mode selection
    parser.add_argument(
        "--mode",
        choices=["cli", "automated"],
        help="Processing mode: 'cli' for manual local files, 'automated' for S3/SFTP"
    )

    # Configuration
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config.yaml"),
        help="Path to configuration file (default: config.yaml)"
    )

    # CLI mode options
    parser.add_argument(
        "--files",
        type=Path,
        nargs="+",
        help="Input files to process (CLI mode only)"
    )
    parser.add_argument(
        "--publisher",
        default="LocalFiles",
        help="Publisher name for local files (default: LocalFiles)"
    )

    # Automated mode options
    parser.add_argument(
        "--run-once",
        action="store_true",
        help="Run batch job once and exit (automated mode)"
    )
    parser.add_argument(
        "--schedule",
        action="store_true",
        help="Run batch jobs on schedule (automated mode)"
    )

    # Utility commands
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show registry statistics and exit"
    )
    parser.add_argument(
        "--reset-failed",
        action="store_true",
        help="Reset all failed files to pending status"
    )

    # Logging
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Override log level from config"
    )

    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)

    # Override mode if specified
    if args.mode:
        config.mode = args.mode

    # Override log level if specified
    if args.log_level:
        config.log_level = args.log_level

    # Setup logging
    log_level = getattr(logging, config.log_level.upper())
    log_file = Path(config.log_file) if config.log_file else None
    logger = setup_logger("RittDocBatch", log_file=log_file, level=log_level)

    # Initialize registry
    registry_path = Path(config.registry_db)
    registry = FileRegistry(registry_path)
    logger.info(f"Initialized file registry: {registry_path}")

    # Handle stats command
    if args.stats:
        stats = registry.get_statistics()
        publisher_stats = registry.get_publisher_statistics()

        print("\n" + "="*60)
        print("REGISTRY STATISTICS")
        print("="*60)
        print("\nOverall Statistics:")
        for status, count in stats.items():
            print(f"  {status:12s}: {count:5d}")

        print("\nPublisher Statistics:")
        for publisher, status_counts in publisher_stats.items():
            print(f"\n  {publisher}:")
            for status, count in status_counts.items():
                print(f"    {status:12s}: {count:5d}")
        print()

        return 0

    # Handle reset-failed command
    if args.reset_failed:
        failed_files = registry.get_failed_files(max_retries=999)  # Get all failed
        count = 0
        for file_record in failed_files:
            registry.reset_status(file_record['s3_key'])
            count += 1
        logger.info(f"Reset {count} failed files to pending status")
        print(f"Reset {count} failed files to pending status")
        return 0

    # Validate mode
    if config.mode == "automated" and not config.s3.enabled:
        logger.error("Automated mode requires S3 to be enabled in config")
        print("ERROR: Automated mode requires S3 to be enabled in config.yaml")
        return 1

    if config.mode == "cli" and not args.files:
        logger.error("CLI mode requires --files argument")
        parser.error("--files is required in CLI mode")

    # Create S3 client if needed
    s3_client = None
    if config.mode == "automated":
        s3_client = create_s3_client(config)
        if not s3_client:
            logger.error("Failed to create S3 client")
            return 1
        logger.info(f"Initialized S3 client for bucket: {config.s3.bucket_name}")

    # Create batch processor
    processor = BatchProcessor(config, registry, s3_client)

    # CLI mode - process local files
    if config.mode == "cli":
        logger.info("="*60)
        logger.info("Starting CLI mode batch processing")
        logger.info("="*60)

        # Add files to queue
        added = processor.add_local_files(args.files, publisher=args.publisher)
        if added == 0:
            logger.warning("No files added to queue")
            return 1

        # Process files
        results = processor.process_pending_files()

        # Print summary
        print("\n" + "="*60)
        print("BATCH PROCESSING COMPLETE")
        print("="*60)
        print(f"Successful: {results['success']}")
        print(f"Failed:     {results['failed']}")
        print(f"Skipped:    {results['skipped']}")
        print()

        return 0 if results['failed'] == 0 else 1

    # Automated mode
    elif config.mode == "automated":
        # Run once
        if args.run_once:
            logger.info("Running batch job once...")
            results = processor.run_batch_job()

            print("\n" + "="*60)
            print("BATCH JOB COMPLETE")
            print("="*60)
            print(f"Successful: {results['success']}")
            print(f"Failed:     {results['failed']}")
            print()

            return 0

        # Scheduled mode
        elif args.schedule or config.scheduler.enabled:
            scheduler = JobScheduler(
                job_func=processor.run_batch_job,
                interval_minutes=config.scheduler.interval_minutes,
                run_on_startup=config.scheduler.run_on_startup
            )

            try:
                scheduler.start()  # Blocks until stopped
            except KeyboardInterrupt:
                logger.info("Scheduler interrupted by user")

            return 0

        else:
            logger.error("Automated mode requires either --run-once or --schedule")
            parser.error("Automated mode requires either --run-once or --schedule")

    return 0


if __name__ == "__main__":
    sys.exit(main())
