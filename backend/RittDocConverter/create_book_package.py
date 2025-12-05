#!/usr/bin/env python3
from pathlib import Path
from lxml import etree
import argparse

# import your packaging function
from package import (
    BOOK_DOCTYPE_SYSTEM_DEFAULT,
    package_docbook,
)  # uses your existing implementation

def main():
    print("\n" + "="*70)
    print("BOOK PACKAGING SCRIPT")
    print("="*70)
    
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, help="Path to structured DocBook XML")
    p.add_argument("--out", required=True, help="Output directory for ZIP")
    p.add_argument(
        "--dtd",
        default=BOOK_DOCTYPE_SYSTEM_DEFAULT,
        help="System DTD to embed",
    )
    args = p.parse_args()

    in_path = Path(args.input)
    out_dir = Path(args.out)
    
    print(f"\nInput XML: {in_path}")
    print(f"Output dir: {out_dir}")
    print(f"DTD: {args.dtd}\n")
    
    out_dir.mkdir(parents=True, exist_ok=True)

    print("  → Parsing structured XML...")
    root = etree.parse(str(in_path)).getroot()
    # Choose a sane filename base from the root tag or the input name
    base = (in_path.stem or "book")
    zip_path = out_dir / f"{base}.zip"

    print("  → Starting packaging process...")
    final_zip = package_docbook(
        root=root,
        root_name=(root.tag.split('}', 1)[-1] if root.tag.startswith('{') else root.tag),
        dtd_system=args.dtd,
        zip_path=str(zip_path),
        processing_instructions=[("xml-stylesheet", 'type="text/xsl" href="book.xsl"')],  # optional
        assets=[],
        media_fetcher=None,
        book_doctype_system=args.dtd,
    )
    
    print("\n" + "="*70)
    print("✓ PACKAGING COMPLETE!")
    print("="*70)
    print(f"ZIP file: {final_zip}")
    print("="*70)

if __name__ == "__main__":
    main()