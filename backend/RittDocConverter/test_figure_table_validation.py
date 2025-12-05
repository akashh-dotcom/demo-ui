#!/usr/bin/env python3
"""
Test script to verify that figures and tables have all mandatory elements.

This test verifies that:
1. All figures have a title element
2. All figures have at least one mediaobject/graphic
3. All tables have a title element
4. All tables have at least one tgroup
"""

from lxml import etree
from pathlib import Path
import sys


def test_figure_validation():
    """Test that XSLT ensures figures have required elements"""

    print("=" * 70)
    print("Testing Figure Element Validation")
    print("=" * 70)
    print()

    # Test case 1: Figure without title
    xml1 = """<?xml version="1.0"?>
<book>
    <chapter>
        <figure>
            <mediaobject>
                <imageobject>
                    <imagedata fileref="test.jpg"/>
                </imageobject>
            </mediaobject>
        </figure>
    </chapter>
</book>"""

    # Test case 2: Figure without mediaobject
    xml2 = """<?xml version="1.0"?>
<book>
    <chapter>
        <figure>
            <title>Test Figure</title>
        </figure>
    </chapter>
</book>"""

    # Test case 3: Complete figure
    xml3 = """<?xml version="1.0"?>
<book>
    <chapter>
        <figure>
            <title>Test Figure</title>
            <mediaobject>
                <imageobject>
                    <imagedata fileref="test.jpg"/>
                </imageobject>
            </mediaobject>
        </figure>
    </chapter>
</book>"""

    xslt_path = Path(__file__).parent / "xslt" / "rittdoc_compliance.xslt"

    if not xslt_path.exists():
        print(f"✗ XSLT file not found: {xslt_path}")
        return False

    xslt_doc = etree.parse(str(xslt_path))
    transform = etree.XSLT(xslt_doc)

    all_passed = True

    # Test 1: Figure without title should get one
    print("Test 1: Figure without title")
    doc1 = etree.fromstring(xml1.encode())
    result1 = transform(doc1)
    figure1 = result1.find('.//figure')
    has_title = figure1.find('title') is not None
    passed1 = has_title
    all_passed = all_passed and passed1
    print(f"  {'✓' if passed1 else '✗'} Figure should have title element")
    if not passed1:
        print(f"    Expected: title element exists")
        print(f"    Got: {etree.tostring(figure1, pretty_print=True).decode()}")
    print()

    # Test 2: Figure without mediaobject should get one
    print("Test 2: Figure without mediaobject")
    doc2 = etree.fromstring(xml2.encode())
    result2 = transform(doc2)
    figure2 = result2.find('.//figure')
    has_mediaobject = figure2.find('mediaobject') is not None
    passed2 = has_mediaobject
    all_passed = all_passed and passed2
    print(f"  {'✓' if passed2 else '✗'} Figure should have mediaobject element")
    if not passed2:
        print(f"    Expected: mediaobject element exists")
        print(f"    Got: {etree.tostring(figure2, pretty_print=True).decode()}")
    print()

    # Test 3: Complete figure should pass through unchanged
    print("Test 3: Complete figure")
    doc3 = etree.fromstring(xml3.encode())
    result3 = transform(doc3)
    figure3 = result3.find('.//figure')
    has_both = (figure3.find('title') is not None and
                figure3.find('mediaobject') is not None)
    passed3 = has_both
    all_passed = all_passed and passed3
    print(f"  {'✓' if passed3 else '✗'} Complete figure should have both elements")
    print()

    return all_passed


def test_table_validation():
    """Test that XSLT ensures tables have required elements"""

    print("=" * 70)
    print("Testing Table Element Validation")
    print("=" * 70)
    print()

    # Test case 1: Table without title
    xml1 = """<?xml version="1.0"?>
<book>
    <chapter>
        <table>
            <tgroup cols="2">
                <tbody>
                    <row>
                        <entry><para>Cell 1</para></entry>
                        <entry><para>Cell 2</para></entry>
                    </row>
                </tbody>
            </tgroup>
        </table>
    </chapter>
</book>"""

    # Test case 2: Table without tgroup
    xml2 = """<?xml version="1.0"?>
<book>
    <chapter>
        <table>
            <title>Test Table</title>
        </table>
    </chapter>
</book>"""

    # Test case 3: Complete table
    xml3 = """<?xml version="1.0"?>
<book>
    <chapter>
        <table>
            <title>Test Table</title>
            <tgroup cols="2">
                <tbody>
                    <row>
                        <entry><para>Cell 1</para></entry>
                        <entry><para>Cell 2</para></entry>
                    </row>
                </tbody>
            </tgroup>
        </table>
    </chapter>
</book>"""

    xslt_path = Path(__file__).parent / "xslt" / "rittdoc_compliance.xslt"
    xslt_doc = etree.parse(str(xslt_path))
    transform = etree.XSLT(xslt_doc)

    all_passed = True

    # Test 1: Table without title should get one
    print("Test 1: Table without title")
    doc1 = etree.fromstring(xml1.encode())
    result1 = transform(doc1)
    table1 = result1.find('.//table')
    has_title = table1.find('title') is not None
    passed1 = has_title
    all_passed = all_passed and passed1
    print(f"  {'✓' if passed1 else '✗'} Table should have title element")
    if not passed1:
        print(f"    Got: {etree.tostring(table1, pretty_print=True).decode()}")
    print()

    # Test 2: Table without tgroup should get one
    print("Test 2: Table without tgroup")
    doc2 = etree.fromstring(xml2.encode())
    result2 = transform(doc2)
    table2 = result2.find('.//table')
    has_tgroup = table2.find('tgroup') is not None
    passed2 = has_tgroup
    all_passed = all_passed and passed2
    print(f"  {'✓' if passed2 else '✗'} Table should have tgroup element")
    if not passed2:
        print(f"    Got: {etree.tostring(table2, pretty_print=True).decode()}")
    print()

    # Test 3: Complete table should pass through
    print("Test 3: Complete table")
    doc3 = etree.fromstring(xml3.encode())
    result3 = transform(doc3)
    table3 = result3.find('.//table')
    has_both = (table3.find('title') is not None and
                table3.find('tgroup') is not None)
    passed3 = has_both
    all_passed = all_passed and passed3
    print(f"  {'✓' if passed3 else '✗'} Complete table should have both elements")
    print()

    return all_passed


if __name__ == "__main__":
    print()
    print("=" * 70)
    print("DTD Compliance Tests: Figure and Table Validation")
    print("=" * 70)
    print()

    figure_ok = test_figure_validation()
    table_ok = test_table_validation()

    print("=" * 70)
    print("FINAL RESULT")
    print("=" * 70)

    if figure_ok and table_ok:
        print("✓ ALL TESTS PASSED!")
        print()
        print("Summary:")
        print("  1. ✓ Figures without titles get default titles")
        print("  2. ✓ Figures without mediaobjects get placeholder mediaobjects")
        print("  3. ✓ Tables without titles get default titles")
        print("  4. ✓ Tables without tgroups get placeholder tgroups")
        print()
        print("DTD Requirements Satisfied:")
        print("  - figure: title + (mediaobject|graphic)+")
        print("  - table: title + (tgroup|graphic|mediaobject)+")
        sys.exit(0)
    else:
        print("✗ SOME TESTS FAILED")
        if not figure_ok:
            print("  ✗ Figure validation failed")
        if not table_ok:
            print("  ✗ Table validation failed")
        sys.exit(1)
