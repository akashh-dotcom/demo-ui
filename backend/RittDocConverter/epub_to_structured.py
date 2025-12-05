#!/usr/bin/env python3
"""
Convert ePub files directly to structured.xml (DocBook format).

This module reads ePub files (EPUB2/EPUB3) and converts them to the
RittDoc structured.xml format, ready for packaging by package.py.

Unlike PDF processing, ePub files already contain:
- Hierarchical structure (chapters, sections via <h1>-<h6>)
- Reading order (spine in content.opf)
- Extracted images with references
- Metadata (title, author, ISBN, publisher)

This allows us to skip the font analysis, reading order detection,
and media extraction steps used in the PDF pipeline.
"""

import argparse
import os
import re
import sys
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup, NavigableString, Tag
from lxml import etree

# Optional SVG support
try:
    import cairosvg
    HAS_CAIROSVG = True
except ImportError:
    HAS_CAIROSVG = False
    print("Warning: cairosvg not available. SVG images will be skipped.", file=sys.stderr)
    print("Install with: pip install cairosvg", file=sys.stderr)


def extract_metadata(book: epub.EpubBook) -> etree.Element:
    """
    Extract ePub metadata and convert to RittDoc <bookinfo> element.

    Args:
        book: EpubBook instance

    Returns:
        lxml Element representing <bookinfo>
    """
    bookinfo = etree.Element('bookinfo')

    # ISBN - look for identifier with 'isbn' or numeric value
    identifiers = book.get_metadata('DC', 'identifier')
    isbn_found = False
    for identifier_tuple in identifiers:
        identifier_value = identifier_tuple[0]
        # Clean ISBN from various formats: urn:isbn:123, isbn:123, or plain 123
        isbn_clean = re.sub(r'^(urn:)?isbn:', '', identifier_value, flags=re.IGNORECASE)
        # Check if it looks like an ISBN (contains digits)
        if re.search(r'\d', isbn_clean):
            isbn_elem = etree.SubElement(bookinfo, 'isbn')
            isbn_elem.text = isbn_clean.strip()
            isbn_found = True
            break

    if not isbn_found:
        # Use a generic identifier if no ISBN found
        isbn_elem = etree.SubElement(bookinfo, 'isbn')
        isbn_elem.text = 'UNKNOWN'

    # Title
    titles = book.get_metadata('DC', 'title')
    if titles:
        title_elem = etree.SubElement(bookinfo, 'title')
        title_elem.text = titles[0][0]

    # Subtitle (if available)
    # Some ePubs use dcterms:subtitle or have it in metadata
    try:
        subtitles = book.get_metadata('DC', 'subtitle')
        if subtitles:
            subtitle_elem = etree.SubElement(bookinfo, 'subtitle')
            subtitle_elem.text = subtitles[0][0]
    except:
        pass

    # Author(s)
    creators = book.get_metadata('DC', 'creator')
    if creators:
        authorgroup = etree.SubElement(bookinfo, 'authorgroup')
        for creator_tuple in creators:
            author_elem = etree.SubElement(authorgroup, 'author')
            personname = etree.SubElement(author_elem, 'personname')

            # Parse name: "FirstName LastName" or "LastName, FirstName"
            name = creator_tuple[0].strip()
            if ', ' in name:
                last, first = name.split(', ', 1)
            else:
                parts = name.rsplit(' ', 1)
                first = parts[0] if len(parts) > 1 else ''
                last = parts[-1] if len(parts) > 0 else name

            if first:
                firstname = etree.SubElement(personname, 'firstname')
                firstname.text = first.strip()
            if last:
                surname = etree.SubElement(personname, 'surname')
                surname.text = last.strip()

    # Publisher
    publishers = book.get_metadata('DC', 'publisher')
    if publishers:
        publisher = etree.SubElement(bookinfo, 'publisher')
        publishername = etree.SubElement(publisher, 'publishername')
        publishername.text = publishers[0][0]

    # Publication date
    dates = book.get_metadata('DC', 'date')
    if dates:
        pubdate = etree.SubElement(bookinfo, 'pubdate')
        date_str = dates[0][0]
        # Extract year from various date formats (2024, 2024-01-01, etc.)
        year_match = re.search(r'\d{4}', date_str)
        if year_match:
            pubdate.text = year_match.group(0)
        else:
            pubdate.text = date_str

    # Language
    languages = book.get_metadata('DC', 'language')
    if languages:
        language_elem = etree.SubElement(bookinfo, 'language')
        language_elem.text = languages[0][0]

    # Copyright/Rights
    rights = book.get_metadata('DC', 'rights')
    if rights:
        copyright_elem = etree.SubElement(bookinfo, 'copyright')
        # Try to extract year from rights statement
        rights_text = rights[0][0]
        year_match = re.search(r'\d{4}', rights_text)
        if year_match:
            year_elem = etree.SubElement(copyright_elem, 'year')
            year_elem.text = year_match.group(0)
        holder_elem = etree.SubElement(copyright_elem, 'holder')
        holder_elem.text = rights_text

    return bookinfo


def extract_images(book: epub.EpubBook, output_dir: Path) -> Dict[str, str]:
    """
    Extract images from ePub to temporary directory and create path mapping.
    Converts SVG to PNG if cairosvg is available.

    Args:
        book: EpubBook instance
        output_dir: Directory to extract images to

    Returns:
        Dictionary mapping original ePub paths to extracted file paths
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    image_map = {}

    # Get all items with image media types (including cover images)
    # ebooklib.ITEM_IMAGE doesn't include cover images, so we need to check all items
    images = []
    for item in book.get_items():
        if hasattr(item, 'media_type') and item.media_type and 'image' in item.media_type.lower():
            images.append(item)

    for idx, img_item in enumerate(images):
        original_path = img_item.get_name()  # e.g., "OEBPS/images/fig01.png"

        # Determine file extension
        ext = Path(original_path).suffix.lower()
        content = img_item.get_content()

        # Handle SVG conversion to PNG
        if ext == '.svg':
            if HAS_CAIROSVG:
                try:
                    print(f"  Converting SVG to PNG: {original_path}", file=sys.stderr)
                    # Convert SVG to PNG with cairosvg
                    png_data = cairosvg.svg2png(bytestring=content, output_width=1200, dpi=96)
                    temp_name = f"img_{idx:04d}.png"
                    temp_path = output_dir / temp_name

                    with open(temp_path, 'wb') as f:
                        f.write(png_data)

                    image_map[original_path] = str(temp_path)
                    print(f"    ✓ Converted: {original_path} → {temp_name}", file=sys.stderr)
                except Exception as e:
                    print(f"Warning: Failed to convert SVG {original_path}: {e}", file=sys.stderr)
                    print(f"  SVG will be skipped.", file=sys.stderr)
            else:
                print(f"Warning: Skipping SVG {original_path} (cairosvg not available)", file=sys.stderr)
            continue

        # Validate extension
        if not ext or ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
            ext = '.jpg'  # Default fallback

        # Create temporary name (will be renamed by package.py to Ch0001f01.jpg format)
        temp_name = f"img_{idx:04d}{ext}"
        temp_path = output_dir / temp_name

        # Write image content
        try:
            with open(temp_path, 'wb') as f:
                f.write(content)
            image_map[original_path] = str(temp_path)
        except Exception as e:
            print(f"Warning: Failed to extract image {original_path}: {e}", file=sys.stderr)

    print(f"  Image map has {len(image_map)} entries", file=sys.stderr)
    for orig, extracted in list(image_map.items())[:5]:
        print(f"    {orig} → {extracted}", file=sys.stderr)

    return image_map


def build_link_map(book: epub.EpubBook, documents: List) -> Dict[str, str]:
    """
    Build a mapping from ePub document paths to chapter identifiers.
    This is used to convert internal ePub links to proper RittDoc chapter references.

    Args:
        book: EpubBook instance
        documents: List of document items from the ePub

    Returns:
        Dictionary mapping ePub doc paths to chapter IDs (e.g., "xhtml/ch01.xhtml" -> "ch0001")
    """
    link_map = {}

    # Map each document to its chapter number
    # We'll use the index in the spine/documents list as the chapter number (starting from ch0001)
    for idx, doc_item in enumerate(documents):
        doc_name = doc_item.get_name()  # e.g., "OEBPS/xhtml/chapter01.xhtml"
        chapter_id = f"ch{idx+1:04d}"  # e.g., "ch0001" (changed from idx to idx+1 for consistency with v2)

        # Store multiple variations for flexible matching
        link_map[doc_name] = chapter_id

        # Also store without OEBPS/ prefix
        if doc_name.startswith('OEBPS/'):
            link_map[doc_name[6:]] = chapter_id

        # Store basename only
        basename = os.path.basename(doc_name)
        link_map[basename] = chapter_id

        # Store with various path variations
        parts = doc_name.split('/')
        for i in range(len(parts)):
            partial_path = '/'.join(parts[i:])
            link_map[partial_path] = chapter_id

    return link_map


def resolve_internal_link(href: str, current_doc_path: str, link_map: Dict[str, str]) -> Optional[str]:
    """
    Resolve an internal ePub link to a RittDoc chapter reference.

    Args:
        href: Link href from <a> tag (e.g., "chapter02.xhtml", "../intro.xhtml", "#section-2")
        current_doc_path: Path of current document
        link_map: Mapping of ePub paths to chapter IDs

    Returns:
        Resolved link (e.g., "ch0002.xml", "ch0000.xml#section-2") or None if external link
    """
    # External links - return None to indicate they should stay as ulink
    if href.startswith(('http://', 'https://', 'mailto:', 'ftp://', 'tel:')):
        return None

    # Empty or just fragment
    if not href or href.startswith('#'):
        # Fragment-only link (same document)
        # Try to find current document's chapter
        current_doc_base = os.path.basename(current_doc_path)
        if current_doc_base in link_map:
            chapter_id = link_map[current_doc_base]
            if href:
                return f"{chapter_id}.xml{href}"  # e.g., "ch0001.xml#section-2"
            return None  # Just "#anchor" - DocBook will handle internally
        return None

    # Split href into path and fragment
    if '#' in href:
        link_path, fragment = href.split('#', 1)
        fragment = '#' + fragment
    else:
        link_path = href
        fragment = ''

    # Resolve relative path from current document
    if link_path.startswith('../') or link_path.startswith('./'):
        current_doc_dir = os.path.dirname(current_doc_path)
        resolved_path = os.path.normpath(os.path.join(current_doc_dir, link_path))
        resolved_path = resolved_path.replace('\\', '/')
    else:
        resolved_path = link_path

    # Look up in link map (try various forms)
    chapter_id = None

    # Try exact match
    if resolved_path in link_map:
        chapter_id = link_map[resolved_path]
    else:
        # Try basename only
        basename = os.path.basename(resolved_path)
        if basename in link_map:
            chapter_id = link_map[basename]
        else:
            # Try case-insensitive match
            resolved_lower = resolved_path.lower()
            for epub_path, ch_id in link_map.items():
                if epub_path.lower() == resolved_lower:
                    chapter_id = ch_id
                    break

            # Try endswith match
            if not chapter_id:
                for epub_path, ch_id in link_map.items():
                    if epub_path.endswith(link_path) or link_path.endswith(epub_path):
                        chapter_id = ch_id
                        break

    if chapter_id:
        # Return chapter reference with fragment if present
        return f"{chapter_id}.xml{fragment}"

    # Could not resolve - might be external resource or broken link
    return None


def resolve_image_path(img_src: str, current_doc_path: str, image_map: Dict[str, str]) -> Optional[str]:
    """
    Resolve relative image path from XHTML to actual extracted image path.

    Args:
        img_src: Image src attribute from XHTML (e.g., "../images/fig01.png")
        current_doc_path: Path of current XHTML document (e.g., "OEBPS/xhtml/chapter01.xhtml")
        image_map: Mapping of ePub paths to extracted paths

    Returns:
        Resolved image path or None if not found
    """
    # If img_src is already in image_map (absolute path in ePub), return it
    if img_src in image_map:
        return image_map[img_src]

    # Get the directory of the current document
    doc_dir = os.path.dirname(current_doc_path)

    # Resolve the relative path to absolute path within ePub structure
    # Join the document directory with the image source path
    combined_path = os.path.join(doc_dir, img_src)

    # Normalize the path to resolve .. and . components
    resolved = os.path.normpath(combined_path)

    # Convert backslashes to forward slashes for consistency
    resolved = resolved.replace('\\', '/')

    # Look up in image map
    if resolved in image_map:
        return image_map[resolved]

    # Try variations (sometimes paths don't match exactly)
    # Case-insensitive matching and filename matching
    resolved_lower = resolved.lower()
    img_src_lower = img_src.lower()
    img_filename = os.path.basename(img_src).lower()

    for epub_path, extracted_path in image_map.items():
        epub_path_lower = epub_path.lower()

        # Exact match (case-insensitive)
        if epub_path_lower == resolved_lower:
            return extracted_path

        # Path ends with the source path
        if epub_path_lower.endswith(img_src_lower):
            return extracted_path

        # Filename match (last resort)
        if os.path.basename(epub_path).lower() == img_filename:
            return extracted_path

    # Debug: print what we're looking for
    print(f"Warning: Could not resolve image path:", file=sys.stderr)
    print(f"  Source: {img_src}", file=sys.stderr)
    print(f"  Document: {current_doc_path}", file=sys.stderr)
    print(f"  Resolved to: {resolved}", file=sys.stderr)
    print(f"  Available paths in image_map:", file=sys.stderr)
    for key in list(image_map.keys())[:5]:
        print(f"    - {key}", file=sys.stderr)

    return None


def convert_table_to_cals(
    table_elem: Tag,
    parent: etree.Element,
    doc_path: str,
    image_map: Dict[str, str],
    image_counter: Dict[str, int]
) -> None:
    """
    Convert HTML table to DocBook CALS table format.
    Supports colspan, rowspan, and preserves cell formatting.

    Args:
        table_elem: HTML table element
        parent: Parent element to append table to
        doc_path: Current document path
        image_map: Image path mapping
        image_counter: Image counter
    """
    table = etree.SubElement(parent, 'table')

    # Extract caption if present
    caption = table_elem.find('caption')
    if caption:
        title = etree.SubElement(table, 'title')
        title.text = caption.get_text().strip()

    # Count maximum columns (considering colspan)
    max_cols = 0
    all_rows = table_elem.find_all('tr')
    for tr in all_rows:
        col_count = 0
        for cell in tr.find_all(['td', 'th']):
            colspan = int(cell.get('colspan', 1))
            col_count += colspan
        max_cols = max(max_cols, col_count)

    if max_cols == 0:
        # Empty table
        return

    # Create tgroup
    tgroup = etree.SubElement(table, 'tgroup')
    tgroup.set('cols', str(max_cols))

    # Generate colspec elements
    for i in range(max_cols):
        colspec = etree.SubElement(tgroup, 'colspec')
        colspec.set('colname', f'col{i+1}')
        colspec.set('colwidth', '1*')  # Equal width by default

    # Helper function to process rows
    def process_rows(rows, section_elem):
        for tr in rows:
            row = etree.SubElement(section_elem, 'row')
            col_idx = 1

            for cell in tr.find_all(['td', 'th'], recursive=False):
                entry = etree.SubElement(row, 'entry')

                # Handle colspan
                colspan = int(cell.get('colspan', 1))
                if colspan > 1:
                    entry.set('namest', f'col{col_idx}')
                    entry.set('nameend', f'col{col_idx + colspan - 1}')

                # Handle rowspan
                rowspan = int(cell.get('rowspan', 1))
                if rowspan > 1:
                    entry.set('morerows', str(rowspan - 1))

                # Handle alignment
                align = cell.get('align')
                if align in ['left', 'center', 'right', 'justify']:
                    entry.set('align', align)

                # Handle valign
                valign = cell.get('valign')
                if valign in ['top', 'middle', 'bottom']:
                    entry.set('valign', valign)

                # Convert cell content (preserve formatting!)
                # Check if cell has block-level elements
                has_block = any(c.name in ['p', 'div', 'ul', 'ol', 'blockquote', 'pre']
                               for c in cell.children if isinstance(c, Tag))

                if has_block:
                    # Cell contains block elements, convert them directly
                    for child in cell.children:
                        if isinstance(child, Tag):
                            convert_element_to_docbook(child, entry, doc_path, image_map, image_counter)
                        elif isinstance(child, NavigableString):
                            text = str(child).strip()
                            if text:
                                # Add text to last child or create para
                                if len(entry) > 0:
                                    last = entry[-1]
                                    if last.tail:
                                        last.tail += text
                                    else:
                                        last.tail = text
                                else:
                                    para = etree.SubElement(entry, 'para')
                                    para.text = text
                else:
                    # Cell contains only inline content, wrap in para
                    para = etree.SubElement(entry, 'para')
                    # Process inline content with formatting
                    for child in cell.children:
                        if isinstance(child, NavigableString):
                            text = str(child).strip()
                            if text:
                                if len(para) == 0:
                                    para.text = (para.text or '') + text
                                else:
                                    last = para[-1]
                                    last.tail = (last.tail or '') + text
                        elif isinstance(child, Tag):
                            # Convert inline elements like em, strong, code, a, etc.
                            if child.name in ['em', 'i']:
                                emphasis = etree.SubElement(para, 'emphasis')
                                emphasis.text = child.get_text()
                            elif child.name in ['strong', 'b']:
                                emphasis = etree.SubElement(para, 'emphasis')
                                emphasis.set('role', 'bold')
                                emphasis.text = child.get_text()
                            elif child.name in ['code', 'tt']:
                                code = etree.SubElement(para, 'code')
                                code.text = child.get_text()
                            elif child.name == 'a':
                                ulink = etree.SubElement(para, 'ulink')
                                ulink.set('url', child.get('href', ''))
                                ulink.text = child.get_text()
                            elif child.name == 'br':
                                # Add newline
                                if len(para) > 0:
                                    last = para[-1]
                                    last.tail = (last.tail or '') + '\n'
                                else:
                                    para.text = (para.text or '') + '\n'
                            else:
                                # Other inline elements, just extract text
                                text = child.get_text()
                                if len(para) > 0:
                                    last = para[-1]
                                    last.tail = (last.tail or '') + text
                                else:
                                    para.text = (para.text or '') + text

                col_idx += colspan

    # Process thead
    thead_html = table_elem.find('thead')
    if thead_html:
        thead = etree.SubElement(tgroup, 'thead')
        thead_rows = thead_html.find_all('tr', recursive=False)
        process_rows(thead_rows, thead)

    # Process tbody
    tbody_html = table_elem.find('tbody')
    if tbody_html:
        tbody_rows = tbody_html.find_all('tr', recursive=False)
    else:
        # No tbody, get all tr elements not in thead
        tbody_rows = [tr for tr in table_elem.find_all('tr', recursive=False)
                      if thead_html is None or tr not in thead_html.find_all('tr')]

    if tbody_rows:
        tbody = etree.SubElement(tgroup, 'tbody')
        process_rows(tbody_rows, tbody)


def convert_element_to_docbook(
    element: Tag,
    parent: etree.Element,
    doc_path: str,
    image_map: Dict[str, str],
    image_counter: Dict[str, int]
) -> None:
    """
    Recursively convert HTML element to DocBook elements.

    Args:
        element: BeautifulSoup Tag to convert
        parent: Parent lxml Element to append to
        doc_path: Current document path (for image resolution)
        image_map: Mapping of ePub image paths to extracted paths
        image_counter: Counter for image numbering (mutable dict)
    """
    if isinstance(element, NavigableString):
        # Text node
        text = str(element).strip()
        if text:
            if len(parent) == 0 and parent.text is None:
                parent.text = (parent.text or '') + text
            else:
                # Append to tail of last child
                if len(parent) > 0:
                    last_child = parent[-1]
                    last_child.tail = (last_child.tail or '') + text
                else:
                    parent.text = (parent.text or '') + text
        return

    if not isinstance(element, Tag):
        return

    tag_name = element.name.lower()

    # Paragraph
    if tag_name == 'p':
        para = etree.SubElement(parent, 'para')
        convert_children(element, para, doc_path, image_map, image_counter)

    # Headings are handled separately in build_hierarchy
    elif tag_name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
        # Skip - these are processed by build_hierarchy
        pass

    # Lists - IMPORTANT: Keep as proper list structures, not para!
    elif tag_name == 'ul':
        itemizedlist = etree.SubElement(parent, 'itemizedlist')
        for child in element.children:
            if isinstance(child, Tag) and child.name == 'li':
                listitem = etree.SubElement(itemizedlist, 'listitem')
                # Check if li contains block elements or just inline content
                has_block = any(isinstance(c, Tag) and c.name in ['p', 'div', 'ul', 'ol'] for c in child.children)
                if has_block:
                    # Li contains block elements, convert them directly
                    convert_children(child, listitem, doc_path, image_map, image_counter)
                else:
                    # Li contains only inline content, wrap in para
                    li_para = etree.SubElement(listitem, 'para')
                    convert_children(child, li_para, doc_path, image_map, image_counter)

    elif tag_name == 'ol':
        orderedlist = etree.SubElement(parent, 'orderedlist')
        for child in element.children:
            if isinstance(child, Tag) and child.name == 'li':
                listitem = etree.SubElement(orderedlist, 'listitem')
                # Check if li contains block elements
                has_block = any(isinstance(c, Tag) and c.name in ['p', 'div', 'ul', 'ol'] for c in child.children)
                if has_block:
                    convert_children(child, listitem, doc_path, image_map, image_counter)
                else:
                    li_para = etree.SubElement(listitem, 'para')
                    convert_children(child, li_para, doc_path, image_map, image_counter)

    # Figure with image
    elif tag_name == 'figure':
        figure = etree.SubElement(parent, 'figure')

        # Look for figcaption as title
        figcaption = element.find('figcaption')
        if figcaption:
            title = etree.SubElement(figure, 'title')
            title.text = figcaption.get_text().strip()

        # Find img element
        img = element.find('img')
        if img and img.get('src'):
            mediaobject = etree.SubElement(figure, 'mediaobject')
            imageobject = etree.SubElement(mediaobject, 'imageobject')
            imagedata = etree.SubElement(imageobject, 'imagedata')

            # Resolve image path
            img_src = img.get('src')
            resolved_path = resolve_image_path(img_src, doc_path, image_map)
            if resolved_path:
                # Extract just the filename without folder path
                imagedata.set('fileref', Path(resolved_path).name)
            else:
                # Fallback to original, but extract filename only
                imagedata.set('fileref', Path(img_src).name if img_src else img_src)

            # Alt text
            alt_text = img.get('alt', '')
            if alt_text:
                textobject = etree.SubElement(mediaobject, 'textobject')
                phrase = etree.SubElement(textobject, 'phrase')
                phrase.text = alt_text

        # Caption (if separate from title)
        if figcaption:
            caption = etree.SubElement(figure, 'caption')
            caption_para = etree.SubElement(caption, 'para')
            caption_para.text = figcaption.get_text().strip()

    # Standalone image (not in figure)
    elif tag_name == 'img':
        # Wrap in figure/mediaobject
        figure = etree.SubElement(parent, 'figure')

        # Add title from alt text so package.py recognizes it as content image
        alt_text = element.get('alt', '')
        if alt_text:
            title = etree.SubElement(figure, 'title')
            title.text = alt_text

        mediaobject = etree.SubElement(figure, 'mediaobject')
        imageobject = etree.SubElement(mediaobject, 'imageobject')
        imagedata = etree.SubElement(imageobject, 'imagedata')

        img_src = element.get('src')
        resolved_path = resolve_image_path(img_src, doc_path, image_map)
        if resolved_path:
            # Extract just the filename without folder path
            imagedata.set('fileref', Path(resolved_path).name)
        else:
            # Fallback to original, but extract filename only
            imagedata.set('fileref', Path(img_src).name if img_src else img_src)

        if alt_text:
            textobject = etree.SubElement(mediaobject, 'textobject')
            phrase = etree.SubElement(textobject, 'phrase')
            phrase.text = alt_text

    # Emphasis
    elif tag_name in ['em', 'i']:
        emphasis = etree.SubElement(parent, 'emphasis')
        convert_children(element, emphasis, doc_path, image_map, image_counter)

    elif tag_name in ['strong', 'b']:
        emphasis = etree.SubElement(parent, 'emphasis')
        emphasis.set('role', 'bold')
        convert_children(element, emphasis, doc_path, image_map, image_counter)

    # Code
    elif tag_name in ['code', 'tt']:
        code = etree.SubElement(parent, 'code')
        convert_children(element, code, doc_path, image_map, image_counter)

    elif tag_name == 'pre':
        programlisting = etree.SubElement(parent, 'programlisting')
        programlisting.text = element.get_text()

    # Blockquote
    elif tag_name == 'blockquote':
        blockquote_elem = etree.SubElement(parent, 'blockquote')
        blockquote_para = etree.SubElement(blockquote_elem, 'para')
        convert_children(element, blockquote_para, doc_path, image_map, image_counter)

    # Div, section, article - transparent containers
    elif tag_name in ['div', 'section', 'article', 'aside']:
        # Check for epub:type attribute for semantic info
        epub_type = element.get('epub:type') or element.get('data-type')

        # Skip if it's a heading section (will be processed by build_hierarchy)
        # Otherwise, process children
        convert_children(element, parent, doc_path, image_map, image_counter)

    # Span - usually styling, process children
    elif tag_name == 'span':
        convert_children(element, parent, doc_path, image_map, image_counter)

    # Line break
    elif tag_name == 'br':
        # Insert newline in text
        if len(parent) > 0:
            last_child = parent[-1]
            last_child.tail = (last_child.tail or '') + '\n'
        else:
            parent.text = (parent.text or '') + '\n'

    # Links - resolve internal ePub links to chapter references
    elif tag_name == 'a':
        href = element.get('href', '')

        if href:
            # Try to resolve as internal link
            resolved_link = resolve_internal_link(href, doc_path, image_counter.get('link_map', {}))

            if resolved_link:
                # Internal link - convert to ulink with resolved chapter reference
                ulink = etree.SubElement(parent, 'ulink')
                ulink.set('url', resolved_link)
                convert_children(element, ulink, doc_path, image_map, image_counter)
            elif href.startswith(('http://', 'https://', 'mailto:', 'ftp://', 'tel:')):
                # External link - keep as ulink with original URL
                ulink = etree.SubElement(parent, 'ulink')
                ulink.set('url', href)
                convert_children(element, ulink, doc_path, image_map, image_counter)
            else:
                # Could not resolve - output as plain text to avoid broken links
                link_text = element.get_text().strip()
                if link_text:
                    if len(parent) == 0:
                        parent.text = (parent.text or '') + link_text
                    else:
                        last_child = parent[-1]
                        last_child.tail = (last_child.tail or '') + link_text
                # Optionally add a note about the unresolved link
                print(f"  Warning: Could not resolve link: {href} in {doc_path}", file=sys.stderr)
        else:
            # No href - just output the text
            link_text = element.get_text().strip()
            if link_text:
                if len(parent) == 0:
                    parent.text = (parent.text or '') + link_text
                else:
                    last_child = parent[-1]
                    last_child.tail = (last_child.tail or '') + link_text

    # Table - CALS format with full colspan/rowspan support
    elif tag_name == 'table':
        convert_table_to_cals(element, parent, doc_path, image_map, image_counter)

    # Fallback: process children for unknown elements
    else:
        convert_children(element, parent, doc_path, image_map, image_counter)


def convert_children(
    element: Tag,
    parent: etree.Element,
    doc_path: str,
    image_map: Dict[str, str],
    image_counter: Dict[str, int]
) -> None:
    """Convert all children of an HTML element."""
    for child in element.children:
        convert_element_to_docbook(child, parent, doc_path, image_map, image_counter)


def build_hierarchy(soup: BeautifulSoup, doc_path: str, image_map: Dict[str, str], link_map: Dict[str, str]) -> List[etree.Element]:
    """
    Build DocBook chapter/section hierarchy from flat HTML heading structure.

    Converts:
        <h1>Chapter 1</h1>
        <p>Para 1</p>
        <h2>Section 1.1</h2>
        <p>Para 2</p>

    To:
        <chapter>
          <title>Chapter 1</title>
          <para>Para 1</para>
          <section>
            <title>Section 1.1</title>
            <para>Para 2</para>
          </section>
        </chapter>

    Args:
        soup: BeautifulSoup parsed HTML
        doc_path: Document path for image resolution
        image_map: Image path mapping

    Returns:
        List of chapter elements
    """
    # Find body or use entire soup
    body = soup.find('body') or soup

    # Get all elements in order
    elements = []
    for elem in body.descendants:
        if isinstance(elem, Tag) and elem.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'figure', 'ul', 'ol', 'blockquote', 'pre', 'table', 'img']:
            # Only add if it's a direct structural element, not nested inside another
            if not any(p.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] for p in elem.parents if isinstance(p, Tag)):
                elements.append(elem)

    chapters = []
    current_chapter = None
    section_stack = []  # Stack of (level, section_element)
    image_counter = {'count': 0, 'link_map': link_map}

    for elem in elements:
        if elem.name and elem.name.startswith('h'):
            level = int(elem.name[1])
            title_text = elem.get_text().strip()

            if not title_text:
                continue

            # H1 starts a new chapter
            if level == 1:
                if current_chapter is not None:
                    chapters.append(current_chapter)

                current_chapter = etree.Element('chapter')
                title_elem = etree.SubElement(current_chapter, 'title')
                title_elem.text = title_text
                section_stack = []

            # H2+ creates sections
            elif level >= 2 and current_chapter is not None:
                # Close sections at same or deeper level
                while section_stack and section_stack[-1][0] >= level:
                    section_stack.pop()

                # Create new section
                section = etree.Element('section')
                title_elem = etree.SubElement(section, 'title')
                title_elem.text = title_text

                # Add to parent (chapter or parent section)
                if section_stack:
                    parent_section = section_stack[-1][1]
                    parent_section.append(section)
                else:
                    current_chapter.append(section)

                section_stack.append((level, section))

            # If we have a heading but no chapter yet, create one
            elif level >= 2 and current_chapter is None:
                current_chapter = etree.Element('chapter')
                title_elem = etree.SubElement(current_chapter, 'title')
                title_elem.text = 'Untitled'

                section = etree.Element('section')
                section_title = etree.SubElement(section, 'title')
                section_title.text = title_text
                current_chapter.append(section)
                section_stack = [(level, section)]

        else:
            # Content element (p, figure, list, etc.)
            # Add to current section or chapter
            if current_chapter is None:
                # Create a default chapter if we have content but no chapter yet
                current_chapter = etree.Element('chapter')
                title_elem = etree.SubElement(current_chapter, 'title')
                title_elem.text = 'Untitled'

            if section_stack:
                parent = section_stack[-1][1]
            else:
                parent = current_chapter

            convert_element_to_docbook(elem, parent, doc_path, image_map, image_counter)

    # Add last chapter
    if current_chapter is not None:
        chapters.append(current_chapter)

    return chapters


def convert_epub_to_structured(epub_path: Path, output_xml: Path, temp_dir: Path) -> None:
    """
    Main conversion function: ePub → structured.xml

    Args:
        epub_path: Path to input .epub file
        output_xml: Path to output structured.xml
        temp_dir: Temporary directory for extracted images
    """
    print(f"Reading ePub: {epub_path}")
    book = epub.read_epub(str(epub_path))

    # Extract metadata
    print("Extracting metadata...")
    bookinfo = extract_metadata(book)

    # Extract images
    print("Extracting images...")
    images_dir = temp_dir / "multimedia"
    image_map = extract_images(book, images_dir)
    print(f"  Extracted {len(image_map)} images")

    # Get all document items in spine order (reading order)
    print("Processing chapters...")
    documents = []
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        documents.append(item)

    print(f"  Found {len(documents)} document(s)")

    # Build link map for internal link resolution
    print("Building link map for internal link resolution...")
    link_map = build_link_map(book, documents)
    print(f"  Link map has {len(link_map)} entries")

    # Build DocBook structure
    root = etree.Element('book')
    root.append(bookinfo)

    # Process each document
    all_chapters = []
    for idx, doc_item in enumerate(documents):
        doc_path = doc_item.get_name()
        content = doc_item.get_content()

        # Parse HTML
        soup = BeautifulSoup(content, 'html.parser')

        # Build chapter hierarchy from this document
        chapters = build_hierarchy(soup, doc_path, image_map, link_map)
        all_chapters.extend(chapters)

    # Add all chapters to book
    for chapter in all_chapters:
        root.append(chapter)

    # If no chapters were created, create a default one
    if len(all_chapters) == 0:
        print("Warning: No chapters found, creating default chapter")
        default_chapter = etree.SubElement(root, 'chapter')
        default_title = etree.SubElement(default_chapter, 'title')
        default_title.text = 'Content'

    print(f"  Created {len(all_chapters)} chapter(s)")

    # Write structured.xml
    print(f"Writing structured.xml to {output_xml}")
    tree = etree.ElementTree(root)
    tree.write(
        str(output_xml),
        encoding='utf-8',
        xml_declaration=True,
        pretty_print=True
    )

    print("ePub conversion complete!")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert ePub file to RittDoc structured.xml format"
    )
    parser.add_argument('epub', help='Input ePub file path')
    parser.add_argument('output', help='Output structured.xml path')
    parser.add_argument(
        '--temp-dir',
        help='Temporary directory for extracted images (default: ./temp_epub)',
        default='./temp_epub'
    )

    args = parser.parse_args()

    epub_path = Path(args.epub).resolve()
    if not epub_path.exists():
        parser.error(f"ePub file not found: {epub_path}")

    output_xml = Path(args.output).resolve()
    output_xml.parent.mkdir(parents=True, exist_ok=True)

    temp_dir = Path(args.temp_dir).resolve()

    try:
        convert_epub_to_structured(epub_path, output_xml, temp_dir)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
