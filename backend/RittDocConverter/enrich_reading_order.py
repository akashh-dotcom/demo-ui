#!/usr/bin/env python3
"""
ENRICH READING ORDER WITH FONT SIZES (FIXED FOR PDF INPUT)
===========================================================

This script:
1. Converts PDF to XML using pdftohtml (if given a PDF)
2. Extracts fontspec from the XML
3. Creates fontspec.json mapping font_id → font_size
4. Uses that to add font_size attributes to reading_order.xml text elements
5. Then font_roles_auto.py can analyze the sizes!

Usage (accepts both PDF and XML):
    python3 enrich_reading_order.py input.pdf reading_order.xml --out enriched_reading_order.xml
    python3 enrich_reading_order.py input.xml reading_order.xml --out enriched_reading_order.xml

For beginners: This is like creating a translation dictionary (fontspec.json) that says
"font 0 = 45pt, font 1 = 18pt" then using that dictionary to label every text element
with its actual size.
"""

import xml.etree.ElementTree as ET
import json
import sys
import subprocess
import tempfile
from pathlib import Path


def generate_pdftohtml_xml(pdf_path):
    """
    Convert PDF to XML using pdftohtml.
    Returns the path to the generated XML file.
    """
    print(f"  Converting PDF to XML using pdftohtml...")
    
    try:
        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False, mode='w') as tmp:
            output_path = tmp.name
        
        # Run pdftohtml
        cmd = ["pdftohtml", "-xml", str(pdf_path), output_path.replace(".xml", "")]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"  ✗ pdftohtml error: {result.stderr}")
            return None
        
        print(f"  ✓ PDF converted to XML")
        return output_path
        
    except FileNotFoundError:
        print(f"  ✗ Error: pdftohtml not found. Please install it:")
        print(f"    - macOS: brew install pdftohtml")
        print(f"    - Ubuntu: sudo apt-get install poppler-utils")
        print(f"    - Windows: Download from https://poppler.freedesktop.org/")
        return None
    except Exception as e:
        print(f"  ✗ Error converting PDF: {e}")
        return None


def extract_fontspec(input_path):
    """
    Extract fontspec from input (can be PDF or XML).
    Returns dict: font_id → {"size": value, "family": value, "color": value}
    """
    fontspec = {}
    
    # If it's a PDF, convert to XML first
    if str(input_path).lower().endswith('.pdf'):
        xml_path = generate_pdftohtml_xml(input_path)
        if not xml_path:
            return {}
        input_path = xml_path
    
    try:
        tree = ET.parse(input_path)
        root = tree.getroot()
        
        # Find all fontspec elements
        for fontspec_elem in root.findall(".//fontspec"):
            font_id = fontspec_elem.get("id")
            size = fontspec_elem.get("size")
            family = fontspec_elem.get("family", "")
            color = fontspec_elem.get("color", "")
            
            if font_id and size:
                try:
                    fontspec[font_id] = {
                        "size": float(size),
                        "family": family,
                        "color": color
                    }
                except ValueError:
                    # Skip if size can't be converted to float
                    pass
        
        return fontspec
    except Exception as e:
        print(f"✗ Error extracting fontspec: {e}")
        return {}


def save_fontspec_json(fontspec, output_path):
    """Save fontspec as JSON for reference."""
    output = {
        "fontspec_mapping": {font_id: spec["size"] for font_id, spec in fontspec.items()},
        "full_fontspec": fontspec,
        "notes": "font_id → font_size mapping for debugging"
    }
    
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"✓ Saved fontspec → {output_path}")


def enrich_reading_order(reading_order_path, fontspec, output_path):
    """
    Add font_size attributes to all text elements in reading_order.xml
    using the fontspec mapping.
    """
    try:
        tree = ET.parse(reading_order_path)
        root = tree.getroot()
        
        count_enriched = 0
        count_missing = 0
        
        # Find all text elements
        for text_elem in root.findall(".//text"):
            font_id = text_elem.get("font")
            
            if font_id and font_id in fontspec:
                size = fontspec[font_id]["size"]
                text_elem.set("font_size", str(size))
                count_enriched += 1
            elif font_id:
                count_missing += 1
        
        # Save enriched XML
        tree.write(output_path, encoding="utf-8", xml_declaration=True)
        
        print(f"✓ Enriched reading_order.xml")
        print(f"  → Added font_size to {count_enriched} text elements")
        if count_missing > 0:
            print(f"  ⚠ {count_missing} text elements had missing fontspec (using font_id={font_id})")
        
        return True
    except Exception as e:
        print(f"✗ Error enriching reading_order: {e}")
        return False


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 enrich_reading_order.py <input.pdf|input.xml> <reading_order.xml> [--out <output.xml>]")
        print("")
        print("Examples:")
        print("  # With PDF input (auto-converts to XML):")
        print("  python3 enrich_reading_order.py book.pdf out/reading_order.xml --out out/reading_order_enriched.xml")
        print("")
        print("  # With XML input (pdftohtml output):")
        print("  python3 enrich_reading_order.py pdftohtml_output.xml out/reading_order.xml --out out/reading_order_enriched.xml")
        sys.exit(1)
    
    input_file = Path(sys.argv[1]).resolve()
    reading_order_xml = Path(sys.argv[2]).resolve()
    
    # Parse --out flag
    output_xml = reading_order_xml  # Default: overwrite
    if "--out" in sys.argv:
        idx = sys.argv.index("--out")
        if idx + 1 < len(sys.argv):
            output_xml = Path(sys.argv[idx + 1]).resolve()
    
    # Check inputs exist
    if not input_file.exists():
        print(f"✗ Error: Input file not found: {input_file}")
        sys.exit(1)
    
    if not reading_order_xml.exists():
        print(f"✗ Error: Reading order XML not found: {reading_order_xml}")
        sys.exit(1)
    
    print("=" * 70)
    print("ENRICHING READING ORDER WITH FONT SIZES")
    print("=" * 70)
    print(f"Input file       : {input_file}")
    print(f"Reading order XML: {reading_order_xml}")
    print(f"Output XML       : {output_xml}")
    print()
    
    # Step 1: Extract fontspec
    print("Step 1: Extracting fontspec from input...")
    fontspec = extract_fontspec(input_file)
    
    if not fontspec:
        print("✗ No fontspec found in input!")
        sys.exit(1)
    
    print(f"✓ Found {len(fontspec)} font definitions")
    print(f"  Example fonts: ", end="")
    for font_id in sorted(fontspec.keys())[:5]:
        size = fontspec[font_id]["size"]
        print(f"font{font_id}={size}pt", end=" ")
    print()
    print()
    
    # Step 2: Save fontspec for reference
    print("Step 2: Saving fontspec.json for reference...")
    fontspec_json = output_xml.parent / "fontspec.json"
    save_fontspec_json(fontspec, fontspec_json)
    print()
    
    # Step 3: Enrich reading_order.xml
    print("Step 3: Adding font_size to reading_order.xml text elements...")
    if enrich_reading_order(reading_order_xml, fontspec, output_xml):
        print()
        print("=" * 70)
        print("✓ SUCCESS!")
        print("=" * 70)
        print(f"Output saved to: {output_xml}")
        print()
        print("Next steps:")
        print("  1. Use the enriched XML for font_roles_auto.py")
        print("  2. Run: python3 font_roles_auto.py <enriched_xml> --out font_roles.json")
        print()
        return 0
    else:
        print("✗ FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())