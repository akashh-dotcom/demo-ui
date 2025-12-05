#!/usr/bin/env python3
"""
Test script to verify XSLT transformations fix DTD validation issues.

Tests:
1. Auto-generation of IDs for sect1-sect5 elements
2. Conversion of figure-with-table to standalone table
3. Removal of misplaced figures from book root
4. Proper handling of references when converting structures
"""

import sys
from pathlib import Path
from lxml import etree

def test_xslt_transformations():
    """Test all XSLT transformations for DTD compliance."""

    # Load XSLT
    xslt_path = Path(__file__).parent / "xslt" / "rittdoc_compliance.xslt"
    with open(xslt_path, 'rb') as f:
        xslt_doc = etree.parse(f)
    transform = etree.XSLT(xslt_doc)

    print("=" * 70)
    print("XSLT DTD Compliance Transformation Tests")
    print("=" * 70)

    # Test 1: Auto-generate section IDs
    print("\n[Test 1] Auto-generate IDs for sections without them")
    test1_xml = """<?xml version="1.0" encoding="UTF-8"?>
<book>
    <bookinfo>
        <title>Test Book</title>
    </bookinfo>
    <chapter>
        <title>Chapter 1</title>
        <sect1>
            <title>Section 1.1 - No ID</title>
            <para>This section has no ID attribute.</para>
        </sect1>
        <sect1 id="existing-id">
            <title>Section 1.2 - Has ID</title>
            <para>This section already has an ID.</para>
        </sect1>
        <section>
            <title>Generic Section - Will become sect1</title>
            <para>This will be converted from section to sect1 and get an ID.</para>
            <section>
                <title>Nested Section - Will become sect2</title>
                <para>This will become sect2 with ID.</para>
            </section>
        </section>
    </chapter>
</book>"""

    doc1 = etree.fromstring(test1_xml.encode('utf-8'))
    result1 = transform(doc1)

    # Check that all sect elements have IDs
    sect_elements = result1.xpath('//sect1 | //sect2 | //sect3 | //sect4 | //sect5')
    missing_ids = [elem for elem in sect_elements if not elem.get('id')]

    print(f"  Total sect1-5 elements: {len(sect_elements)}")
    print(f"  Elements missing IDs: {len(missing_ids)}")

    if missing_ids:
        print("  ✗ FAILED - Some sections still missing IDs:")
        for elem in missing_ids:
            title = elem.find('title')
            title_text = title.text if title is not None else "No title"
            print(f"    - {elem.tag}: {title_text}")
    else:
        print("  ✓ PASSED - All sections have IDs")
        # Show generated IDs
        for elem in sect_elements:
            title = elem.find('title')
            title_text = title.text if title is not None else "No title"
            print(f"    {elem.tag} id='{elem.get('id')}': {title_text}")

    # Test 2: Convert figure-with-table to table
    print("\n[Test 2] Convert figure elements containing tables to standalone tables")
    test2_xml = """<?xml version="1.0" encoding="UTF-8"?>
<book>
    <bookinfo>
        <title>Test Book</title>
    </bookinfo>
    <chapter>
        <title>Chapter 1</title>
        <sect1 id="test-sect">
            <title>Test Section</title>
            <figure id="fig-with-table">
                <title>Figure containing a table</title>
                <mediaobject>
                    <imageobject>
                        <imagedata fileref="image.jpg"/>
                    </imageobject>
                </mediaobject>
                <table>
                    <title>Table inside figure</title>
                    <tgroup cols="2">
                        <tbody>
                            <row>
                                <entry>Cell 1</entry>
                                <entry>Cell 2</entry>
                            </row>
                        </tbody>
                    </tgroup>
                </table>
            </figure>
            <figure id="fig-only-table">
                <title>Figure with only table (no other content)</title>
                <table>
                    <title>Table title</title>
                    <tgroup cols="1">
                        <tbody>
                            <row>
                                <entry>Data</entry>
                            </row>
                        </tbody>
                    </tgroup>
                </table>
            </figure>
        </sect1>
    </chapter>
</book>"""

    doc2 = etree.fromstring(test2_xml.encode('utf-8'))
    result2 = transform(doc2)

    # Check that figures with tables are converted
    figures_with_tables = result2.xpath('//figure[table]')
    standalone_tables = result2.xpath('//table[not(parent::figure)]')

    print(f"  Figures still containing tables: {len(figures_with_tables)}")
    print(f"  Standalone tables (not in figures): {len(standalone_tables)}")

    if figures_with_tables:
        print("  ✗ FAILED - Some figures still contain tables:")
        for fig in figures_with_tables:
            fig_title = fig.find('title')
            print(f"    - Figure: {fig_title.text if fig_title is not None else 'No title'}")
    else:
        print("  ✓ PASSED - No figures contain tables")
        print(f"  Tables converted: {len(standalone_tables)}")
        for tbl in standalone_tables:
            tbl_title = tbl.find('title')
            print(f"    - Table: {tbl_title.text if tbl_title is not None else 'No title'}")

    # Test 3: Remove misplaced figures from book root
    print("\n[Test 3] Remove misplaced figures from book root")
    test3_xml = """<?xml version="1.0" encoding="UTF-8"?>
<book>
    <bookinfo>
        <title>Test Book</title>
    </bookinfo>
    <figure id="misplaced-figure">
        <title>This figure is misplaced at book root level</title>
        <mediaobject>
            <imageobject>
                <imagedata fileref="bad-image.jpg"/>
            </imageobject>
        </mediaobject>
    </figure>
    <chapter>
        <title>Chapter 1</title>
        <para>Valid content</para>
    </chapter>
</book>"""

    doc3 = etree.fromstring(test3_xml.encode('utf-8'))
    result3 = transform(doc3)

    # Check for figures at book root level
    root_figures = result3.xpath('/book/figure')

    print(f"  Figures at book root level: {len(root_figures)}")

    if root_figures:
        print("  ✗ FAILED - Figures still at book root:")
        for fig in root_figures:
            fig_title = fig.find('title')
            print(f"    - {fig_title.text if fig_title is not None else 'No title'}")
    else:
        print("  ✓ PASSED - No figures at book root level")
        # Check for comment indicating removal
        comments = result3.xpath('/book/comment()')
        removed_comment = any('Removed misplaced figure' in str(c) for c in comments)
        if removed_comment:
            print("  ✓ Found comment indicating figure was removed")

    # Test 4: Auto-generate IDs for anchor elements
    print("\n[Test 4] Auto-generate IDs for anchor elements (ID is REQUIRED)")
    test4_xml = """<?xml version="1.0" encoding="UTF-8"?>
<book>
    <bookinfo>
        <title>Test Book</title>
    </bookinfo>
    <chapter>
        <title>Chapter 1</title>
        <para>
            Text with <anchor/> an anchor without ID.
        </para>
        <para>
            Another <anchor id="existing-anchor"/> anchor with existing ID.
        </para>
        <sect1 id="test-section">
            <title>Section</title>
            <para>Content with <anchor/> another anchor.</para>
        </sect1>
    </chapter>
</book>"""

    doc4 = etree.fromstring(test4_xml.encode('utf-8'))
    result4 = transform(doc4)

    # Check that all anchors have IDs
    anchors = result4.xpath('//anchor')
    anchors_without_ids = [a for a in anchors if not a.get('id')]

    print(f"  Total anchor elements: {len(anchors)}")
    print(f"  Anchors missing IDs: {len(anchors_without_ids)}")

    if anchors_without_ids:
        print("  ✗ FAILED - Some anchors still missing IDs")
    else:
        print("  ✓ PASSED - All anchors have IDs")
        for anchor in anchors:
            print(f"    anchor id='{anchor.get('id')}'")

    # Test 5: Ensure sections are not empty
    print("\n[Test 5] Ensure sections are not empty (must have content)")
    test5_xml = """<?xml version="1.0" encoding="UTF-8"?>
<book>
    <bookinfo>
        <title>Test Book</title>
    </bookinfo>
    <chapter>
        <title>Chapter 1</title>
        <sect1 id="empty-section">
            <title>Empty Section - Only has title</title>
        </sect1>
        <sect1 id="section-with-content">
            <title>Section with Content</title>
            <para>This section has content.</para>
        </sect1>
        <sect1 id="section-with-subsections">
            <title>Section with Subsections</title>
            <sect2 id="subsection">
                <title>Subsection</title>
            </sect2>
        </sect1>
    </chapter>
</book>"""

    doc5 = etree.fromstring(test5_xml.encode('utf-8'))
    result5 = transform(doc5)

    # Check that sections have content (at least a para or subsections)
    all_sections = result5.xpath('//sect1 | //sect2 | //sect3 | //sect4 | //sect5')
    empty_sections = []

    for sect in all_sections:
        # Check if section has content beyond title/subtitle/titleabbrev
        has_content = False
        for child in sect:
            tag = child.tag if isinstance(child.tag, str) else str(child.tag)
            if tag not in ['title', 'subtitle', 'titleabbrev', 'sect1info', 'sect2info', 'sect3info', 'sect4info', 'sect5info']:
                has_content = True
                break

        if not has_content:
            empty_sections.append(sect)

    print(f"  Total sections: {len(all_sections)}")
    print(f"  Empty sections (title only): {len(empty_sections)}")

    if empty_sections:
        print("  ✗ FAILED - Some sections are empty:")
        for sect in empty_sections:
            title = sect.find('title')
            title_text = title.text if title is not None else "No title"
            print(f"    - {sect.tag}: {title_text}")
    else:
        print("  ✓ PASSED - All sections have content")
        # Show what was added to originally empty sections
        for sect in all_sections:
            title = sect.find('title')
            title_text = title.text if title is not None else "No title"
            # Count non-title content
            content_count = len([c for c in sect if c.tag not in ['title', 'subtitle', 'titleabbrev', 'sect1info', 'sect2info', 'sect3info', 'sect4info', 'sect5info']])
            print(f"    {sect.tag} '{title_text}': {content_count} content element(s)")

    # Final summary
    print("\n" + "=" * 70)
    print("Test Summary")
    print("=" * 70)

    all_tests_passed = (
        len(missing_ids) == 0 and
        len(figures_with_tables) == 0 and
        len(root_figures) == 0 and
        len(anchors_without_ids) == 0 and
        len(empty_sections) == 0
    )

    if all_tests_passed:
        print("✓ ALL TESTS PASSED")
        print("\nThe XSLT transformation successfully:")
        print("  1. Auto-generates IDs for all sect1-sect5 elements")
        print("  2. Converts figures containing tables to standalone tables")
        print("  3. Removes misplaced figures from book root")
        print("  4. Auto-generates IDs for all anchor elements")
        print("  5. Ensures sections are not empty (adds placeholder para)")
        return 0
    else:
        print("✗ SOME TESTS FAILED")
        print("\nPlease review the failures above.")
        return 1

if __name__ == '__main__':
    sys.exit(test_xslt_transformations())
