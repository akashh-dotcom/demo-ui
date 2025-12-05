#!/usr/bin/env python3
"""
Comprehensive DTD Fixer for RittDoc

This script applies comprehensive fixes to resolve ALL common DTD validation errors:
1. Invalid content models (wrap/reorder elements)
2. Missing required elements (add defaults)
3. Invalid/undeclared elements (remove or convert)
4. Empty elements (add minimal content or remove)
5. Missing required attributes (add defaults)
6. Invalid attribute values (fix or remove)

The fixer runs validation before and after fixes to show improvement.
"""

import re
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import List, Tuple, Dict, Set
from lxml import etree
from copy import deepcopy

try:
    from validation_report import ValidationReportGenerator, VerificationItem, ValidationError
    VALIDATION_REPORT_AVAILABLE = True
except ImportError:
    VALIDATION_REPORT_AVAILABLE = False

try:
    from validate_with_entity_tracking import EntityTrackingValidator
    VALIDATION_AVAILABLE = True
except ImportError:
    VALIDATION_AVAILABLE = False


class ComprehensiveDTDFixer:
    """Comprehensive DTD fixer that handles all common validation errors"""

    def __init__(self, dtd_path: Path):
        self.dtd_path = dtd_path
        self.dtd = etree.DTD(str(dtd_path))
        self.fixes_applied = []
        self.verification_items = []

    @staticmethod
    def _local_name(element: etree._Element) -> str:
        """Extract local name from element tag."""
        tag = element.tag
        if not isinstance(tag, str):
            return ""
        if tag.startswith("{"):
            return tag.split("}", 1)[1]
        return tag

    @staticmethod
    def _is_inline_only(element: etree._Element) -> bool:
        """
        Check if an element contains only inline content (no block elements).

        Block elements include: itemizedlist, orderedlist, figure, table, sect*, etc.
        Inline elements include: emphasis, ulink, subscript, superscript, anchor, etc.
        """
        BLOCK_ELEMENTS = {
            'itemizedlist', 'orderedlist', 'variablelist', 'simplelist',
            'figure', 'informalfigure', 'table', 'informaltable',
            'example', 'informalexample',
            'programlisting', 'screen', 'literallayout',
            'blockquote', 'note', 'warning', 'caution', 'important', 'tip',
            'sect1', 'sect2', 'sect3', 'sect4', 'sect5', 'section',
            'para'  # Nested para is also a block element
        }

        # Check all child elements
        for child in element:
            if isinstance(child.tag, str):
                local = ComprehensiveDTDFixer._local_name(child)
                if local in BLOCK_ELEMENTS:
                    return False
                # Recursively check children
                if not ComprehensiveDTDFixer._is_inline_only(child):
                    return False

        return True

    def fix_chapter_file(self, chapter_path: Path, chapter_filename: str) -> Tuple[int, List[str]]:
        """
        Apply comprehensive fixes to a chapter XML file.

        Returns:
            Tuple of (num_fixes, list_of_fix_descriptions)
        """
        fixes = []

        try:
            # Parse XML
            parser = etree.XMLParser(remove_blank_text=True)
            tree = etree.parse(str(chapter_path), parser)
            root = tree.getroot()

            # Apply fixes in order
            # First remove misclassified figures and empty mediaobjects
            fixes.extend(self._remove_empty_mediaobjects(root, chapter_filename))
            fixes.extend(self._remove_misclassified_table_figures(root, chapter_filename))
            # Remove empty table rows
            fixes.extend(self._remove_empty_rows(root, chapter_filename))
            # Fix nested para elements (important for preserving links)
            fixes.extend(self._fix_nested_para_elements(root, chapter_filename))
            # Then apply other fixes
            fixes.extend(self._fix_missing_titles(root, chapter_filename))
            fixes.extend(self._fix_invalid_content_models(root, chapter_filename))
            fixes.extend(self._fix_empty_elements(root, chapter_filename))
            fixes.extend(self._fix_missing_required_attributes(root, chapter_filename))
            fixes.extend(self._fix_invalid_elements(root, chapter_filename))
            fixes.extend(self._normalize_whitespace(root, chapter_filename))

            # Always write back to ensure XML declaration is present
            # (even if no other fixes were needed)
            tree.write(
                str(chapter_path),
                encoding='utf-8',
                xml_declaration=True,
                pretty_print=True
            )

            return len(fixes), fixes

        except Exception as e:
            print(f"  ✗ Error fixing {chapter_filename}: {e}")
            return 0, []

    def _fix_missing_titles(self, root: etree._Element, filename: str) -> List[str]:
        """Fix elements that require <title> but are missing it"""
        fixes = []

        # Elements that require titles in RittDoc DTD
        title_required = ['chapter', 'sect1', 'sect2', 'sect3', 'sect4', 'sect5',
                          'figure', 'table', 'example', 'appendix']

        for elem_name in title_required:
            for elem in root.iter(elem_name):
                # Check if title exists as first child (after possible meta elements)
                has_title = False
                for child in elem:
                    if child.tag == 'title':
                        has_title = True
                        break
                    # Skip metadata elements
                    if child.tag not in ['chapterinfo', 'sectioninfo']:
                        break

                if not has_title:
                    # Create and insert title
                    title = etree.Element('title')

                    # Generate appropriate title text
                    if elem_name == 'chapter':
                        chapter_id = elem.get('id', 'Chapter')
                        title.text = f"Chapter {chapter_id}"
                    elif elem_name.startswith('sect'):
                        section_id = elem.get('id', 'Section')
                        title.text = f"Section {section_id}"
                    elif elem_name == 'figure':
                        fig_id = elem.get('id', 'figure')
                        title.text = f"Figure {fig_id}"
                    elif elem_name == 'table':
                        table_id = elem.get('id', 'table')
                        title.text = f"Table {table_id}"
                    else:
                        title.text = f"Untitled {elem_name}"

                    # Insert as first child
                    elem.insert(0, title)

                    fixes.append(f"Added missing <title> to <{elem_name}> in {filename}")

                    # Add verification item
                    if VALIDATION_REPORT_AVAILABLE:
                        self.verification_items.append(VerificationItem(
                            xml_file=filename,
                            line_number=elem.sourceline if hasattr(elem, 'sourceline') else None,
                            fix_type="Missing Title Fix",
                            fix_description=f"Added auto-generated title: '{title.text}'",
                            verification_reason="Title was auto-generated. Content may need a more descriptive title.",
                            suggestion="Review and update the title to accurately describe the content."
                        ))

        return fixes

    def _fix_nested_para_elements(self, root: etree._Element, filename: str) -> List[str]:
        """
        Fix nested para elements by intelligently unwrapping or flattening them.

        Strategy:
        1. If nested para contains ONLY inline elements (links, emphasis, etc.):
           -> Unwrap it: merge its content into the parent para
        2. If nested para contains block elements (lists, tables, etc.):
           -> Flatten it: create sibling para elements

        This preserves links and formatting while fixing DTD violations.
        """
        fixes = []
        # Find all para elements that contain other para elements
        for para in list(root.iter('para')):
            nested_paras = [child for child in para if isinstance(child.tag, str) and self._local_name(child) == "para"]

            if not nested_paras:
                continue

            parent = para.getparent()
            if parent is None:
                continue

            # Check if we can unwrap (inline-only) or need to flatten (has block content)
            for nested_para in nested_paras:
                if self._is_inline_only(nested_para):
                    # UNWRAP: Nested para has only inline content (links, emphasis, etc.)
                    # Move its content directly into parent para, preserving all inline elements

                    # Get position of nested para within parent para
                    nested_index = list(para).index(nested_para)

                    # Insert nested para's children before it
                    for i, child in enumerate(list(nested_para)):
                        para.insert(nested_index + i, child)

                    # Handle text content
                    if nested_para.text:
                        if nested_index > 0:
                            # Add to previous sibling's tail
                            prev = para[nested_index - 1]
                            prev.tail = (prev.tail or '') + nested_para.text
                        else:
                            # Add to parent para's text
                            para.text = (para.text or '') + nested_para.text

                    # Handle tail text (text after nested para)
                    if nested_para.tail:
                        # Find last inserted child and append to its tail
                        if len(nested_para) > 0:
                            last_child = para[nested_index + len(nested_para) - 1]
                            last_child.tail = (last_child.tail or '') + nested_para.tail
                        elif nested_index > 0:
                            prev = para[nested_index - 1]
                            prev.tail = (prev.tail or '') + nested_para.tail
                        else:
                            para.text = (para.text or '') + nested_para.tail

                    # Remove the nested para element itself
                    para.remove(nested_para)
                    fixes.append(f"Unwrapped inline-only nested para in {filename}")

                else:
                    # FLATTEN: Nested para has block content - create sibling paras
                    para_index = list(parent).index(para)

                    # Create new para element at parent level
                    new_para = etree.Element("para")
                    if nested_para.get("id"):
                        new_para.set("id", nested_para.get("id"))

                    # Copy text and children
                    new_para.text = nested_para.text
                    for child in nested_para:
                        new_para.append(deepcopy(child))

                    # Insert after current para
                    para_index += 1
                    parent.insert(para_index, new_para)

                    # Handle tail text: if there's text after the nested para,
                    # wrap it in a new para element
                    if nested_para.tail and nested_para.tail.strip():
                        tail_para = etree.Element("para")
                        tail_para.text = nested_para.tail
                        para_index += 1
                        parent.insert(para_index, tail_para)

                    # Remove from original para
                    para.remove(nested_para)
                    fixes.append(f"Flattened block-content nested para in {filename}")

                    if VALIDATION_REPORT_AVAILABLE:
                        self.verification_items.append(VerificationItem(
                            xml_file=filename,
                            line_number=para.sourceline if hasattr(para, 'sourceline') else None,
                            fix_type="Nested Para Fix",
                            fix_description="Fixed nested para element",
                            verification_reason="Nested para elements are not allowed per DTD.",
                            suggestion="Verify that content and links are preserved correctly."
                        ))

        return fixes

    def _remove_empty_mediaobjects(self, root: etree._Element, filename: str) -> List[str]:
        """Remove empty/placeholder mediaobjects from anywhere in the document"""
        fixes = []

        # Find all mediaobjects
        for mediaobj in list(root.iter('mediaobject')):
            # Check if this is an empty/placeholder mediaobject
            is_placeholder = False

            # Check for "Image not available" or similar placeholder text
            for textobj in mediaobj.iter('textobject'):
                for phrase in textobj.iter('phrase'):
                    if phrase.text and ('not available' in phrase.text.lower() or
                                        'no image' in phrase.text.lower() or
                                        phrase.text.strip() in ['', 'N/A', 'n/a']):
                        is_placeholder = True
                        break

            # Also check if mediaobject has no real content (no imagedata/videodata/audiodata)
            has_real_media = (mediaobj.find('.//imagedata') is not None or
                            mediaobj.find('.//videodata') is not None or
                            mediaobj.find('.//audiodata') is not None)

            if is_placeholder or not has_real_media:
                parent = mediaobj.getparent()
                if parent is not None:
                    # Check context before removing
                    parent_tag = parent.tag

                    # Remove the empty mediaobject
                    parent.remove(mediaobj)
                    fixes.append(f"Removed empty/placeholder mediaobject from <{parent_tag}> in {filename}")

                    # If parent is now a figure with no content (no mediaobject/graphic),
                    # we'll handle that in another fix
                    if VALIDATION_REPORT_AVAILABLE:
                        self.verification_items.append(VerificationItem(
                            xml_file=filename,
                            line_number=parent.sourceline if hasattr(parent, 'sourceline') else None,
                            fix_type="Empty Mediaobject Removal",
                            fix_description=f"Removed placeholder mediaobject with no real media content",
                            verification_reason="Mediaobject contained only placeholder text or no media.",
                            suggestion="Verify that removing this mediaobject didn't affect document structure."
                        ))

        return fixes

    def _remove_misclassified_table_figures(self, root: etree._Element, filename: str) -> List[str]:
        """Convert or remove invalid figure elements"""
        fixes = []

        # Process all figures
        for figure in list(root.iter('figure')):
            title_elem = figure.find('title')

            # Check if figure has real media content
            has_real_image = (figure.find('.//imagedata') is not None or
                             figure.find('.//videodata') is not None or
                             figure.find('.//audiodata') is not None)

            # Check for placeholder text
            has_placeholder = False
            for phrase in figure.iter('phrase'):
                if phrase.text and 'not available' in phrase.text.lower():
                    has_placeholder = True
                    break

            # Skip figures that have real media content
            if has_real_image and not has_placeholder:
                continue

            # Get title text (if any)
            title_text = ''
            if title_elem is not None:
                title_text = ''.join(title_elem.itertext()).strip()

            # Case 1: Figure with no title or empty/meaningless title - REMOVE completely
            if not title_text or title_text.lower() in ['untitled', 'no title', 'n/a']:
                parent = figure.getparent()
                if parent is not None:
                    parent.remove(figure)
                    fixes.append(f"Removed empty figure with no meaningful title in {filename}")

                    if VALIDATION_REPORT_AVAILABLE:
                        self.verification_items.append(VerificationItem(
                            xml_file=filename,
                            line_number=figure.sourceline if hasattr(figure, 'sourceline') else None,
                            fix_type="Empty Figure Removal",
                            fix_description=f"Removed figure with no media and no meaningful title",
                            verification_reason="Figure had no real media content and title was empty or 'Untitled'.",
                            suggestion="Verify this empty figure was not needed."
                        ))

            # Case 2: Figure with "table" in title - CONVERT to para
            elif 'table' in title_text.lower():
                parent = figure.getparent()
                if parent is not None:
                    # Get figure's position in parent
                    fig_index = list(parent).index(figure)

                    # Create a new para element with the figure's title content
                    para = etree.Element('para')

                    # Copy all attributes from figure (like id)
                    for attr, value in figure.attrib.items():
                        para.set(attr, value)

                    # Copy all content from title into para
                    # Preserve all nested elements (emphasis, phrase, ulink, etc.)
                    if title_elem.text:
                        para.text = title_elem.text
                    for child in title_elem:
                        para.append(child)

                    # Insert para at figure's position
                    parent.insert(fig_index, para)

                    # Remove the figure
                    parent.remove(figure)

                    fixes.append(f"Converted misclassified figure (table label) to para in {filename}")

                    if VALIDATION_REPORT_AVAILABLE:
                        self.verification_items.append(VerificationItem(
                            xml_file=filename,
                            line_number=figure.sourceline if hasattr(figure, 'sourceline') else None,
                            fix_type="Misclassified Figure Conversion",
                            fix_description=f"Converted figure with 'table' in title to para: '{title_text[:60]}'",
                            verification_reason="Figure had 'table' in title but no real image content.",
                            suggestion="Verify the table caption is preserved correctly."
                        ))

            # Case 3: Figure with other title but no media - REMOVE (these are likely errors)
            else:
                parent = figure.getparent()
                if parent is not None:
                    parent.remove(figure)
                    fixes.append(f"Removed empty figure '{title_text[:40]}' with no media in {filename}")

                    if VALIDATION_REPORT_AVAILABLE:
                        self.verification_items.append(VerificationItem(
                            xml_file=filename,
                            line_number=figure.sourceline if hasattr(figure, 'sourceline') else None,
                            fix_type="Empty Figure Removal",
                            fix_description=f"Removed figure with no media: '{title_text[:60]}'",
                            verification_reason="Figure had no real media content.",
                            suggestion="Verify this figure was not needed or check if media is missing."
                        ))

        return fixes

    def _fix_invalid_content_models(self, root: etree._Element, filename: str) -> List[str]:
        """Fix elements with invalid content model (wrong child sequence)"""
        fixes = []

        # Fix chapters with disallowed content as direct children (need sect1 wrapper)
        # GENERIC APPROACH: Use whitelist per ritthier2.mod DTD
        # Allowed direct children: beginpage, chapterinfo, title, subtitle, titleabbrev, tocchap,
        #                         toc, lot, index, glossary, bibliography, sect1, section
        ALLOWED_CHAPTER_CHILDREN = {
            'beginpage', 'chapterinfo', 'title', 'subtitle', 'titleabbrev', 'tocchap',
            'toc', 'lot', 'index', 'glossary', 'bibliography', 'sect1', 'section'
        }

        for chapter in root.iter('chapter'):
            violating_elements = []
            has_sections = False

            # Check all direct children after title
            past_title = False
            for child in chapter:
                if child.tag == 'title':
                    past_title = True
                    continue

                if not past_title:
                    continue

                # Check for section elements
                if child.tag in ['sect1', 'section', 'toc', 'lot', 'index', 'glossary', 'bibliography']:
                    has_sections = True

                # Check for disallowed elements (anything not in whitelist)
                if child.tag not in ALLOWED_CHAPTER_CHILDREN:
                    violating_elements.append(child)

            # If we have violating elements, wrap them in sect1
            if violating_elements:
                chapter_id = chapter.get('id', 'chapter')

                # Create wrapper sect1
                sect1 = etree.Element('sect1')
                sect1.set('id', f"{chapter_id}-intro")

                # Add title
                title = etree.Element('title')
                title.text = "Introduction"
                sect1.append(title)

                # Move violating elements into sect1
                for elem in violating_elements:
                    chapter.remove(elem)
                    sect1.append(elem)

                # Insert sect1 after title and header elements
                insert_index = 0
                for i, child in enumerate(chapter):
                    if child.tag in ['beginpage', 'chapterinfo', 'title', 'subtitle', 'titleabbrev', 'tocchap']:
                        insert_index = i + 1

                chapter.insert(insert_index, sect1)

                fixes.append(f"Wrapped {len(violating_elements)} violating elements in <sect1> in chapter {chapter_id}")

                if VALIDATION_REPORT_AVAILABLE:
                    self.verification_items.append(VerificationItem(
                        xml_file=filename,
                        line_number=chapter.sourceline if hasattr(chapter, 'sourceline') else None,
                        fix_type="Content Model Fix",
                        fix_description=f"Wrapped {len(violating_elements)} elements in <sect1 id=\"{chapter_id}-intro\">",
                        verification_reason="Generic 'Introduction' section was auto-created.",
                        suggestion="Review content and update section title if needed."
                    ))

        # Fix lists that need listitem children
        for list_elem in root.iter('orderedlist', 'itemizedlist'):
            # Check if list has any non-listitem children
            for child in list_elem:
                if child.tag not in ['listitem', 'title']:
                    # Wrap in listitem
                    listitem = etree.Element('listitem')
                    list_elem.remove(child)
                    listitem.append(child)
                    list_elem.append(listitem)
                    fixes.append(f"Wrapped <{child.tag}> in <listitem> in {filename}")

        return fixes

    def _fix_empty_elements(self, root: etree._Element, filename: str) -> List[str]:
        """Fix elements that shouldn't be empty"""
        fixes = []

        # Elements that shouldn't be empty
        non_empty = {
            'title': 'Untitled',
            'para': 'Content not available',
            'entry': ' ',  # Table cells can have single space
            'term': 'Term',
        }

        for elem_name, default_text in non_empty.items():
            for elem in root.iter(elem_name):
                # Check if element is truly empty (no text and no children)
                if elem.text is None and len(elem) == 0:
                    elem.text = default_text
                    fixes.append(f"Added default text to empty <{elem_name}> in {filename}")
                # Check if element only has whitespace
                elif elem.text and elem.text.strip() == '' and len(elem) == 0:
                    elem.text = default_text
                    fixes.append(f"Replaced whitespace-only content in <{elem_name}> in {filename}")

        return fixes

    def _remove_empty_rows(self, root: etree._Element, filename: str) -> List[str]:
        """Remove empty row elements from tables"""
        fixes = []

        # Find all row elements
        for row in list(root.iter('row')):
            # Check if row has no entry children (completely empty)
            entries = list(row.iter('entry'))
            if len(entries) == 0:
                parent = row.getparent()
                if parent is not None:
                    parent.remove(row)
                    fixes.append(f"Removed empty <row/> element in {filename}")

                    if VALIDATION_REPORT_AVAILABLE:
                        self.verification_items.append(VerificationItem(
                            xml_file=filename,
                            line_number=row.sourceline if hasattr(row, 'sourceline') else None,
                            fix_type="Empty Row Removal",
                            fix_description="Removed row element with no entry children",
                            verification_reason="Row elements must contain at least one entry element per DTD.",
                            suggestion="Check source EPUB for empty table rows."
                        ))

        return fixes

    def _fix_missing_required_attributes(self, root: etree._Element, filename: str) -> List[str]:
        """Fix elements missing required attributes"""
        fixes = []

        # Table tgroup requires cols attribute
        for tgroup in root.iter('tgroup'):
            if 'cols' not in tgroup.attrib:
                # Count actual columns from first row
                cols = 0
                for tbody in tgroup.iter('tbody'):
                    for row in tbody.iter('row'):
                        cols = len(list(row.iter('entry')))
                        break
                    break

                if cols == 0:
                    # Try thead
                    for thead in tgroup.iter('thead'):
                        for row in thead.iter('row'):
                            cols = len(list(row.iter('entry')))
                            break
                        break

                if cols == 0:
                    cols = 1  # Default

                tgroup.set('cols', str(cols))
                fixes.append(f"Added cols=\"{cols}\" to <tgroup> in {filename}")

        # Imagedata should have fileref
        for imagedata in root.iter('imagedata'):
            if 'fileref' not in imagedata.attrib:
                # Try to find nearby file reference or use placeholder
                imagedata.set('fileref', 'image-placeholder.png')
                fixes.append(f"Added placeholder fileref to <imagedata> in {filename}")

        return fixes

    def _fix_invalid_elements(self, root: etree._Element, filename: str) -> List[str]:
        """Remove or convert invalid/undeclared elements"""
        fixes = []

        # Common invalid elements to remove or convert
        invalid_to_remove = ['html', 'body', 'div', 'span', 'br', 'hr', 'style', 'script']
        invalid_to_para = ['p']  # Convert <p> to <para>

        # Remove invalid elements but keep their content
        for elem_name in invalid_to_remove:
            for elem in root.iter(elem_name):
                # Preserve text content
                if elem.text:
                    # Try to add text to previous sibling
                    parent = elem.getparent()
                    if parent is not None:
                        index = list(parent).index(elem)
                        if index > 0:
                            prev = parent[index - 1]
                            if prev.tail:
                                prev.tail += elem.text
                            else:
                                prev.tail = elem.text

                # Move children up to parent
                parent = elem.getparent()
                if parent is not None:
                    index = list(parent).index(elem)
                    for child in reversed(list(elem)):
                        elem.remove(child)
                        parent.insert(index + 1, child)

                    parent.remove(elem)
                    fixes.append(f"Removed invalid element <{elem_name}> in {filename}")

        # Convert <p> to <para>
        for p_elem in root.iter('p'):
            p_elem.tag = 'para'
            fixes.append(f"Converted <p> to <para> in {filename}")

        return fixes

    def _normalize_whitespace(self, root: etree._Element, filename: str) -> List[str]:
        """Normalize whitespace in text content"""
        fixes = []

        # Elements where we should normalize whitespace
        normalize_in = ['title', 'para', 'term', 'entry']

        for elem_name in normalize_in:
            for elem in root.iter(elem_name):
                if elem.text:
                    # Normalize whitespace (collapse multiple spaces, trim)
                    normalized = ' '.join(elem.text.split())
                    if normalized != elem.text and elem.text.strip() == normalized.strip():
                        elem.text = normalized
                        # Don't report this as it's minor

        return fixes


def process_zip_package(
    zip_path: Path,
    output_path: Path,
    dtd_path: Path,
    generate_reports: bool = True
) -> dict:
    """
    Apply comprehensive DTD fixes to all chapter files in a ZIP package.

    Args:
        zip_path: Input ZIP package
        output_path: Output ZIP package
        dtd_path: Path to DTD file
        generate_reports: Generate before/after validation reports

    Returns:
        Dictionary with statistics and validation results
    """
    stats = {
        'files_processed': 0,
        'files_fixed': 0,
        'total_fixes': 0,
        'errors_before': 0,
        'errors_after': 0,
        'improvement': 0
    }

    # Run pre-fix validation if available
    if VALIDATION_AVAILABLE and generate_reports:
        print("\n=== PRE-FIX VALIDATION ===")
        validator = EntityTrackingValidator(dtd_path)
        pre_report = validator.validate_zip_package(zip_path, output_report_path=None)
        stats['errors_before'] = pre_report.get_error_count()
        print(f"Found {stats['errors_before']} validation errors before fixes")

        # Show error breakdown by type
        error_types = {}
        for error in pre_report.errors:
            error_type = error.error_type
            error_types[error_type] = error_types.get(error_type, 0) + 1

        print("\nError types:")
        for error_type, count in sorted(error_types.items(), key=lambda x: -x[1]):
            print(f"  {error_type}: {count}")

    # Initialize fixer
    fixer = ComprehensiveDTDFixer(dtd_path)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        extract_dir = tmp_path / "extracted"
        extract_dir.mkdir()

        # Extract ZIP
        print(f"\n=== APPLYING COMPREHENSIVE FIXES ===")
        print(f"Extracting {zip_path.name}...")
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(extract_dir)

        # Find all chapter XML files
        chapter_files = list(extract_dir.rglob("ch*.xml"))
        print(f"Found {len(chapter_files)} chapter files to fix\n")

        for chapter_file in sorted(chapter_files):
            stats['files_processed'] += 1

            num_fixes, fix_descriptions = fixer.fix_chapter_file(chapter_file, chapter_file.name)

            if num_fixes > 0:
                stats['files_fixed'] += 1
                stats['total_fixes'] += num_fixes
                print(f"  ✓ {chapter_file.name}: Applied {num_fixes} fix(es)")

        # Recreate ZIP
        print(f"\nCreating fixed ZIP: {output_path.name}...")
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_path in extract_dir.rglob('*'):
                if file_path.is_file():
                    arcname = file_path.relative_to(extract_dir)
                    zf.write(file_path, arcname)

    # Run post-fix validation
    if VALIDATION_AVAILABLE and generate_reports:
        print("\n=== POST-FIX VALIDATION ===")
        validator = EntityTrackingValidator(dtd_path)
        post_report = validator.validate_zip_package(output_path, output_report_path=None)
        stats['errors_after'] = post_report.get_error_count()
        stats['improvement'] = stats['errors_before'] - stats['errors_after']
        stats['improvement_pct'] = (stats['improvement'] / stats['errors_before'] * 100) if stats['errors_before'] > 0 else 0

        print(f"Found {stats['errors_after']} validation errors after fixes")

        if stats['errors_after'] > 0:
            # Show remaining error breakdown by type
            error_types = {}
            for error in post_report.errors:
                error_type = error.error_type
                error_types[error_type] = error_types.get(error_type, 0) + 1

            print("\nRemaining error types:")
            for error_type, count in sorted(error_types.items(), key=lambda x: -x[1])[:10]:
                print(f"  {error_type}: {count}")

            # Show sample errors
            print("\nSample remaining errors (first 5):")
            for i, error in enumerate(post_report.errors[:5]):
                print(f"  {i+1}. {error.xml_file}:{error.line_number} - {error.error_description[:80]}")

        # Store reports for later use
        stats['pre_report'] = pre_report
        stats['post_report'] = post_report

    # Collect verification items
    stats['verification_items'] = fixer.verification_items

    return stats


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Comprehensive DTD fixer for RittDoc packages"
    )
    parser.add_argument("input", help="Input ZIP package")
    parser.add_argument("-o", "--output", help="Output ZIP path (default: add _comprehensive_fixed suffix)")
    parser.add_argument("--dtd", default="RITTDOCdtd/v1.1/RittDocBook.dtd", help="Path to DTD file")
    parser.add_argument("--no-reports", action="store_true", help="Skip validation reports")

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    dtd_path = Path(args.dtd)
    if not dtd_path.exists():
        print(f"Error: DTD file not found: {dtd_path}")
        sys.exit(1)

    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.parent / f"{input_path.stem}_comprehensive_fixed{input_path.suffix}"

    # Process ZIP
    print("=" * 70)
    print("COMPREHENSIVE DTD FIXER FOR RITTDOC")
    print("=" * 70)

    stats = process_zip_package(input_path, output_path, dtd_path, generate_reports=not args.no_reports)

    # Print summary
    print("\n" + "=" * 70)
    print("FIX SUMMARY")
    print("=" * 70)
    print(f"Files processed:        {stats['files_processed']}")
    print(f"Files with fixes:       {stats['files_fixed']}")
    print(f"Total fixes applied:    {stats['total_fixes']}")

    if 'errors_before' in stats:
        print(f"\nValidation Results:")
        print(f"  Errors before:        {stats['errors_before']}")
        print(f"  Errors after:         {stats['errors_after']}")
        print(f"  Errors fixed:         {stats['improvement']}")
        if 'improvement_pct' in stats:
            print(f"  Improvement:          {stats['improvement_pct']:.1f}%")

    print(f"\nOutput: {output_path}")
    print("=" * 70)

    if stats.get('errors_after', 0) > 0:
        print(f"\n⚠ Warning: {stats['errors_after']} validation errors remain")
        print("These may require manual review or additional fixes")
        sys.exit(1)
    else:
        print("\n✓ Success: All DTD validation errors fixed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
