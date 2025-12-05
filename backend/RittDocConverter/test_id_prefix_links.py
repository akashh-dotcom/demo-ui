#!/usr/bin/env python3
"""
Test script to verify that ID prefixing works correctly with internal links.

This test verifies that:
1. IDs are prefixed with chapter names
2. Fragment-only links (#anchor) are updated to use prefixed IDs (#chXXXX-anchor)
3. Cross-chapter links with fragments are updated (ch0002.xml#anchor -> ch0002.xml#ch0002-anchor)
"""

from reference_mapper import ReferenceMapper, reset_mapper, get_mapper
from epub_to_structured_v2 import resolve_link_href


def test_fragment_link_prefixing():
    """Test that fragment links are properly prefixed to match prefixed IDs"""

    # Reset and get mapper
    reset_mapper()
    mapper = get_mapper()

    # Simulate chapter registration
    print("=" * 70)
    print("STEP 1: Register XHTML → Chapter ID Mappings")
    print("=" * 70)

    mapper.register_chapter("OEBPS/Text/chapter01.xhtml", "ch0001")
    mapper.register_chapter("chapter01.xhtml", "ch0001")

    mapper.register_chapter("OEBPS/Text/chapter02.xhtml", "ch0002")
    mapper.register_chapter("chapter02.xhtml", "ch0002")

    print(f"✓ Registered 2 chapters")
    print(f"  - OEBPS/Text/chapter01.xhtml → ch0001")
    print(f"  - OEBPS/Text/chapter02.xhtml → ch0002")
    print()

    # Test fragment link prefixing
    print("=" * 70)
    print("STEP 2: Test Fragment Link Prefixing")
    print("=" * 70)

    test_cases = [
        # (href, current_doc, source_chapter, expected_result, description)
        ("#introduction", "OEBPS/Text/chapter01.xhtml", "ch0001", "#ch0001-introduction",
         "Same-page anchor should be prefixed with chapter ID"),

        ("#section-001", "OEBPS/Text/chapter01.xhtml", "ch0001", "#ch0001-section-001",
         "Same-page section anchor should be prefixed"),

        ("chapter02.xhtml#sec-001", "OEBPS/Text/chapter01.xhtml", "ch0001", "ch0002.xml#ch0002-sec-001",
         "Cross-chapter link fragment should be prefixed with target chapter"),

        ("chapter02.xhtml#para-05", "OEBPS/Text/chapter01.xhtml", "ch0001", "ch0002.xml#ch0002-para-05",
         "Cross-chapter paragraph link should be prefixed"),

        ("https://example.com#anchor", "OEBPS/Text/chapter01.xhtml", "ch0001", "https://example.com#anchor",
         "External link fragments should remain unchanged"),

        ("chapter02.xhtml", "OEBPS/Text/chapter01.xhtml", "ch0001", "ch0002.xml",
         "Cross-chapter link without fragment works correctly"),
    ]

    all_passed = True
    for href, doc_path, source_chapter, expected, description in test_cases:
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

    # Final result
    print("=" * 70)
    print("TEST RESULT")
    print("=" * 70)
    if all_passed:
        print("✓ ALL TESTS PASSED!")
        print()
        print("The ID prefixing and link resolution system is working correctly:")
        print("  1. ✓ Same-page anchors (#id) are prefixed with chapter ID")
        print("  2. ✓ Cross-chapter fragments are prefixed with target chapter ID")
        print("  3. ✓ External link fragments remain unchanged")
        print("  4. ✓ Links match prefixed IDs (ch0001-section1)")
    else:
        print("✗ SOME TESTS FAILED - See details above")
    print("=" * 70)

    return all_passed


if __name__ == "__main__":
    import sys
    success = test_fragment_link_prefixing()
    sys.exit(0 if success else 1)
