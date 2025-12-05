"""
File registry system for tracking processed files.

Uses SQLite to maintain a database of all files that have been processed,
including their status, timestamps, and metadata.
"""

import sqlite3
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict
from enum import Enum


class FileStatus(Enum):
    """File processing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class FileRegistry:
    """
    File registry for tracking processed documents.

    Maintains a SQLite database of all files discovered in the S3/SFTP
    folder, their processing status, and metadata.
    """

    def __init__(self, db_path: Path):
        """
        Initialize the file registry.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the database schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create files table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                publisher TEXT NOT NULL,
                filename TEXT NOT NULL,
                s3_key TEXT NOT NULL UNIQUE,
                file_size INTEGER,
                file_format TEXT,
                status TEXT NOT NULL,
                discovered_at TIMESTAMP NOT NULL,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                output_path TEXT,
                UNIQUE(publisher, filename)
            )
        """)

        # Create index for faster queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_status ON files(status)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_publisher ON files(publisher)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_s3_key ON files(s3_key)
        """)

        conn.commit()
        conn.close()

    def add_file(
        self,
        publisher: str,
        filename: str,
        s3_key: str,
        file_size: int,
        file_format: str
    ) -> bool:
        """
        Add a new file to the registry.

        Args:
            publisher: Publisher name
            filename: File name
            s3_key: Full S3 key
            file_size: File size in bytes
            file_format: File format (.pdf, .epub, etc.)

        Returns:
            True if file was added, False if already exists
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            cursor.execute("""
                INSERT INTO files (
                    publisher, filename, s3_key, file_size, file_format,
                    status, discovered_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                publisher,
                filename,
                s3_key,
                file_size,
                file_format,
                FileStatus.PENDING.value,
                datetime.utcnow()
            ))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            # File already exists
            return False
        finally:
            conn.close()

    def get_file_by_key(self, s3_key: str) -> Optional[Dict]:
        """
        Get file record by S3 key.

        Args:
            s3_key: S3 object key

        Returns:
            File record as dictionary, or None if not found
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM files WHERE s3_key = ?", (s3_key,))
        row = cursor.fetchone()
        conn.close()

        return dict(row) if row else None

    def update_status(
        self,
        s3_key: str,
        status: FileStatus,
        error_message: Optional[str] = None,
        output_path: Optional[str] = None
    ) -> None:
        """
        Update file processing status.

        Args:
            s3_key: S3 object key
            status: New status
            error_message: Optional error message
            output_path: Optional output file path
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        now = datetime.utcnow()
        updates = {"status": status.value}

        if status == FileStatus.PROCESSING:
            updates["started_at"] = now
        elif status in (FileStatus.COMPLETED, FileStatus.FAILED):
            updates["completed_at"] = now

        if error_message:
            updates["error_message"] = error_message

        if output_path:
            updates["output_path"] = output_path

        # Build SQL
        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [s3_key]

        cursor.execute(f"UPDATE files SET {set_clause} WHERE s3_key = ?", values)
        conn.commit()
        conn.close()

    def increment_retry_count(self, s3_key: str) -> int:
        """
        Increment retry count for a file.

        Args:
            s3_key: S3 object key

        Returns:
            New retry count
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE files SET retry_count = retry_count + 1
            WHERE s3_key = ?
        """, (s3_key,))

        cursor.execute("SELECT retry_count FROM files WHERE s3_key = ?", (s3_key,))
        count = cursor.fetchone()[0]

        conn.commit()
        conn.close()

        return count

    def get_pending_files(self, limit: Optional[int] = None) -> List[Dict]:
        """
        Get all pending files.

        Args:
            limit: Optional limit on number of files to return

        Returns:
            List of file records
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = "SELECT * FROM files WHERE status = ? ORDER BY discovered_at ASC"
        if limit:
            query += f" LIMIT {limit}"

        cursor.execute(query, (FileStatus.PENDING.value,))
        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_failed_files(self, max_retries: int) -> List[Dict]:
        """
        Get failed files that haven't exceeded retry limit.

        Args:
            max_retries: Maximum retry count

        Returns:
            List of file records
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM files
            WHERE status = ? AND retry_count < ?
            ORDER BY discovered_at ASC
        """, (FileStatus.FAILED.value, max_retries))

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_statistics(self) -> Dict[str, int]:
        """
        Get processing statistics.

        Returns:
            Dictionary with counts by status
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT status, COUNT(*) as count
            FROM files
            GROUP BY status
        """)

        stats = {row[0]: row[1] for row in cursor.fetchall()}
        conn.close()

        return stats

    def get_publisher_statistics(self) -> Dict[str, Dict[str, int]]:
        """
        Get statistics by publisher.

        Returns:
            Dictionary with publisher names and their status counts
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT publisher, status, COUNT(*) as count
            FROM files
            GROUP BY publisher, status
        """)

        stats = {}
        for publisher, status, count in cursor.fetchall():
            if publisher not in stats:
                stats[publisher] = {}
            stats[publisher][status] = count

        conn.close()

        return stats

    def reset_status(self, s3_key: str, to_status: FileStatus = FileStatus.PENDING) -> None:
        """
        Reset file status (useful for retrying).

        Args:
            s3_key: S3 object key
            to_status: Status to reset to (default: PENDING)
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE files
            SET status = ?, error_message = NULL, started_at = NULL, completed_at = NULL
            WHERE s3_key = ?
        """, (to_status.value, s3_key))

        conn.commit()
        conn.close()

    def cleanup_old_records(self, days: int = 90) -> int:
        """
        Remove old completed/skipped records.

        Args:
            days: Remove records older than this many days

        Returns:
            Number of records removed
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM files
            WHERE status IN (?, ?)
            AND completed_at < datetime('now', '-' || ? || ' days')
        """, (FileStatus.COMPLETED.value, FileStatus.SKIPPED.value, days))

        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()

        return deleted_count
