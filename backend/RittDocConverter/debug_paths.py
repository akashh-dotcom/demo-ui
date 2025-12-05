#!/usr/bin/env python3
"""
Debug script to check path handling on Windows
"""
import sys
from pathlib import Path

# Test the exact paths you're using
paths = [
    r"C:\R2_Publisher_files\Wiley\9781683674832\9781683674832.epub",
    r"C:\R2_Publisher_files\Wiley\9781683674818\9781683674818.epub"
]

print("="*60)
print("Path Diagnostics")
print("="*60)

for path_str in paths:
    print(f"\nOriginal string: {path_str}")

    # Convert to Path object
    path = Path(path_str)
    print(f"Path object: {path}")
    print(f"Path exists: {path.exists()}")
    print(f"Path is_file: {path.is_file()}")
    print(f"Path absolute: {path.absolute()}")
    print(f"Path suffix: {path.suffix}")
    print(f"Path name: {path.name}")

    if path.exists():
        print(f"File size: {path.stat().st_size} bytes")
    else:
        print("❌ File NOT found!")
        # Try to debug why
        print(f"Parent exists: {path.parent.exists()}")
        if path.parent.exists():
            print(f"Parent contents:")
            try:
                for item in path.parent.iterdir():
                    print(f"  - {item.name}")
            except Exception as e:
                print(f"  Error listing: {e}")

print("\n" + "="*60)
