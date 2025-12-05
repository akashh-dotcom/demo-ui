"""
Configuration management for RittDocConverter.
"""

import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional


@dataclass
class S3Config:
    """S3/SFTP configuration."""
    enabled: bool = False
    bucket_name: str = ""
    region: str = "us-east-1"
    access_key_id: str = ""
    secret_access_key: str = ""
    endpoint_url: Optional[str] = None  # For SFTP or custom S3 endpoints
    input_prefix: str = "sftp"  # Root folder in S3
    use_sftp: bool = False  # True for SFTP mode, False for regular S3


@dataclass
class ProcessingConfig:
    """Processing configuration."""
    supported_formats: list = field(default_factory=lambda: [".pdf", ".epub", ".epub3"])
    max_concurrent_jobs: int = 4
    timeout_seconds: int = 3600  # 1 hour per file
    font_only_structure: bool = False
    retry_failed: bool = True
    max_retries: int = 3


@dataclass
class SchedulerConfig:
    """Scheduler configuration."""
    enabled: bool = False
    interval_minutes: int = 60  # Run every 1 hour
    run_on_startup: bool = False


@dataclass
class AppConfig:
    """Main application configuration."""
    mode: str = "cli"  # "cli" or "automated"
    s3: S3Config = field(default_factory=S3Config)
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)
    scheduler: SchedulerConfig = field(default_factory=SchedulerConfig)
    log_level: str = "INFO"
    log_file: Optional[str] = "logs/rittdoc.log"
    registry_db: str = "data/file_registry.db"
    output_dir: str = "Output"


def load_config(config_path: Path) -> AppConfig:
    """
    Load configuration from YAML file.

    Args:
        config_path: Path to config.yaml file

    Returns:
        AppConfig instance
    """
    if not config_path.exists():
        # Return default configuration
        return AppConfig()

    with open(config_path, 'r') as f:
        data = yaml.safe_load(f) or {}

    # Parse S3 config
    s3_data = data.get('s3', {})
    s3_config = S3Config(
        enabled=s3_data.get('enabled', False),
        bucket_name=s3_data.get('bucket_name', ''),
        region=s3_data.get('region', 'us-east-1'),
        access_key_id=s3_data.get('access_key_id', ''),
        secret_access_key=s3_data.get('secret_access_key', ''),
        endpoint_url=s3_data.get('endpoint_url'),
        input_prefix=s3_data.get('input_prefix', 'sftp'),
        use_sftp=s3_data.get('use_sftp', False)
    )

    # Parse processing config
    proc_data = data.get('processing', {})
    processing_config = ProcessingConfig(
        supported_formats=proc_data.get('supported_formats', ['.pdf', '.epub', '.epub3']),
        max_concurrent_jobs=proc_data.get('max_concurrent_jobs', 4),
        timeout_seconds=proc_data.get('timeout_seconds', 3600),
        font_only_structure=proc_data.get('font_only_structure', False),
        retry_failed=proc_data.get('retry_failed', True),
        max_retries=proc_data.get('max_retries', 3)
    )

    # Parse scheduler config
    sched_data = data.get('scheduler', {})
    scheduler_config = SchedulerConfig(
        enabled=sched_data.get('enabled', False),
        interval_minutes=sched_data.get('interval_minutes', 60),
        run_on_startup=sched_data.get('run_on_startup', False)
    )

    # Create main config
    config = AppConfig(
        mode=data.get('mode', 'cli'),
        s3=s3_config,
        processing=processing_config,
        scheduler=scheduler_config,
        log_level=data.get('log_level', 'INFO'),
        log_file=data.get('log_file', 'logs/rittdoc.log'),
        registry_db=data.get('registry_db', 'data/file_registry.db'),
        output_dir=data.get('output_dir', 'Output')
    )

    return config
