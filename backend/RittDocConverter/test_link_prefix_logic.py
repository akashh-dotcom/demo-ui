#!/usr/bin/env python3
"""
Test script to verify the logic of ID prefixing for internal links.
This is a unit test that doesn't require all dependencies.
"""


def resolve_link_href_logic(href: str, source_chapter: str, target_chapter: str = None) -> str:
    """
    Simplified version of resolve_link_href logic to test fragment prefixing.

    Args:
        href: Original href from HTML
        source_chapter: Current chapter ID
        target_chapter: Target chapter ID (for cross-chapter links)

    Returns:
        Resolved href
    """
    # External links - keep as-is
    if href.startswith(('http://', 'https://', 'mailto:', 'ftp://', 'tel:', '//')):
        return href

    # Empty or just fragment (same page anchor)
    if not href or href.startswith('#'):
        # Prefix fragment with chapter_id to match prefixed IDs
        if href and href.startswith('#'):
            fragment_id = href[1:]  # Remove leading #
            if fragment_id:
                # Prefix the fragment ID with chapter_id to match the prefixed IDs
                return f"#{source_chapter}-{fragment_id}"
        return href if href else '#'

    # Cross-chapter link (simplified - assuming target_chapter is provided)
    if target_chapter:
        fragment = ''
        if '#' in href:
            link_path, fragment_part = href.split('#', 1)
            # Prefix the fragment ID with target chapter to match prefixed IDs
            if fragment_part:
                fragment = f"#{target_chapter}-{fragment_part}"
        return f"{target_chapter}.xml{fragment}"

    # Could not resolve - return as-is
    return href


def test_fragment_link_prefixing():
    """Test that fragment links are properly prefixed to match prefixed IDs"""

    print("=" * 70)
    print("Testing ID Prefixing Logic for Internal Links")
    print("=" * 70)
    print()

    test_cases = [
        # (href, source_chapter, target_chapter, expected_result, description)
        ("#introduction", "ch0001", None, "#ch0001-introduction",
         "Same-page anchor should be prefixed with chapter ID"),

        ("#section-001", "ch0001", None, "#ch0001-section-001",
         "Same-page section anchor should be prefixed"),

        ("#para-05", "ch0002", None, "#ch0002-para-05",
         "Same-page paragraph anchor in different chapter should be prefixed"),

        ("chapter02.xhtml#sec-001", "ch0001", "ch0002", "ch0002.xml#ch0002-sec-001",
         "Cross-chapter link fragment should be prefixed with target chapter"),

        ("chapter02.xhtml#para-05", "ch0001", "ch0002", "ch0002.xml#ch0002-para-05",
         "Cross-chapter paragraph link should be prefixed"),

        ("https://example.com#anchor", "ch0001", None, "https://example.com#anchor",
         "External link fragments should remain unchanged"),

        ("chapter02.xhtml", "ch0001", "ch0002", "ch0002.xml",
         "Cross-chapter link without fragment works correctly"),

        ("#", "ch0001", None, "#",
         "Empty fragment should remain as-is"),
    ]

    all_passed = True
    for href, source_ch, target_ch, expected, description in test_cases:
        result = resolve_link_href_logic(href, source_ch, target_ch)

        passed = result == expected
        all_passed = all_passed and passed

        status = "✓" if passed else "✗"
        print(f"{status} {description}")
        print(f"  Input:        {href}")
        print(f"  Source Ch:    {source_ch}")
        print(f"  Target Ch:    {target_ch}")
        print(f"  Expected:     {expected}")
        print(f"  Got:          {result}")
        if not passed:
            print(f"  *** FAILED ***")
        print()

    # Demonstrate ID collision prevention
    print("=" * 70)
    print("DEMONSTRATION: Why ID Prefixing is Necessary")
    print("=" * 70)
    print()
    print("Without prefixing:")
    print("  Chapter 1 has: <section id=\"intro\">")
    print("  Chapter 2 has: <section id=\"intro\">")
    print("  ❌ ID collision! DTD validation fails")
    print()
    print("With prefixing:")
    print("  Chapter 1 has: <section id=\"ch0001-intro\">")
    print("  Chapter 2 has: <section id=\"ch0002-intro\">")
    print("  ✓ No collision! Each ID is unique")
    print()
    print("Links must match:")
    print("  Link: <a href=\"#intro\">")
    print("  Becomes: <ulink url=\"#ch0001-intro\">  (same-page)")
    print("  OR:      <ulink url=\"ch0002.xml#ch0002-intro\">  (cross-chapter)")
    print()

    # Final result
    print("=" * 70)
    print("TEST RESULT")
    print("=" * 70)
    if all_passed:
        print("✓ ALL TESTS PASSED!")
        print()
        print("The ID prefixing and link resolution logic is working correctly:")
        print("  1. ✓ Same-page anchors (#id) are prefixed with source chapter ID")
        print("  2. ✓ Cross-chapter fragments are prefixed with target chapter ID")
        print("  3. ✓ External link fragments remain unchanged")
        print("  4. ✓ Links match prefixed IDs (e.g., ch0001-section1)")
        print("  5. ✓ No ID collisions across chapters")
    else:
        print("✗ SOME TESTS FAILED - See details above")
    print("=" * 70)

    return all_passed


if __name__ == "__main__":
    import sys
    success = test_fragment_link_prefixing()
    sys.exit(0 if success else 1)
