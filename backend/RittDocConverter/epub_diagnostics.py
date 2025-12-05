#!/usr/bin/env python3
"""
ePub diagnostic tool to identify potential conversion issues.

Run this on an ePub file before conversion to identify potential problems.
"""

import argparse
import sys
from pathlib import Path

import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup


def diagnose_epub(epub_path: Path) -> dict:
    """
    Analyze an ePub file and report potential conversion issues.

    Returns:
        Dictionary with diagnostic information
    """
    results = {
        'warnings': [],
        'info': [],
        'errors': []
    }

    try:
        book = epub.read_epub(str(epub_path))
    except Exception as e:
        results['errors'].append(f"Failed to read ePub: {e}")
        return results

    # 1. Check ePub version
    version = book.version if hasattr(book, 'version') else 'Unknown'
    results['info'].append(f"ePub version: {version}")

    # 2. Check metadata
    identifiers = book.get_metadata('DC', 'identifier')
    if not identifiers:
        results['warnings'].append("No identifiers found (no ISBN)")

    titles = book.get_metadata('DC', 'title')
    if not titles:
        results['warnings'].append("No title metadata found")

    creators = book.get_metadata('DC', 'creator')
    if not creators:
        results['warnings'].append("No author/creator metadata found")

    # 3. Check documents
    documents = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))
    results['info'].append(f"Documents in spine: {len(documents)}")

    if len(documents) == 0:
        results['errors'].append("No documents found in spine!")

    # 4. Check for structure
    heading_counts = {'h1': 0, 'h2': 0, 'h3': 0, 'h4': 0, 'h5': 0, 'h6': 0}
    total_paragraphs = 0
    total_images = 0
    total_tables = 0
    total_lists = 0
    malformed_docs = 0

    for doc in documents:
        try:
            content = doc.get_content()
            soup = BeautifulSoup(content, 'html.parser')

            for level in range(1, 7):
                heading_counts[f'h{level}'] += len(soup.find_all(f'h{level}'))

            total_paragraphs += len(soup.find_all('p'))
            total_images += len(soup.find_all('img'))
            total_tables += len(soup.find_all('table'))
            total_lists += len(soup.find_all(['ul', 'ol']))

        except Exception as e:
            malformed_docs += 1
            results['warnings'].append(f"Failed to parse document {doc.get_name()}: {e}")

    results['info'].append(f"Total headings: h1={heading_counts['h1']}, h2={heading_counts['h2']}, "
                          f"h3={heading_counts['h3']}, h4={heading_counts['h4']}, "
                          f"h5={heading_counts['h5']}, h6={heading_counts['h6']}")
    results['info'].append(f"Total paragraphs: {total_paragraphs}")
    results['info'].append(f"Total images: {total_images}")
    results['info'].append(f"Total tables: {total_tables}")
    results['info'].append(f"Total lists: {total_lists}")

    if heading_counts['h1'] == 0:
        results['warnings'].append("No h1 headings found - may create chapters with 'Untitled'")

    if malformed_docs > 0:
        results['warnings'].append(f"{malformed_docs} document(s) failed to parse")

    # 5. Check images
    images = []
    for item in book.get_items():
        if hasattr(item, 'media_type') and item.media_type and 'image' in item.media_type.lower():
            images.append(item)

    results['info'].append(f"Total image files: {len(images)}")

    # Check image types
    image_types = {}
    large_images = 0
    svg_images = 0

    for img in images:
        ext = Path(img.get_name()).suffix.lower()
        image_types[ext] = image_types.get(ext, 0) + 1

        size = len(img.get_content())
        if size > 1_000_000:  # > 1MB
            large_images += 1

        if ext == '.svg':
            svg_images += 1

    if image_types:
        results['info'].append(f"Image types: {image_types}")

    if large_images > 0:
        results['warnings'].append(f"{large_images} image(s) larger than 1MB - may be slow to process")

    if svg_images > 0:
        results['info'].append(f"{svg_images} SVG image(s) - will be converted to PNG (requires cairosvg)")

    # 6. Check for advanced features
    has_mathml = False
    has_audio_video = False

    for doc in documents:
        try:
            content = doc.get_content()
            if b'<math' in content or b'<m:math' in content:
                has_mathml = True
            if b'<audio' in content or b'<video' in content:
                has_audio_video = True
        except:
            pass

    if has_mathml:
        results['warnings'].append("MathML detected - mathematical formulas may not convert properly")

    if has_audio_video:
        results['warnings'].append("Audio/Video elements detected - will be ignored in conversion")

    # 7. Check file size
    file_size = epub_path.stat().st_size
    results['info'].append(f"File size: {file_size / 1024 / 1024:.2f} MB")

    if file_size > 50_000_000:  # > 50MB
        results['warnings'].append("Large ePub file (>50MB) - conversion may be slow")

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Diagnose ePub files for potential conversion issues"
    )
    parser.add_argument('epub', help='ePub file to diagnose')

    args = parser.parse_args()

    epub_path = Path(args.epub).resolve()
    if not epub_path.exists():
        print(f"Error: File not found: {epub_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Diagnosing: {epub_path}")
    print("=" * 70)

    results = diagnose_epub(epub_path)

    # Print errors
    if results['errors']:
        print("\n❌ ERRORS:")
        for error in results['errors']:
            print(f"  • {error}")

    # Print warnings
    if results['warnings']:
        print("\n⚠️  WARNINGS:")
        for warning in results['warnings']:
            print(f"  • {warning}")

    # Print info
    if results['info']:
        print("\nℹ️  INFORMATION:")
        for info in results['info']:
            print(f"  • {info}")

    print("\n" + "=" * 70)

    if results['errors']:
        print("❌ This ePub may not convert successfully")
        sys.exit(1)
    elif results['warnings']:
        print("⚠️  This ePub may convert with some issues")
        sys.exit(0)
    else:
        print("✅ This ePub should convert successfully")
        sys.exit(0)


if __name__ == '__main__':
    main()
