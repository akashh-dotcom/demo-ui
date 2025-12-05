#!/usr/bin/env python3
"""
Test script to verify internal link resolution in ePub conversion.

This test demonstrates that:
1. XHTML filenames are mapped to chapter IDs
2. Internal links are resolved from .xhtml to .xml format
3. Fragment identifiers (#section, #para, etc.) are preserved
"""

from reference_mapper import ReferenceMapper, reset_mapper, get_mapper
from epub_to_structured_v2 import resolve_link_href


def test_link_resolution():
    """Test that link resolution works correctly"""

    # Reset and get mapper
    reset_mapper()
    mapper = get_mapper()

    # Simulate chapter registration (what happens during conversion)
    print("=" * 70)
    print("STEP 1: Register XHTML → Chapter ID Mappings")
    print("=" * 70)

    mapper.register_chapter("OEBPS/Text/chapter01.xhtml", "ch0001")
    mapper.register_chapter("chapter01.xhtml", "ch0001")  # basename variation

    mapper.register_chapter("OEBPS/Text/chapter02.xhtml", "ch0002")
    mapper.register_chapter("chapter02.xhtml", "ch0002")

    mapper.register_chapter("OEBPS/Text/appendix.xhtml", "ch0003")
    mapper.register_chapter("appendix.xhtml", "ch0003")

    print(f"✓ Registered 3 chapters with variations")
    print(f"  - OEBPS/Text/chapter01.xhtml → ch0001")
    print(f"  - OEBPS/Text/chapter02.xhtml → ch0002")
    print(f"  - OEBPS/Text/appendix.xhtml → ch0003")
    print()

    # Test various link formats
    print("=" * 70)
    print("STEP 2: Test Link Resolution (XHTML → XML)")
    print("=" * 70)

    test_cases = [
        # (href, current_doc, expected_result, description)
        ("chapter02.xhtml", "OEBPS/Text/chapter01.xhtml", "ch0002.xml",
         "Simple chapter reference"),

        ("chapter02.xhtml#sec-001", "OEBPS/Text/chapter01.xhtml", "ch0002.xml#sec-001",
         "Chapter reference with section fragment"),

        ("appendix.xhtml#para-05", "OEBPS/Text/chapter02.xhtml", "ch0003.xml#para-05",
         "Appendix reference with para fragment"),

        ("#introduction", "OEBPS/Text/chapter01.xhtml", "#introduction",
         "Same-page anchor (fragment only)"),

        ("https://example.com", "OEBPS/Text/chapter01.xhtml", "https://example.com",
         "External link (unchanged)"),

        ("OEBPS/Text/chapter02.xhtml#table-3-1", "OEBPS/Text/chapter01.xhtml", "ch0002.xml#table-3-1",
         "Full path with table fragment"),
    ]

    all_passed = True
    for href, doc_path, expected, description in test_cases:
        source_chapter = mapper.get_chapter_id(doc_path)
        result = resolve_link_href(href, doc_path, mapper, source_chapter)

        passed = result == expected
        all_passed = all_passed and passed

        status = "✓" if passed else "✗"
        print(f"{status} {description}")
        print(f"  Input:    {href}")
        print(f"  Expected: {expected}")
        print(f"  Got:      {result}")
        if not passed:
            print(f"  *** FAILED ***")
        print()

    # Summary
    print("=" * 70)
    print("STEP 3: Verify Fragment Preservation")
    print("=" * 70)

    fragments_tested = [
        "sec-001",      # section ID
        "para-05",      # paragraph ID
        "table-3-1",    # table ID
        "introduction", # custom ID
    ]

    print(f"✓ Tested {len(fragments_tested)} different fragment types:")
    for frag in fragments_tested:
        print(f"  - #{frag}")
    print()

    # Final result
    print("=" * 70)
    print("TEST RESULT")
    print("=" * 70)
    if all_passed:
        print("✓ ALL TESTS PASSED!")
        print()
        print("The internal link resolution system is working correctly:")
        print("  1. ✓ XHTML filenames are mapped to chapter IDs")
        print("  2. ✓ Links are converted from .xhtml to .xml format")
        print("  3. ✓ Fragment identifiers (#section, #para, etc.) are preserved")
        print("  4. ✓ External links remain unchanged")
        print("  5. ✓ Same-page anchors work correctly")
    else:
        print("✗ SOME TESTS FAILED - See details above")
    print("=" * 70)

    return all_passed


if __name__ == "__main__":
    import sys
    success = test_link_resolution()
    sys.exit(0 if success else 1)
