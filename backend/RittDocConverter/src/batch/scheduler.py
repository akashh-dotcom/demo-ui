"""
Job scheduler for automated batch processing.

Provides scheduled execution of batch jobs at configurable intervals.
"""

import logging
import signal
import sys
from typing import Optional, Callable
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger


class JobScheduler:
    """
    Job scheduler for automated batch processing.

    Uses APScheduler to run batch jobs at regular intervals.
    """

    def __init__(
        self,
        job_func: Callable,
        interval_minutes: int = 60,
        run_on_startup: bool = False
    ):
        """
        Initialize job scheduler.

        Args:
            job_func: Function to call for each job run
            interval_minutes: Interval between job runs in minutes (default: 60)
            run_on_startup: Whether to run job immediately on startup (default: False)
        """
        self.job_func = job_func
        self.interval_minutes = interval_minutes
        self.run_on_startup = run_on_startup
        self.logger = logging.getLogger(__name__)

        # Create scheduler
        self.scheduler = BlockingScheduler()

        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        self.logger.info(f"Received signal {signum}, shutting down scheduler...")
        self.stop()
        sys.exit(0)

    def start(self) -> None:
        """
        Start the scheduler.

        This method blocks until the scheduler is stopped.
        """
        self.logger.info("="*60)
        self.logger.info("Starting RittDocConverter Batch Scheduler")
        self.logger.info(f"Job interval: {self.interval_minutes} minutes")
        self.logger.info(f"Run on startup: {self.run_on_startup}")
        self.logger.info("="*60)

        # Add job to scheduler
        self.scheduler.add_job(
            self.job_func,
            trigger=IntervalTrigger(minutes=self.interval_minutes),
            id='batch_processing_job',
            name='Batch Processing Job',
            max_instances=1,  # Prevent overlapping runs
            coalesce=True,    # Combine missed runs into one
        )

        # Run immediately if configured
        if self.run_on_startup:
            self.logger.info("Running initial job on startup...")
            try:
                self.job_func()
            except Exception as e:
                self.logger.error(f"Error in startup job: {e}")

        # Start scheduler (blocks)
        try:
            self.logger.info("Scheduler started. Press Ctrl+C to stop.")
            self.scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            self.logger.info("Scheduler stopped by user")

    def stop(self) -> None:
        """Stop the scheduler."""
        if self.scheduler.running:
            self.logger.info("Stopping scheduler...")
            self.scheduler.shutdown(wait=True)
            self.logger.info("Scheduler stopped")

    def run_once(self) -> None:
        """
        Run the job once without starting the scheduler.

        Useful for testing or manual execution.
        """
        self.logger.info("Running job once (manual execution)")
        try:
            self.job_func()
        except Exception as e:
            self.logger.error(f"Error running job: {e}")
            raise
