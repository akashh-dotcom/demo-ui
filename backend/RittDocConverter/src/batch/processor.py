"""
Batch processor for RittDocConverter.

Orchestrates batch processing of PDF and ePub files, including discovery,
download, conversion, and upload of results.
"""

import tempfile
import shutil
from pathlib import Path
from typing import Optional, List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
import subprocess
import time

from .registry import FileRegistry, FileStatus
from .s3_client import S3Client
from ..config.settings import AppConfig


class BatchProcessor:
    """
    Batch processor for document conversion.

    Handles the complete workflow of discovering files in S3,
    downloading them, converting them using the integrated pipeline,
    and uploading results back to S3.
    """

    def __init__(
        self,
        config: AppConfig,
        registry: FileRegistry,
        s3_client: Optional[S3Client] = None
    ):
        """
        Initialize batch processor.

        Args:
            config: Application configuration
            registry: File registry instance
            s3_client: Optional S3 client (for automated mode)
        """
        self.config = config
        self.registry = registry
        self.s3_client = s3_client
        self.logger = logging.getLogger(__name__)
        self.root_dir = Path(__file__).resolve().parent.parent.parent

    def discover_files(self) -> int:
        """
        Discover new files in S3 and add them to the registry.

        Returns:
            Number of new files discovered
        """
        if not self.s3_client:
            self.logger.error("S3 client not configured")
            return 0

        self.logger.info("Starting file discovery...")

        # Discover all files in S3
        files = self.s3_client.discover_new_files(
            prefix=self.config.s3.input_prefix,
            supported_formats=self.config.processing.supported_formats
        )

        # Add new files to registry
        new_count = 0
        for file_info in files:
            added = self.registry.add_file(
                publisher=file_info['publisher'],
                filename=file_info['filename'],
                s3_key=file_info['s3_key'],
                file_size=file_info['size'],
                file_format=file_info['format']
            )
            if added:
                new_count += 1
                self.logger.info(f"Discovered new file: {file_info['s3_key']}")

        self.logger.info(f"Discovery complete. Found {new_count} new files.")
        return new_count

    def process_file(self, file_record: Dict) -> bool:
        """
        Process a single file through the conversion pipeline.

        Args:
            file_record: File record from registry

        Returns:
            True if processing succeeded, False otherwise
        """
        s3_key = file_record['s3_key']
        publisher = file_record['publisher']
        filename = file_record['filename']

        self.logger.info(f"Processing file: {s3_key}")

        # Update status to processing
        self.registry.update_status(s3_key, FileStatus.PROCESSING)

        try:
            with tempfile.TemporaryDirectory(prefix="rittdoc_batch_") as tmp_dir:
                tmp_path = Path(tmp_dir)

                # Step 1: Download file from S3
                if self.config.mode == "automated" and self.s3_client:
                    input_file = tmp_path / filename
                    if not self.s3_client.download_file(s3_key, input_file):
                        raise Exception("Failed to download file from S3")
                else:
                    # In CLI mode, file is already local
                    input_file = Path(s3_key)  # In CLI mode, s3_key is actually local path

                # Step 2: Run conversion pipeline
                output_dir = tmp_path / "output"
                output_dir.mkdir(exist_ok=True)

                success = self._run_pipeline(input_file, output_dir)
                if not success:
                    raise Exception("Pipeline execution failed")

                # Step 3: Upload results to S3 (if in automated mode)
                output_zip = self._find_output_zip(output_dir)
                if not output_zip:
                    raise Exception("Output ZIP file not found")

                if self.config.mode == "automated" and self.s3_client:
                    output_s3_key = self.s3_client.upload_output(
                        output_zip,
                        publisher,
                        filename,
                        prefix=self.config.s3.input_prefix
                    )
                    if not output_s3_key:
                        raise Exception("Failed to upload output to S3")

                    self.logger.info(f"Uploaded output to: {output_s3_key}")
                    output_path = output_s3_key
                else:
                    # In CLI mode, copy to local output directory
                    local_output_dir = Path(self.config.output_dir) / publisher
                    local_output_dir.mkdir(parents=True, exist_ok=True)
                    final_output = local_output_dir / output_zip.name
                    shutil.copy2(output_zip, final_output)
                    output_path = str(final_output)
                    self.logger.info(f"Saved output to: {final_output}")

                # Step 4: Update registry
                self.registry.update_status(
                    s3_key,
                    FileStatus.COMPLETED,
                    output_path=output_path
                )

                self.logger.info(f"Successfully processed: {s3_key}")
                return True

        except Exception as e:
            error_msg = str(e)
            self.logger.error(f"Error processing {s3_key}: {error_msg}")

            # Update registry with failure
            self.registry.update_status(
                s3_key,
                FileStatus.FAILED,
                error_message=error_msg
            )

            # Increment retry count
            retry_count = self.registry.increment_retry_count(s3_key)
            self.logger.info(f"Retry count for {s3_key}: {retry_count}")

            return False

    def _run_pipeline(self, input_file: Path, output_dir: Path) -> bool:
        """
        Run the integrated pipeline on a file.

        Args:
            input_file: Path to input file
            output_dir: Directory to write output to

        Returns:
            True if pipeline succeeded, False otherwise
        """
        try:
            # Build command
            cmd = [
                "python3",
                str(self.root_dir / "integrated_pipeline.py"),
                str(input_file),
                str(output_dir)
            ]

            if self.config.processing.font_only_structure:
                cmd.append("--font-only-structure")

            # Run pipeline
            self.logger.info(f"Running: {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                cwd=self.root_dir,
                capture_output=True,
                text=True,
                timeout=self.config.processing.timeout_seconds
            )

            if result.returncode != 0:
                self.logger.error(f"Pipeline failed with return code {result.returncode}")
                self.logger.error(f"STDERR: {result.stderr}")
                return False

            self.logger.info("Pipeline completed successfully")
            return True

        except subprocess.TimeoutExpired:
            self.logger.error(f"Pipeline timed out after {self.config.processing.timeout_seconds}s")
            return False
        except Exception as e:
            self.logger.error(f"Error running pipeline: {e}")
            return False

    def _find_output_zip(self, output_dir: Path) -> Optional[Path]:
        """
        Find the output ZIP file in the output directory.

        Args:
            output_dir: Output directory to search

        Returns:
            Path to ZIP file, or None if not found
        """
        zip_files = list(output_dir.glob("*.zip"))
        if zip_files:
            return zip_files[0]

        # Also check in Output subdirectory (if pipeline created it)
        output_subdir = output_dir / "Output"
        if output_subdir.exists():
            zip_files = list(output_subdir.glob("*.zip"))
            if zip_files:
                return zip_files[0]

        return None

    def process_pending_files(self, max_files: Optional[int] = None) -> Dict[str, int]:
        """
        Process all pending files in the registry.

        Args:
            max_files: Maximum number of files to process (None = all)

        Returns:
            Dictionary with success/failure counts
        """
        # Get pending files
        pending = self.registry.get_pending_files(limit=max_files)

        # Also get failed files that can be retried
        if self.config.processing.retry_failed:
            failed = self.registry.get_failed_files(
                max_retries=self.config.processing.max_retries
            )
            # Reset failed files to pending for retry
            for file_record in failed:
                self.registry.reset_status(file_record['s3_key'])
            pending.extend(failed)

        if not pending:
            self.logger.info("No pending files to process")
            return {"success": 0, "failed": 0, "skipped": 0}

        self.logger.info(f"Processing {len(pending)} files...")

        # Process files (with concurrency control)
        results = {"success": 0, "failed": 0, "skipped": 0}

        max_workers = min(
            self.config.processing.max_concurrent_jobs,
            len(pending)
        )

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all jobs
            future_to_file = {
                executor.submit(self.process_file, file_record): file_record
                for file_record in pending
            }

            # Wait for completion
            for future in as_completed(future_to_file):
                file_record = future_to_file[future]
                try:
                    success = future.result()
                    if success:
                        results["success"] += 1
                    else:
                        results["failed"] += 1
                except Exception as e:
                    self.logger.error(f"Unexpected error processing {file_record['s3_key']}: {e}")
                    results["failed"] += 1

        self.logger.info(f"Batch processing complete: {results}")
        return results

    def run_batch_job(self) -> Dict[str, int]:
        """
        Run a complete batch job (discover + process).

        Returns:
            Dictionary with processing statistics
        """
        start_time = time.time()
        self.logger.info("="*60)
        self.logger.info("Starting batch job")
        self.logger.info("="*60)

        # Step 1: Discover new files (if in automated mode)
        if self.config.mode == "automated":
            new_files = self.discover_files()
            self.logger.info(f"Discovered {new_files} new files")

        # Step 2: Process pending files
        results = self.process_pending_files()

        # Step 3: Log statistics
        stats = self.registry.get_statistics()
        publisher_stats = self.registry.get_publisher_statistics()

        elapsed = time.time() - start_time
        self.logger.info("="*60)
        self.logger.info("Batch job complete")
        self.logger.info(f"Elapsed time: {elapsed:.2f}s")
        self.logger.info(f"Results: {results}")
        self.logger.info(f"Overall statistics: {stats}")
        self.logger.info(f"Publisher statistics: {publisher_stats}")
        self.logger.info("="*60)

        return results

    def add_local_files(self, file_paths: List[Path], publisher: str = "LocalFiles") -> int:
        """
        Add local files to the processing queue (for CLI mode).

        Args:
            file_paths: List of local file paths
            publisher: Publisher name to use (default: "LocalFiles")

        Returns:
            Number of files added
        """
        added_count = 0

        for file_path in file_paths:
            if not file_path.exists():
                self.logger.warning(f"File not found: {file_path}")
                continue

            # Check if format is supported
            ext = file_path.suffix.lower()
            if ext not in self.config.processing.supported_formats:
                self.logger.warning(f"Unsupported format: {file_path} ({ext})")
                continue

            # Add to registry (using file path as s3_key in CLI mode)
            added = self.registry.add_file(
                publisher=publisher,
                filename=file_path.name,
                s3_key=str(file_path.absolute()),  # Use absolute path as key
                file_size=file_path.stat().st_size,
                file_format=ext
            )

            if added:
                added_count += 1
                self.logger.info(f"Added to queue: {file_path}")

        self.logger.info(f"Added {added_count} files to processing queue")
        return added_count
