"""
S3/SFTP client for managing file transfers.

Provides a unified interface for interacting with S3 buckets,
including listing files, downloading, and uploading results.
"""

import boto3
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import logging
from botocore.exceptions import ClientError


class S3Client:
    """
    S3/SFTP client for file operations.

    Handles all S3 interactions including listing publisher folders,
    downloading input files, and uploading output files.
    """

    def __init__(
        self,
        bucket_name: str,
        region: str = "us-east-1",
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        endpoint_url: Optional[str] = None
    ):
        """
        Initialize S3 client.

        Args:
            bucket_name: S3 bucket name
            region: AWS region
            access_key_id: AWS access key ID (optional, uses env vars if not provided)
            secret_access_key: AWS secret access key (optional)
            endpoint_url: Custom endpoint URL for SFTP or MinIO (optional)
        """
        self.bucket_name = bucket_name
        self.logger = logging.getLogger(__name__)

        # Initialize boto3 client
        session_kwargs = {'region_name': region}
        if access_key_id and secret_access_key:
            session_kwargs['aws_access_key_id'] = access_key_id
            session_kwargs['aws_secret_access_key'] = secret_access_key

        self.s3 = boto3.client('s3', endpoint_url=endpoint_url, **session_kwargs)

    def list_publisher_folders(self, prefix: str = "sftp") -> List[str]:
        """
        List all publisher folders in the S3 bucket.

        Args:
            prefix: Root prefix for publisher folders (default: "sftp")

        Returns:
            List of publisher names (folder names)
        """
        try:
            # Ensure prefix ends with /
            if prefix and not prefix.endswith('/'):
                prefix += '/'

            response = self.s3.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix,
                Delimiter='/'
            )

            publishers = []
            if 'CommonPrefixes' in response:
                for prefix_obj in response['CommonPrefixes']:
                    # Extract publisher name from prefix
                    # e.g., "sftp/PublisherA/" -> "PublisherA"
                    folder_path = prefix_obj['Prefix'].rstrip('/')
                    publisher_name = folder_path.split('/')[-1]
                    publishers.append(publisher_name)

            self.logger.info(f"Found {len(publishers)} publisher folders")
            return publishers

        except ClientError as e:
            self.logger.error(f"Error listing publisher folders: {e}")
            return []

    def list_files_in_folder(
        self,
        publisher: str,
        prefix: str = "sftp",
        supported_formats: Optional[List[str]] = None
    ) -> List[Dict[str, any]]:
        """
        List all files in a publisher folder.

        Args:
            publisher: Publisher name
            prefix: Root prefix (default: "sftp")
            supported_formats: List of supported file extensions (e.g., ['.pdf', '.epub'])

        Returns:
            List of file information dictionaries
        """
        if supported_formats is None:
            supported_formats = ['.pdf', '.epub', '.epub3']

        try:
            # Build folder path
            folder_prefix = f"{prefix}/{publisher}/"
            if not prefix:
                folder_prefix = f"{publisher}/"

            response = self.s3.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=folder_prefix
            )

            files = []
            if 'Contents' in response:
                for obj in response['Contents']:
                    key = obj['Key']
                    filename = Path(key).name

                    # Skip the folder itself and "Output XML" folder
                    if key.endswith('/') or '/Output XML/' in key or '/Output_XML/' in key:
                        continue

                    # Check if file has supported extension
                    ext = Path(filename).suffix.lower()
                    if ext in supported_formats:
                        files.append({
                            'publisher': publisher,
                            'filename': filename,
                            's3_key': key,
                            'size': obj['Size'],
                            'format': ext,
                            'last_modified': obj['LastModified']
                        })

            self.logger.info(f"Found {len(files)} files for publisher '{publisher}'")
            return files

        except ClientError as e:
            self.logger.error(f"Error listing files for publisher '{publisher}': {e}")
            return []

    def download_file(self, s3_key: str, local_path: Path) -> bool:
        """
        Download a file from S3 to local filesystem.

        Args:
            s3_key: S3 object key
            local_path: Local file path to save to

        Returns:
            True if successful, False otherwise
        """
        try:
            local_path.parent.mkdir(parents=True, exist_ok=True)
            self.s3.download_file(self.bucket_name, s3_key, str(local_path))
            self.logger.info(f"Downloaded {s3_key} to {local_path}")
            return True

        except ClientError as e:
            self.logger.error(f"Error downloading {s3_key}: {e}")
            return False

    def upload_file(self, local_path: Path, s3_key: str) -> bool:
        """
        Upload a file from local filesystem to S3.

        Args:
            local_path: Local file path
            s3_key: S3 object key to upload to

        Returns:
            True if successful, False otherwise
        """
        try:
            self.s3.upload_file(str(local_path), self.bucket_name, s3_key)
            self.logger.info(f"Uploaded {local_path} to {s3_key}")
            return True

        except ClientError as e:
            self.logger.error(f"Error uploading {local_path} to {s3_key}: {e}")
            return False

    def upload_output(
        self,
        local_output_path: Path,
        publisher: str,
        original_filename: str,
        prefix: str = "sftp"
    ) -> Optional[str]:
        """
        Upload converted output file to publisher's Output XML folder.

        Args:
            local_output_path: Local path to output ZIP file
            publisher: Publisher name
            original_filename: Original input filename (used for naming)
            prefix: Root prefix (default: "sftp")

        Returns:
            S3 key of uploaded file, or None if failed
        """
        try:
            # Generate output S3 key
            # e.g., "sftp/PublisherA/Output XML/book_name.zip"
            output_folder = f"{prefix}/{publisher}/Output XML"
            if not prefix:
                output_folder = f"{publisher}/Output XML"

            output_filename = local_output_path.name
            s3_key = f"{output_folder}/{output_filename}"

            # Upload file
            if self.upload_file(local_output_path, s3_key):
                return s3_key
            return None

        except Exception as e:
            self.logger.error(f"Error uploading output for {original_filename}: {e}")
            return None

    def file_exists(self, s3_key: str) -> bool:
        """
        Check if a file exists in S3.

        Args:
            s3_key: S3 object key

        Returns:
            True if file exists, False otherwise
        """
        try:
            self.s3.head_object(Bucket=self.bucket_name, Key=s3_key)
            return True
        except ClientError:
            return False

    def get_file_info(self, s3_key: str) -> Optional[Dict]:
        """
        Get file metadata from S3.

        Args:
            s3_key: S3 object key

        Returns:
            Dictionary with file metadata, or None if not found
        """
        try:
            response = self.s3.head_object(Bucket=self.bucket_name, Key=s3_key)
            return {
                'size': response['ContentLength'],
                'last_modified': response['LastModified'],
                'content_type': response.get('ContentType', ''),
                'etag': response['ETag']
            }
        except ClientError as e:
            self.logger.error(f"Error getting file info for {s3_key}: {e}")
            return None

    def discover_new_files(
        self,
        prefix: str = "sftp",
        supported_formats: Optional[List[str]] = None
    ) -> List[Dict]:
        """
        Discover all new files across all publisher folders.

        Args:
            prefix: Root prefix for publisher folders (default: "sftp")
            supported_formats: List of supported file extensions

        Returns:
            List of all discovered files with metadata
        """
        all_files = []

        # Get all publisher folders
        publishers = self.list_publisher_folders(prefix)

        # List files in each publisher folder
        for publisher in publishers:
            files = self.list_files_in_folder(publisher, prefix, supported_formats)
            all_files.extend(files)

        self.logger.info(f"Discovered {len(all_files)} total files across {len(publishers)} publishers")
        return all_files
