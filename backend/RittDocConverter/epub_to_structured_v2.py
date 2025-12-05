#!/usr/bin/env python3
"""
ePub to Structured XML Converter (Version 2)

New architecture that:
1. Preserves XHTML structure (one XHTML file → one chapter XML)
2. Uses persistent reference mapping for all resources
3. Respects ePub spine order and navigation structure
4. Generates Book.XML from ePub metadata and TOC
5. No heuristics - uses native ePub structure

Key differences from v1:
- No chapter breakup based on H1 tags
- Each XHTML in spine becomes one chapter
- Reference mapping tracked throughout
- Validates all references before packaging
"""

import argparse
import os
import os.path as posixpath
import re
import sys
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set
from collections import OrderedDict
import logging
import zipfile

import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup, NavigableString, Tag
from lxml import etree
from PIL import Image

# Import our reference mapper
from reference_mapper import ReferenceMapper, ResourceReference, get_mapper, reset_mapper
from conversion_tracker import ConversionTracker, ConversionStatus, ConversionType, TemplateType

# Optional SVG support
try:
    import cairosvg
    HAS_CAIROSVG = True
except ImportError:
    HAS_CAIROSVG = False
    print("Warning: cairosvg not available. SVG images will be skipped.", file=sys.stderr)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_opf_xml_from_epub(epub_path: Path) -> Optional[etree.Element]:
    """
    Extract and parse the OPF XML file from an ePub.

    Args:
        epub_path: Path to the ePub file

    Returns:
        Parsed OPF XML root element or None
    """
    try:
        with zipfile.ZipFile(epub_path, 'r') as zf:
            # Read container.xml to find OPF location
            container_xml = zf.read('META-INF/container.xml')
            container_root = etree.fromstring(container_xml)

            # Find OPF path in container
            namespaces = {'container': 'urn:oasis:names:tc:opendocument:xmlns:container'}
            rootfiles = container_root.xpath(
                '//container:rootfile[@media-type="application/oebps-package+xml"]',
                namespaces=namespaces
            )

            if not rootfiles:
                # Try without namespace
                rootfiles = container_root.xpath('//rootfile[@media-type="application/oebps-package+xml"]')

            if rootfiles:
                opf_path = rootfiles[0].get('full-path')
                if opf_path:
                    # Read OPF file
                    opf_content = zf.read(opf_path)
                    opf_root = etree.fromstring(opf_content)
                    logger.debug(f"Successfully parsed OPF XML from {opf_path}")
                    return opf_root
    except Exception as e:
        logger.debug(f"Could not extract OPF XML from ePub: {e}")

    return None


def get_metadata_value(book: epub.EpubBook, metadata_name: str, epub_path: Optional[Path] = None) -> Optional[str]:
    """
    Robustly extract metadata from ePub, supporting both EPUB 2 and EPUB 3 formats.

    EPUB 2 uses: <dc:publisher>Publisher Name</dc:publisher>
    EPUB 3 uses: <meta property="dcterms:publisher">Publisher Name</meta>

    This function tries multiple methods:
    1. Standard Dublin Core metadata (book.get_metadata('DC', ...))
    2. OPF custom metadata (book.get_metadata('OPF', ...))
    3. Direct OPF XML parsing for <meta property="..."> elements (EPUB 3)

    Args:
        book: EpubBook instance
        metadata_name: Name of metadata field (e.g., 'publisher', 'subtitle')
        epub_path: Optional path to ePub file for direct XML parsing

    Returns:
        Metadata value or None if not found
    """
    # Method 1: Try standard Dublin Core
    try:
        values = book.get_metadata('DC', metadata_name)
        if values and len(values) > 0:
            value = values[0][0]
            if value and value.strip():
                logger.debug(f"Found {metadata_name} via DC: {value}")
                return value.strip()
    except:
        pass

    # Method 2: Try OPF custom metadata
    try:
        values = book.get_metadata('OPF', metadata_name)
        if values and len(values) > 0:
            # OPF metadata can have different structures
            value = values[0][0] if values[0][0] else None
            if value and value.strip():
                logger.debug(f"Found {metadata_name} via OPF: {value}")
                return value.strip()
    except:
        pass

    # Method 3: Parse OPF XML directly for EPUB 3 meta properties
    if epub_path:
        try:
            opf_root = get_opf_xml_from_epub(epub_path)
            if opf_root is not None:
                # Define namespace mappings for EPUB 3
                namespaces = {
                    'opf': 'http://www.idpf.org/2007/opf',
                    'dc': 'http://purl.org/dc/elements/1.1/',
                }

                # Try different property name variations for EPUB 3
                property_names = [
                    f'dcterms:{metadata_name}',  # dcterms:publisher
                    f'schema:{metadata_name}',   # schema:publisher
                    metadata_name,               # publisher
                ]

                for prop_name in property_names:
                    # Look for <meta property="...">text</meta> elements
                    # Try with namespace prefix
                    meta_elements = opf_root.xpath(
                        f'//opf:meta[@property="{prop_name}"]',
                        namespaces=namespaces
                    )

                    if not meta_elements:
                        # Try without namespace prefix (some EPUBs don't use it)
                        meta_elements = opf_root.xpath(
                            f'//meta[@property="{prop_name}"]'
                        )

                    if meta_elements and meta_elements[0].text:
                        value = meta_elements[0].text.strip()
                        if value:
                            logger.info(f"Found {metadata_name} via EPUB 3 OPF XML property '{prop_name}': {value}")
                            return value
        except Exception as e:
            logger.debug(f"Could not parse OPF XML for {metadata_name}: {e}")

    logger.debug(f"Could not find metadata: {metadata_name}")
    return None


def extract_metadata(book: epub.EpubBook, epub_path: Optional[Path] = None) -> Tuple[etree.Element, Dict[str, str]]:
    """
    Extract ePub metadata and convert to RittDoc <bookinfo> element.
    Supports both EPUB 2 and EPUB 3 metadata formats.

    Args:
        book: EpubBook instance
        epub_path: Optional path to ePub file for robust EPUB 3 metadata extraction

    Returns:
        Tuple of (bookinfo Element, metadata dict for tracking)
    """
    bookinfo = etree.Element('bookinfo')
    metadata_dict = {}

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
            metadata_dict['isbn'] = isbn_clean.strip()
            isbn_found = True
            break

    if not isbn_found:
        isbn_elem = etree.SubElement(bookinfo, 'isbn')
        isbn_elem.text = 'UNKNOWN'
        metadata_dict['isbn'] = 'UNKNOWN'

    # Title
    titles = book.get_metadata('DC', 'title')
    if titles:
        title_elem = etree.SubElement(bookinfo, 'title')
        title_elem.text = titles[0][0]
        metadata_dict['title'] = titles[0][0]

    # Subtitle (try robust extraction for EPUB 2 and EPUB 3)
    subtitle = get_metadata_value(book, 'subtitle', epub_path)
    if subtitle:
        subtitle_elem = etree.SubElement(bookinfo, 'subtitle')
        subtitle_elem.text = subtitle
        metadata_dict['subtitle'] = subtitle

    # Author(s)
    creators = book.get_metadata('DC', 'creator')
    authors = []
    if creators:
        authorgroup = etree.SubElement(bookinfo, 'authorgroup')
        for creator_tuple in creators:
            author_elem = etree.SubElement(authorgroup, 'author')
            personname = etree.SubElement(author_elem, 'personname')

            # Parse name: "FirstName LastName" or "LastName, FirstName"
            name = creator_tuple[0].strip()
            authors.append(name)

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

    metadata_dict['authors'] = authors

    # Publisher (try robust extraction for EPUB 2 and EPUB 3)
    publisher_name = get_metadata_value(book, 'publisher', epub_path)
    if publisher_name:
        publisher = etree.SubElement(bookinfo, 'publisher')
        publishername = etree.SubElement(publisher, 'publishername')
        publishername.text = publisher_name
        metadata_dict['publisher'] = publisher_name
        logger.info(f"Found publisher: {publisher_name}")
    else:
        logger.warning("Publisher metadata not found in ePub")

    # Publication date
    dates = book.get_metadata('DC', 'date')
    if dates:
        pubdate = etree.SubElement(bookinfo, 'pubdate')
        date_str = dates[0][0]
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
        metadata_dict['language'] = languages[0][0]

    # Copyright/Rights
    rights = book.get_metadata('DC', 'rights')
    if rights:
        copyright_elem = etree.SubElement(bookinfo, 'copyright')
        rights_text = rights[0][0]
        year_match = re.search(r'\d{4}', rights_text)
        if year_match:
            year_elem = etree.SubElement(copyright_elem, 'year')
            year_elem.text = year_match.group(0)
        holder_elem = etree.SubElement(copyright_elem, 'holder')
        holder_elem.text = rights_text

    return bookinfo, metadata_dict


def extract_toc_structure(book: epub.EpubBook) -> List[Tuple[str, str, int]]:
    """
    Extract table of contents structure from ePub.

    Args:
        book: EpubBook instance

    Returns:
        List of (title, href, level) tuples representing TOC hierarchy
    """
    toc_entries = []

    def process_toc_item(item, level=0):
        """Recursively process TOC items"""
        if isinstance(item, tuple):
            # (Section, [children]) or Link
            if len(item) == 2 and isinstance(item[1], list):
                # Section with children
                section = item[0]
                children = item[1]

                if hasattr(section, 'title') and hasattr(section, 'href'):
                    toc_entries.append((section.title, section.href, level))

                for child in children:
                    process_toc_item(child, level + 1)
            else:
                # Simple link
                if hasattr(item, 'title') and hasattr(item, 'href'):
                    toc_entries.append((item.title, item.href, level))
        elif hasattr(item, 'title') and hasattr(item, 'href'):
            # Link object
            toc_entries.append((item.title, item.href, level))

    # Process TOC
    toc = book.toc
    if isinstance(toc, list):
        for item in toc:
            process_toc_item(item)

    return toc_entries


def extract_cover_image(book: epub.EpubBook) -> Optional[Tuple[str, bytes]]:
    """
    Extract cover image from ePub.
    Supports all common image formats including PNG, JPEG, GIF, etc.

    Args:
        book: EpubBook instance

    Returns:
        Tuple of (filename, image_data) or None if no cover found
    """
    # Method 1: Check for cover image in metadata
    cover_id = None
    for meta_item in book.get_metadata('OPF', 'cover'):
        if meta_item and len(meta_item) > 1:
            cover_id = meta_item[1].get('content')
            break

    if cover_id:
        cover_item = book.get_item_with_id(cover_id)
        if cover_item and cover_item.get_content():
            logger.info(f"Found cover image via metadata: {cover_item.get_name()}")
            return (cover_item.get_name(), cover_item.get_content())

    # Method 2: Look for items with 'cover' in the name or properties
    # Support all image formats
    for item in book.get_items():
        item_name = item.get_name().lower()
        item_id = item.get_id().lower() if hasattr(item, 'get_id') else ''

        # Check if it's an image and has 'cover' in name or id
        if (hasattr(item, 'media_type') and item.media_type and
            'image' in item.media_type.lower()):
            if 'cover' in item_name or 'cover' in item_id:
                content = item.get_content()
                if content and len(content) > 0:
                    logger.info(f"Found cover image via name/id: {item.get_name()}")
                    return (item.get_name(), content)

    # Method 3: Check manifest properties for cover-image
    for item in book.get_items():
        if hasattr(item, 'properties') and item.properties:
            if 'cover-image' in item.properties.lower():
                content = item.get_content()
                if content and len(content) > 0:
                    logger.info(f"Found cover image via properties: {item.get_name()}")
                    return (item.get_name(), content)

    # Method 4: Check for first image in the spine
    for item_id, _ in book.spine[:1]:  # Check first spine item only
        item = book.get_item_with_id(item_id)
        if item:
            # Parse XHTML to find first image
            try:
                soup = BeautifulSoup(item.get_content(), 'html.parser')
                img = soup.find('img')
                if img and img.get('src'):
                    img_src = img.get('src')
                    # Normalize path
                    img_src = img_src.lstrip('./')
                    # Try to find this image in the book items
                    for img_item in book.get_items():
                        img_item_name = img_item.get_name()
                        if (img_item_name.endswith(img_src) or
                            img_src in img_item_name or
                            Path(img_item_name).name == Path(img_src).name):
                            if (hasattr(img_item, 'media_type') and img_item.media_type and
                                'image' in img_item.media_type.lower()):
                                content = img_item.get_content()
                                if content and len(content) > 0:
                                    logger.info(f"Found cover image via first spine image: {img_item.get_name()}")
                                    return (img_item.get_name(), content)
            except Exception as e:
                logger.debug(f"Error parsing first spine item for cover image: {e}")

    logger.warning("No cover image found in ePub")
    return None


def extract_images_with_mapping(book: epub.EpubBook,
                                output_dir: Path,
                                mapper: ReferenceMapper) -> Optional[str]:
    """
    Extract images from ePub and register in reference mapper.

    Args:
        book: EpubBook instance
        output_dir: Directory to save extracted images
        mapper: ReferenceMapper instance

    Returns:
        Filename of cover image if found, None otherwise
    """
    multimedia_dir = output_dir / 'MultiMedia'
    multimedia_dir.mkdir(parents=True, exist_ok=True)

    image_idx = 0
    cover_filename = None

    # First, try to extract cover image
    cover_data = extract_cover_image(book)
    if cover_data:
        cover_path, cover_content = cover_data
        extension = Path(cover_path).suffix.lower()
        cover_filename = f"cover{extension}"
        cover_file_path = multimedia_dir / cover_filename

        with open(cover_file_path, 'wb') as f:
            f.write(cover_content)

        # Get image dimensions
        try:
            img = Image.open(cover_file_path)
            width, height = img.size
        except:
            width, height = None, None

        # Register cover in mapper
        mapper.add_resource(
            original_path=cover_path,
            intermediate_name=cover_filename,
            resource_type="cover",
            is_vector=False,
            is_raster=True,
            width=width,
            height=height,
            file_size=len(cover_content)
        )
        logger.info(f"Extracted cover image: {cover_path} → {cover_filename}")

    # Now extract all other images
    for item in book.get_items():
        # Check for image items (using both ITEM_IMAGE and media_type)
        is_image = (item.get_type() == ebooklib.ITEM_IMAGE or
                   (hasattr(item, 'media_type') and item.media_type and
                    'image' in item.media_type.lower()))

        if is_image:
            original_path = item.get_name()

            # Skip if this is the cover image we already extracted
            if cover_data and original_path == cover_data[0]:
                continue

            extension = Path(original_path).suffix.lower()

            # Handle SVG conversion
            if extension == '.svg':
                if HAS_CAIROSVG:
                    try:
                        png_data = cairosvg.svg2png(bytestring=item.get_content())
                        temp_filename = f"img_{image_idx:04d}.png"
                        temp_path = multimedia_dir / temp_filename

                        with open(temp_path, 'wb') as f:
                            f.write(png_data)

                        # Get image dimensions
                        img = Image.open(temp_path)
                        width, height = img.size

                        # Register in mapper
                        mapper.add_resource(
                            original_path=original_path,
                            intermediate_name=temp_filename,
                            resource_type="image",
                            is_vector=True,
                            is_raster=False,
                            width=width,
                            height=height,
                            file_size=len(png_data)
                        )

                        image_idx += 1
                        logger.info(f"Converted SVG to PNG: {original_path} → {temp_filename}")
                    except Exception as e:
                        logger.error(f"Failed to convert SVG {original_path}: {e}")
                        continue
                else:
                    logger.warning(f"Skipping SVG (cairosvg not available): {original_path}")
                    continue
            else:
                # Regular image (JPEG, PNG, GIF, etc.)
                content = item.get_content()

                # Skip zero-byte images
                if len(content) == 0:
                    logger.warning(f"Skipping zero-byte image: {original_path}")
                    continue

                temp_filename = f"img_{image_idx:04d}{extension}"
                temp_path = multimedia_dir / temp_filename

                with open(temp_path, 'wb') as f:
                    f.write(content)

                # Get image info
                try:
                    img = Image.open(temp_path)
                    width, height = img.size
                    is_vector = False
                    is_raster = True
                except Exception as e:
                    logger.warning(f"Could not read image dimensions for {original_path}: {e}")
                    width, height = None, None
                    is_vector = False
                    is_raster = True

                # Register in mapper
                mapper.add_resource(
                    original_path=original_path,
                    intermediate_name=temp_filename,
                    resource_type="image",
                    is_vector=is_vector,
                    is_raster=is_raster,
                    width=width,
                    height=height,
                    file_size=len(content)
                )

                image_idx += 1

    logger.info(f"Extracted {image_idx} images with reference mapping")
    return cover_filename


def resolve_image_path(img_src: str, doc_path: str, mapper: ReferenceMapper) -> Optional[str]:
    """
    Resolve image path using reference mapper.

    Args:
        img_src: Image source from HTML (relative or absolute)
        doc_path: Path to current XHTML document
        mapper: ReferenceMapper instance

    Returns:
        Intermediate filename or None if not found
    """
    # Try direct lookup
    intermediate = mapper.get_intermediate_name(img_src)
    if intermediate:
        return intermediate

    # Try resolving relative path with proper normalization
    if not img_src.startswith('/'):
        doc_dir = str(Path(doc_path).parent)
        if doc_dir == '.':
            resolved = img_src
        else:
            # Construct path and normalize it (handles ../ properly)
            resolved = posixpath.normpath(f"{doc_dir}/{img_src}")

        intermediate = mapper.get_intermediate_name(resolved)
        if intermediate:
            return intermediate

    # Try without leading slash
    if img_src.startswith('/'):
        intermediate = mapper.get_intermediate_name(img_src[1:])
        if intermediate:
            return intermediate

    # Build comprehensive list of path variations to try
    variations = [
        img_src,
        img_src.lstrip('./'),
    ]

    # Add normalized variations with common EPUB prefixes
    img_cleaned = img_src.lstrip('./')
    variations.extend([
        f"OEBPS/{img_cleaned}",
        f"OPS/{img_cleaned}",
        f"Text/{img_cleaned}",
    ])

    # If we have a relative path with ../, also try normalized versions
    if not img_src.startswith('/'):
        doc_dir = str(Path(doc_path).parent)
        if doc_dir != '.':
            # Normalized full path
            full_normalized = posixpath.normpath(f"{doc_dir}/{img_src}")
            variations.append(full_normalized)

            # Try removing common prefixes from normalized path
            for prefix in ['OEBPS/', 'OPS/', 'Text/']:
                if full_normalized.startswith(prefix):
                    variations.append(full_normalized[len(prefix):])

    # Remove duplicates while preserving order
    seen = set()
    unique_variations = []
    for v in variations:
        if v not in seen:
            seen.add(v)
            unique_variations.append(v)

    for variant in unique_variations:
        intermediate = mapper.get_intermediate_name(variant)
        if intermediate:
            return intermediate

    logger.warning(f"Could not resolve image path: {img_src} in {doc_path}")
    return None


def convert_xhtml_to_chapter(xhtml_content: bytes,
                             doc_path: str,
                             chapter_id: str,
                             mapper: ReferenceMapper) -> etree.Element:
    """
    Convert a single XHTML file to a DocBook chapter.

    Args:
        xhtml_content: Raw XHTML content
        doc_path: Path to XHTML in ePub (for reference resolution)
        chapter_id: Chapter ID (e.g., "ch0001")
        mapper: ReferenceMapper instance

    Returns:
        lxml Element representing <chapter>
    """
    soup = BeautifulSoup(xhtml_content, 'html.parser')
    body = soup.find('body') or soup

    # Create chapter element
    chapter = etree.Element('chapter', id=chapter_id)

    # Extract title from first H1, or use filename
    h1 = body.find('h1')
    if h1:
        title_elem = etree.SubElement(chapter, 'title')
        title_elem.text = h1.get_text(' ').strip()
        h1.decompose()  # Remove from body
    else:
        # Try to find any heading
        for heading in ['h2', 'h3', 'h4']:
            h = body.find(heading)
            if h:
                title_elem = etree.SubElement(chapter, 'title')
                title_elem.text = h.get_text(' ').strip()
                h.decompose()
                break
        else:
            # Default title
            title_elem = etree.SubElement(chapter, 'title')
            title_elem.text = Path(doc_path).stem.replace('_', ' ').replace('-', ' ').title()

    # Convert body content
    convert_body_to_docbook(body, chapter, doc_path, chapter_id, mapper)

    # Ensure chapter has content beyond title (DTD requires at least one sect1 or other content)
    # Count non-title children
    content_count = sum(1 for child in chapter if child.tag != 'title')
    if content_count == 0:
        # Chapter has only a title - add a section with a para for DTD compliance
        section = etree.SubElement(chapter, 'sect1')
        section_title = etree.SubElement(section, 'title')
        section_title.text = 'Content'
        para = etree.SubElement(section, 'para')
        para.text = ''
        logger.debug(f"Added empty sect1 to chapter with only title: {chapter_id}")

    return chapter


def ensure_section_has_content(section: etree.Element) -> None:
    """
    Ensure a section has at least one content element beyond its title.
    Adds an empty para if needed for DTD compliance.

    Args:
        section: The section element to check
    """
    # Count non-title children
    content_count = sum(1 for child in section if child.tag != 'title')

    if content_count == 0:
        # Section has only a title - add an empty para for DTD compliance
        para = etree.SubElement(section, 'para')
        para.text = ''  # Empty but valid para
        logger.debug(f"Added empty para to section with only title: {section.get('id', 'unknown')}")


def convert_body_to_docbook(body, parent_elem: etree.Element,
                           doc_path: str, chapter_id: str,
                           mapper: ReferenceMapper) -> None:
    """
    Convert HTML body content to DocBook elements.

    Args:
        body: BeautifulSoup body element
        parent_elem: Parent lxml element to append to
        doc_path: XHTML document path
        chapter_id: Current chapter ID
        mapper: ReferenceMapper instance
    """
    section_stack = []  # Track section hierarchy
    figure_counter = {'count': 0}
    table_counter = {'count': 0}

    for elem in body.children:
        if isinstance(elem, NavigableString):
            # Direct text content
            text = str(elem).strip()
            if text and parent_elem.tag != 'title':
                # Wrap in para if not empty
                if len(text) > 0:
                    para = etree.SubElement(parent_elem if not section_stack else section_stack[-1][1], 'para')
                    para.text = text
        elif isinstance(elem, Tag):
            convert_element(elem, parent_elem, section_stack, doc_path, chapter_id,
                          mapper, figure_counter, table_counter)

    # Close any remaining open sections at the end and ensure they have content
    while section_stack:
        closed_section = section_stack.pop()[1]
        ensure_section_has_content(closed_section)


def convert_element(elem: Tag, parent_elem: etree.Element, section_stack: List,
                   doc_path: str, chapter_id: str, mapper: ReferenceMapper,
                   figure_counter: Dict, table_counter: Dict) -> None:
    """
    Convert a single HTML element to DocBook.

    Args:
        elem: BeautifulSoup Tag
        parent_elem: Parent lxml element
        section_stack: Stack of (level, section_element) tuples
        doc_path: Document path
        chapter_id: Chapter ID
        mapper: Reference mapper
        figure_counter: Figure counter dict
        table_counter: Table counter dict
    """
    tag_name = elem.name

    # Headings create sections
    if tag_name in ['h2', 'h3', 'h4', 'h5', 'h6']:
        level = int(tag_name[1])
        title_text = elem.get_text(' ').strip()

        if not title_text:
            return

        # Close deeper sections
        while section_stack and section_stack[-1][0] >= level:
            closed_section = section_stack.pop()[1]
            ensure_section_has_content(closed_section)

        # Create section
        section = etree.Element('section')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            section.set('id', f"{chapter_id}-{elem_id}")

        title_elem = etree.SubElement(section, 'title')
        title_elem.text = title_text

        # Add to parent
        if section_stack:
            section_stack[-1][1].append(section)
        else:
            parent_elem.append(section)

        section_stack.append((level, section))

    # Paragraphs
    elif tag_name == 'p':
        current_parent = section_stack[-1][1] if section_stack else parent_elem
        para = etree.SubElement(current_parent, 'para')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            para.set('id', f"{chapter_id}-{elem_id}")

        # Handle inline content
        extract_inline_content(elem, para, doc_path, chapter_id, mapper)

    # Figure elements (wrapper for images with captions)
    elif tag_name == 'figure':
        figure_counter['count'] += 1
        current_parent = section_stack[-1][1] if section_stack else parent_elem

        # Create DocBook figure
        figure = etree.SubElement(current_parent, 'figure')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            figure.set('id', f"{chapter_id}-{elem_id}")

        # Look for figcaption as title (DTD requires title for figure)
        figcaption = elem.find('figcaption')
        title_elem = etree.SubElement(figure, 'title')
        if figcaption:
            # Use extract_inline_content to preserve anchor tags and hrefs
            extract_inline_content(figcaption, title_elem, doc_path, chapter_id, mapper)
        else:
            # DTD requires title - add generic one if missing
            title_elem.text = f"Figure {figure_counter['count']}"

        # Find and process img element
        img = elem.find('img')
        if img:
            # MediaObject
            mediaobject = etree.SubElement(figure, 'mediaobject')
            imageobject = etree.SubElement(mediaobject, 'imageobject')
            imagedata = etree.SubElement(imageobject, 'imagedata')

            # Resolve image path
            img_src = img.get('src', '')
            if img_src:
                intermediate_name = resolve_image_path(img_src, doc_path, mapper)
                if intermediate_name:
                    imagedata.set('fileref', intermediate_name)
                    mapper.add_reference(img_src, chapter_id)
                else:
                    imagedata.set('fileref', f"missing_{figure_counter['count']}.jpg")

            # Add alt text as textobject
            alt_text = img.get('alt', '')
            if alt_text:
                textobject = etree.SubElement(mediaobject, 'textobject')
                phrase = etree.SubElement(textobject, 'phrase')
                phrase.text = alt_text
        else:
            # FIX: Create placeholder mediaobject for DTD compliance JC added
            mediaobject = etree.SubElement(figure, 'mediaobject') # JC added
            textobject = etree.SubElement(mediaobject, 'textobject') # JC added
            phrase = etree.SubElement(textobject, 'phrase') # JC added
            phrase.text = "Image not available"    # JC added
            # Figure without image, process other children
            for child in elem.children:
                if isinstance(child, Tag) and child.name != 'figcaption':
                    convert_element(child, figure, section_stack, doc_path, chapter_id,
                                  mapper, figure_counter, table_counter)

    # Standalone images (not in figure)
    elif tag_name == 'img':
        figure_counter['count'] += 1
        current_parent = section_stack[-1][1] if section_stack else parent_elem

        # Create figure wrapper
        figure = etree.SubElement(current_parent, 'figure')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            figure.set('id', f"{chapter_id}-{elem_id}")

        # Title/caption from alt text (DTD requires title for figure)
        alt_text = elem.get('alt', '')
        title_elem = etree.SubElement(figure, 'title')
        if alt_text:
            title_elem.text = alt_text
        else:
            # DTD requires title - add generic one if missing
            title_elem.text = f"Figure {figure_counter['count']}"

        # MediaObject (DTD requires content in figure)
        mediaobject = etree.SubElement(figure, 'mediaobject')
        imageobject = etree.SubElement(mediaobject, 'imageobject')
        imagedata = etree.SubElement(imageobject, 'imagedata')

        # Resolve image path
        img_src = elem.get('src', '')
        if img_src:
            intermediate_name = resolve_image_path(img_src, doc_path, mapper)
            if intermediate_name:
                imagedata.set('fileref', intermediate_name)
                mapper.add_reference(img_src, chapter_id)
            else:
                imagedata.set('fileref', f"missing_{figure_counter['count']}.jpg")

    # Lists
    elif tag_name == 'ul':
        current_parent = section_stack[-1][1] if section_stack else parent_elem
        itemizedlist = etree.SubElement(current_parent, 'itemizedlist')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            itemizedlist.set('id', f"{chapter_id}-{elem_id}")

        for li in elem.find_all('li', recursive=False):
            listitem = etree.SubElement(itemizedlist, 'listitem')

            # Preserve ID attribute on list item for cross-referencing (prefix with chapter_id)
            li_id = li.get('id')
            if li_id:
                listitem.set('id', f"{chapter_id}-{li_id}")

            para = etree.SubElement(listitem, 'para')

            # Extract inline content (text, links, formatting)
            # but exclude nested lists which we'll handle separately
            extract_inline_content(li, para, doc_path, chapter_id, mapper)

            # Handle nested lists (like in TOC) - process them as nested orderedlist/itemizedlist
            for nested_list in li.find_all(['ol', 'ul'], recursive=False):
                # Recursively convert the nested list
                convert_element(nested_list, listitem, section_stack, doc_path, chapter_id,
                              mapper, figure_counter, table_counter)

    elif tag_name == 'ol':
        current_parent = section_stack[-1][1] if section_stack else parent_elem
        orderedlist = etree.SubElement(current_parent, 'orderedlist')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            orderedlist.set('id', f"{chapter_id}-{elem_id}")

        for li in elem.find_all('li', recursive=False):
            listitem = etree.SubElement(orderedlist, 'listitem')

            # Preserve ID attribute on list item for cross-referencing (prefix with chapter_id)
            li_id = li.get('id')
            if li_id:
                listitem.set('id', f"{chapter_id}-{li_id}")

            para = etree.SubElement(listitem, 'para')

            # Extract inline content (text, links, formatting)
            # but exclude nested lists which we'll handle separately
            extract_inline_content(li, para, doc_path, chapter_id, mapper)

            # Handle nested lists (like in TOC) - process them as nested orderedlist/itemizedlist
            for nested_list in li.find_all(['ol', 'ul'], recursive=False):
                # Recursively convert the nested list
                convert_element(nested_list, listitem, section_stack, doc_path, chapter_id,
                              mapper, figure_counter, table_counter)

    # Tables
    elif tag_name == 'table':
        table_counter['count'] += 1
        current_parent = section_stack[-1][1] if section_stack else parent_elem

        # Simple table conversion (can be enhanced)
        table = etree.SubElement(current_parent, 'table')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            table.set('id', f"{chapter_id}-{elem_id}")

        # Look for caption element as title (DTD requires title for table)
        caption = elem.find('caption')
        title_elem = etree.SubElement(table, 'title')
        if caption:
            # Use extract_inline_content to preserve anchor tags and hrefs
            extract_inline_content(caption, title_elem, doc_path, chapter_id, mapper)
        else:
            # DTD requires title - add generic one if missing
            title_elem.text = f"Table {table_counter['count']}"

        # DTD requires tgroup for table content
        tgroup = etree.SubElement(table, 'tgroup', cols=str(count_table_columns(elem)))
        tbody = etree.SubElement(tgroup, 'tbody')

        for tr in elem.find_all('tr'):
            row = etree.SubElement(tbody, 'row')
            for td in tr.find_all(['td', 'th']):
                entry = etree.SubElement(row, 'entry')
                para = etree.SubElement(entry, 'para')
                # Use extract_inline_content to preserve anchor tags and hrefs in table cells
                extract_inline_content(td, para, doc_path, chapter_id, mapper)

    # Blockquote
    elif tag_name == 'blockquote':
        current_parent = section_stack[-1][1] if section_stack else parent_elem
        blockquote = etree.SubElement(current_parent, 'blockquote')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            blockquote.set('id', f"{chapter_id}-{elem_id}")

        for child in elem.children:
            if isinstance(child, Tag):
                convert_element(child, blockquote, [], doc_path, chapter_id, mapper,
                              figure_counter, table_counter)

    # Navigation (TOC) - process as a section with lists
    elif tag_name == 'nav':
        current_parent = section_stack[-1][1] if section_stack else parent_elem

        # Extract title if present
        nav_title = None
        h_elem = elem.find(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        if h_elem:
            nav_title = h_elem.get_text(' ').strip()

        # If nav has a title, create a section
        if nav_title:
            section = etree.Element('section')
            title_elem = etree.SubElement(section, 'title')
            title_elem.text = nav_title
            current_parent.append(section)
            # Process nav children in the section
            for child in elem.children:
                if isinstance(child, Tag) and child.name not in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                    convert_element(child, section, [], doc_path, chapter_id, mapper,
                                  figure_counter, table_counter)
        else:
            # No title, just process children directly
            for child in elem.children:
                if isinstance(child, Tag):
                    convert_element(child, current_parent, section_stack, doc_path, chapter_id,
                                  mapper, figure_counter, table_counter)

    # Definition lists (glossaries)
    elif tag_name == 'dl':
        current_parent = section_stack[-1][1] if section_stack else parent_elem
        variablelist = etree.SubElement(current_parent, 'variablelist')

        # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
        elem_id = elem.get('id')
        if elem_id:
            variablelist.set('id', f"{chapter_id}-{elem_id}")

        # Process dt/dd pairs
        current_term = None
        for child in elem.children:
            if isinstance(child, Tag):
                if child.name == 'dt':
                    # Start a new varlistentry
                    current_term = etree.SubElement(variablelist, 'varlistentry')

                    # Preserve ID attribute on varlistentry from dt element (prefix with chapter_id)
                    dt_id = child.get('id')
                    if dt_id:
                        current_term.set('id', f"{chapter_id}-{dt_id}")

                    term = etree.SubElement(current_term, 'term')
                    term.text = child.get_text(' ').strip()
                elif child.name == 'dd' and current_term is not None:
                    # Add definition to current term
                    listitem = etree.SubElement(current_term, 'listitem')

                    # Preserve ID attribute on listitem from dd element (prefix with chapter_id)
                    dd_id = child.get('id')
                    if dd_id:
                        listitem.set('id', f"{chapter_id}-{dd_id}")

                    # Check if dd has block elements or just text
                    has_block = any(isinstance(c, Tag) and c.name in ['p', 'div', 'ul', 'ol']
                                  for c in child.children)

                    if has_block:
                        # Process block elements
                        for dd_child in child.children:
                            if isinstance(dd_child, Tag):
                                convert_element(dd_child, listitem, [], doc_path, chapter_id,
                                              mapper, figure_counter, table_counter)
                    else:
                        # Just text, wrap in para
                        para = etree.SubElement(listitem, 'para')
                        para.text = child.get_text(' ').strip()

    # Divs and other containers - process children
    elif tag_name in ['div', 'section', 'article', 'aside', 'main', 'header', 'footer']:
        for child in elem.children:
            if isinstance(child, Tag):
                convert_element(child, parent_elem, section_stack, doc_path, chapter_id,
                              mapper, figure_counter, table_counter)

    # Fallback: unknown elements - process children to avoid content loss
    else:
        # Log that we're encountering an unhandled element (for debugging)
        if tag_name not in ['span', 'a', 'em', 'strong', 'b', 'i', 'code', 'br']:
            logger.debug(f"Processing unhandled element <{tag_name}> by processing its children")

        # Process children to preserve content
        for child in elem.children:
            if isinstance(child, Tag):
                convert_element(child, parent_elem, section_stack, doc_path, chapter_id,
                              mapper, figure_counter, table_counter)
            elif isinstance(child, NavigableString):
                text = str(child).strip()
                if text:
                    current_parent = section_stack[-1][1] if section_stack else parent_elem
                    # Create para to hold orphaned text
                    para = etree.SubElement(current_parent, 'para')
                    para.text = text


def extract_inline_content(elem: Tag, para: etree.Element,
                          doc_path: str, chapter_id: str,
                          mapper: ReferenceMapper) -> None:
    """
    Extract inline content (text + formatting) into a para element.
    Now properly preserves all formatting and creates proper XML elements.

    Args:
        elem: Source HTML element
        para: Target para element
        doc_path: Document path
        chapter_id: Chapter ID
        mapper: Reference mapper
    """
    def process_node(node, parent_elem):
        """Recursively process a node and its children"""
        if isinstance(node, NavigableString):
            text = str(node)
            if text:
                if len(parent_elem) == 0:
                    # No children yet, append to text
                    parent_elem.text = (parent_elem.text or '') + text
                else:
                    # Has children, append to last child's tail
                    parent_elem[-1].tail = (parent_elem[-1].tail or '') + text
        elif isinstance(node, Tag):
            # Handle formatting tags
            new_elem = None

            # Bold
            if node.name in ['strong', 'b']:
                new_elem = etree.SubElement(parent_elem, 'emphasis', role='bold')
            # Italic
            elif node.name in ['em', 'i']:
                new_elem = etree.SubElement(parent_elem, 'emphasis')
            # Underline
            elif node.name == 'u':
                new_elem = etree.SubElement(parent_elem, 'emphasis', role='underline')
            # Strikethrough
            elif node.name in ['s', 'strike', 'del']:
                new_elem = etree.SubElement(parent_elem, 'emphasis', role='strikethrough')
            # Subscript
            elif node.name == 'sub':
                new_elem = etree.SubElement(parent_elem, 'subscript')
            # Superscript
            elif node.name == 'sup':
                new_elem = etree.SubElement(parent_elem, 'superscript')
            # Code/monospace
            elif node.name in ['code', 'tt', 'kbd', 'samp']:
                new_elem = etree.SubElement(parent_elem, 'code')
            # Small text
            elif node.name == 'small':
                new_elem = etree.SubElement(parent_elem, 'phrase', role='small')
            # Mark/highlight
            elif node.name == 'mark':
                new_elem = etree.SubElement(parent_elem, 'phrase', role='highlight')
            # Abbreviation
            elif node.name == 'abbr':
                new_elem = etree.SubElement(parent_elem, 'phrase', role='abbreviation')
                if node.get('title'):
                    new_elem.set('title', node.get('title'))
            # Links
            elif node.name == 'a':
                href = node.get('href', '')
                new_elem = etree.SubElement(parent_elem, 'ulink')

                # Resolve and set URL
                resolved_href = resolve_link_href(href, doc_path, mapper, chapter_id)
                new_elem.set('url', resolved_href or href)

                # Register link in mapper with proper target resolution
                target_chapter = None
                target_anchor = None

                # Parse resolved href to extract target chapter and anchor
                if resolved_href and not resolved_href.startswith(('http://', 'https://', 'mailto:', 'ftp://', 'tel:', '//')):
                    # Internal link - extract target info
                    if '.xml' in resolved_href:
                        # Format: ch0001.xml#anchor or ch0001.xml
                        if '#' in resolved_href:
                            target_part, anchor_part = resolved_href.split('#', 1)
                            target_chapter = target_part.replace('.xml', '')
                            target_anchor = anchor_part
                        else:
                            target_chapter = resolved_href.replace('.xml', '')
                    elif resolved_href.startswith('#'):
                        # Same-page anchor
                        target_chapter = chapter_id
                        target_anchor = resolved_href[1:]  # Remove leading #

                mapper.add_link(href, chapter_id, target_chapter, target_anchor)
            # Span with styling
            elif node.name == 'span':
                style = node.get('style', '')
                css_class = node.get('class', '')
                epub_type = node.get('epub:type', '') or node.get('data-type', '')

                # Check if this is a page break marker
                is_pagebreak = False
                if epub_type and 'pagebreak' in epub_type.lower():
                    is_pagebreak = True
                elif css_class:
                    # Check for common page break classes
                    class_str = ' '.join(css_class) if isinstance(css_class, list) else css_class
                    class_lower = class_str.lower()
                    if any(pb in class_lower for pb in ['pagebreak', 'page-break', 'page_break', 'pagenum', 'page-num', 'page_num']):
                        is_pagebreak = True

                # Handle page breaks specially: preserve ID and page number but don't create visual formatting
                if is_pagebreak:
                    # Extract page number from text content or title attribute
                    page_number = node.get_text(' ').strip() or node.get('title', '').strip()
                    node_id = node.get('id')

                    # Create an anchor element for the page number
                    # This preserves the location for deep linking without creating visual breaks
                    new_elem = etree.SubElement(parent_elem, 'anchor')

                    # Preserve ID for deep linking (prefix with chapter_id to avoid conflicts)
                    if node_id:
                        new_elem.set('id', f"{chapter_id}-{node_id}")

                    # Store page number as an attribute for reference
                    if page_number:
                        new_elem.set('page-number', page_number)

                    # Mark as page break for potential post-processing
                    new_elem.set('role', 'pagebreak')

                    # Don't process children - we don't want to display page break content
                    return

                # Not a page break - handle as regular span with formatting
                # Extract font formatting from style attribute
                style_attrs = parse_style_attribute(style)

                if style_attrs or css_class:
                    new_elem = etree.SubElement(parent_elem, 'phrase')

                    # Build role attribute with styling info
                    role_parts = []
                    if css_class:
                        if isinstance(css_class, list):
                            role_parts.extend(css_class)
                        else:
                            role_parts.append(css_class)

                    # Add CSS properties to role
                    for prop, value in style_attrs.items():
                        role_parts.append(f"{prop}:{value}")

                    if role_parts:
                        new_elem.set('role', '; '.join(role_parts))
                else:
                    # No styling, just process children directly
                    for child in node.children:
                        process_node(child, parent_elem)
                    return
            # Inline images
            elif node.name == 'img':
                # Track inline image reference
                img_src = node.get('src', '')
                if img_src:
                    intermediate_name = resolve_image_path(img_src, doc_path, mapper)
                    if intermediate_name:
                        # Register the reference so it's not marked as unreferenced
                        mapper.add_reference(img_src, chapter_id)
                        logger.debug(f"Tracked inline image reference: {img_src} in {chapter_id}")
                # Note: We don't create inlinemediaobject here, just track the reference
                # The image will be extracted during packaging
                return
            # Line break
            elif node.name == 'br':
                # Add newline to text/tail
                if len(parent_elem) == 0:
                    parent_elem.text = (parent_elem.text or '') + '\n'
                else:
                    parent_elem[-1].tail = (parent_elem[-1].tail or '') + '\n'
                return
            # Block-level elements should NOT be processed in inline context
            # Skip them to prevent invalid nesting like para inside para
            elif node.name in ['p', 'div', 'section', 'article', 'aside', 'header', 'footer',
                              'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                              'dl', 'dt', 'dd',  # NOTE: ul/ol removed - now handled by parent
                              'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
                              'blockquote', 'pre', 'hr', 'figure', 'figcaption',
                              'nav', 'main', 'form', 'fieldset']:
                # Block element in inline context - unwrap it but preserve inline content
                logger.warning(f"Unwrapping block element <{node.name}> in inline context at {chapter_id}")
                # Instead of extracting just text, recursively process children
                # This preserves links, formatting, and other inline elements
                for child in node.children:
                    process_node(child, parent_elem)
                return
            # Nested lists (ul/ol) and list items (li) in inline context
            # These are now handled by the parent list processing, so skip them entirely
            # Don't extract their text - that will be done when processing them as nested lists
            elif node.name in ['ul', 'ol', 'li']:
                # Skip completely - will be processed by parent list handler
                logger.debug(f"Skipping nested list element <{node.name}> in inline context - will be processed separately")
                return
            # Other inline containers - just process children
            else:
                for child in node.children:
                    process_node(child, parent_elem)
                return

            # Process children of the new element
            if new_elem is not None:
                # Preserve ID attribute for cross-referencing (prefix with chapter_id to avoid conflicts)
                node_id = node.get('id')
                if node_id:
                    new_elem.set('id', f"{chapter_id}-{node_id}")

                for child in node.children:
                    process_node(child, new_elem)

    # Process all children of the element
    for child in elem.children:
        process_node(child, para)


def parse_style_attribute(style_str: str) -> Dict[str, str]:
    """
    Parse CSS style attribute into a dictionary.

    Args:
        style_str: CSS style string (e.g., "font-family: Arial; font-size: 14pt; color: red")

    Returns:
        Dictionary of CSS properties and values
    """
    styles = {}
    if not style_str:
        return styles

    # Split by semicolon and parse each property
    for prop in style_str.split(';'):
        prop = prop.strip()
        if ':' in prop:
            key, value = prop.split(':', 1)
            key = key.strip().lower()
            value = value.strip()

            # Only preserve font-related and color properties
            if key in ['font-family', 'font-size', 'font-weight', 'font-style',
                      'color', 'background-color', 'text-decoration', 'text-align']:
                styles[key] = value

    return styles


def resolve_link_href(href: str, doc_path: str, mapper: ReferenceMapper,
                      source_chapter: str) -> Optional[str]:
    """
    Resolve a link href to its final form.

    Args:
        href: Original href from HTML
        doc_path: Current document path
        mapper: Reference mapper
        source_chapter: Current chapter ID

    Returns:
        Resolved href or None if it should stay as-is
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

    # Split into path and fragment
    if '#' in href:
        link_path, fragment = href.split('#', 1)
        fragment = '#' + fragment
    else:
        link_path = href
        fragment = ''

    # Resolve relative path
    if link_path.startswith('../') or link_path.startswith('./'):
        doc_dir = str(Path(doc_path).parent)
        if doc_dir == '.':
            resolved_path = link_path
        else:
            resolved_path = str(Path(doc_dir) / link_path)
        # Normalize path
        resolved_path = str(Path(resolved_path).as_posix())
    else:
        resolved_path = link_path

    # Try to resolve to a chapter ID
    # Try exact match
    target_chapter = mapper.get_chapter_id(resolved_path)

    if not target_chapter:
        # Try basename
        basename = Path(link_path).name
        target_chapter = mapper.get_chapter_id(basename)

    if not target_chapter:
        # Try variations
        variations = [
            link_path,
            f"OEBPS/{link_path}",
            f"OPS/{link_path}",
            f"Text/{link_path}",
            link_path.lstrip('./'),
            link_path.lstrip('../'),
        ]
        for variant in variations:
            target_chapter = mapper.get_chapter_id(variant)
            if target_chapter:
                break

    if target_chapter:
        # Resolved to internal chapter
        # Prefix the fragment ID with target chapter to match prefixed IDs
        if fragment and fragment.startswith('#'):
            fragment_id = fragment[1:]  # Remove leading #
            if fragment_id:
                fragment = f"#{target_chapter}-{fragment_id}"
        return f"{target_chapter}.xml{fragment}"

    # Could not resolve - return as-is (might be external resource)
    return href


def count_table_columns(table_elem: Tag) -> int:
    """Count number of columns in a table"""
    max_cols = 0
    for tr in table_elem.find_all('tr'):
        cols = len(tr.find_all(['td', 'th']))
        max_cols = max(max_cols, cols)
    return max_cols or 1


def post_process_links(tree_root: etree.Element, mapper: ReferenceMapper) -> int:
    """
    Post-process all links in the XML tree to ensure xhtml references
    are converted to chapter references.

    This is a final pass to catch any links that weren't properly resolved
    during the initial conversion.

    Args:
        tree_root: Root element of the XML tree
        mapper: ReferenceMapper with chapter mappings

    Returns:
        Number of links updated
    """
    updated_count = 0

    # Find all ulink elements
    for ulink in tree_root.xpath('.//ulink'):
        url = ulink.get('url', '')
        if not url:
            continue

        # Skip external links
        if url.startswith(('http://', 'https://', 'mailto:', 'ftp://', 'tel:', '//')):
            continue

        # Skip already-converted chapter links
        if url.endswith('.xml') or '.xml#' in url:
            continue

        # Process xhtml links
        if '.xhtml' in url or '.html' in url:
            # Split into path and fragment
            if '#' in url:
                link_path, fragment = url.split('#', 1)
                fragment = '#' + fragment
            else:
                link_path = url
                fragment = ''

            # Try to find the target chapter
            target_chapter = None

            # Try exact match first
            target_chapter = mapper.get_chapter_id(link_path)

            if not target_chapter:
                # Try basename
                basename = Path(link_path).name
                target_chapter = mapper.get_chapter_id(basename)

            if not target_chapter:
                # Try variations
                variations = [
                    link_path.lstrip('./'),
                    link_path.lstrip('../'),
                    f"OEBPS/{link_path}",
                    f"OPS/{link_path}",
                    f"Text/{link_path}",
                ]
                for variant in variations:
                    target_chapter = mapper.get_chapter_id(variant)
                    if target_chapter:
                        break

            # If we found a chapter, update the link
            if target_chapter:
                new_url = f"{target_chapter}.xml{fragment}"
                ulink.set('url', new_url)
                updated_count += 1
                logger.debug(f"Post-processed link: {url} → {new_url}")
            else:
                logger.warning(f"Could not resolve link in post-processing: {url}")

    if updated_count > 0:
        logger.info(f"Post-processed {updated_count} links")

    return updated_count


def convert_epub_to_structured_v2(epub_path: Path,
                                  output_xml: Path,
                                  temp_dir: Path,
                                  tracker: Optional[ConversionTracker] = None) -> None:
    """
    Main conversion function: ePub → structured.xml (Version 2)

    Uses native ePub structure (XHTML files) instead of heuristics.

    Args:
        epub_path: Path to input ePub file
        output_xml: Path to output structured.xml
        temp_dir: Temporary directory for extraction
        tracker: Optional conversion tracker
    """
    logger.info(f"Converting ePub to structured XML: {epub_path}")

    # Reset and get mapper
    reset_mapper()
    mapper = get_mapper()

    # Update progress
    if tracker:
        tracker.update_progress(5, ConversionStatus.IN_PROGRESS)

    # Load ePub
    book = epub.read_epub(str(epub_path))
    logger.info(f"Loaded ePub: {book.title}")

    # Extract metadata (pass epub_path for robust EPUB 3 metadata extraction)
    bookinfo, metadata_dict = extract_metadata(book, epub_path)
    logger.info(f"Extracted metadata: {metadata_dict.get('title', 'Unknown')}")
    if metadata_dict.get('publisher'):
        logger.info(f"  Publisher: {metadata_dict.get('publisher')}")

    if tracker:
        tracker.current_metadata.isbn = metadata_dict.get('isbn')
        tracker.current_metadata.title = metadata_dict.get('title')
        tracker.current_metadata.publisher = metadata_dict.get('publisher')
        tracker.current_metadata.authors = metadata_dict.get('authors', [])
        tracker.update_progress(10)

    # Extract images with mapping
    cover_filename = extract_images_with_mapping(book, temp_dir, mapper)
    logger.info(f"Extracted {mapper.stats['total_images']} images")

    if tracker:
        tracker.current_metadata.num_vector_images = mapper.stats['vector_images']
        tracker.current_metadata.num_raster_images = mapper.stats['raster_images']
        tracker.update_progress(20)

    # Get spine order (reading order)
    spine_items = []
    for item_id, _ in book.spine:
        item = book.get_item_with_id(item_id)
        if item and item.get_type() == ebooklib.ITEM_DOCUMENT:
            spine_items.append(item)

    logger.info(f"Found {len(spine_items)} documents in spine")

    if tracker:
        tracker.current_metadata.num_chapters = len(spine_items)
        tracker.update_progress(25)

    # Convert each XHTML to chapter
    chapters = []
    for idx, item in enumerate(spine_items):
        # Always start from ch0001 for the first chapter
        chapter_id = f"ch{idx+1:04d}"
        doc_path = item.get_name()

        # Register chapter mapping with multiple path variations
        mapper.register_chapter(doc_path, chapter_id)

        # Also register basename and common variations
        basename = Path(doc_path).name
        if basename != doc_path:
            mapper.register_chapter(basename, chapter_id)

        # Register common ePub path prefixes
        path_variations = [
            doc_path.lstrip('./'),
            doc_path.lstrip('../'),
        ]
        for variant in path_variations:
            if variant and variant != doc_path:
                mapper.register_chapter(variant, chapter_id)

        # Convert XHTML to chapter
        try:
            xhtml_content = item.get_content()
            chapter_elem = convert_xhtml_to_chapter(xhtml_content, doc_path, chapter_id, mapper)
            chapters.append(chapter_elem)
            logger.info(f"Converted chapter {idx+1}/{len(spine_items)}: {doc_path} → {chapter_id}")
        except Exception as e:
            logger.error(f"Failed to convert chapter {doc_path}: {e}", exc_info=True)
            # Create empty chapter as fallback
            chapter_elem = etree.Element('chapter', id=chapter_id)
            title_elem = etree.SubElement(chapter_elem, 'title')
            title_elem.text = f"Chapter {idx+1} (Conversion Error)"
            para = etree.SubElement(chapter_elem, 'para')
            para.text = f"Error converting {doc_path}: {str(e)}"
            chapters.append(chapter_elem)

        # Update progress
        if tracker:
            progress = 25 + int((idx + 1) / len(spine_items) * 60)
            tracker.update_progress(progress)

    # Create root book element
    book_elem = etree.Element('book')
    book_elem.append(bookinfo)

    # Insert cover image node if cover was extracted
    if cover_filename:
        logger.info(f"Inserting cover image node: {cover_filename}")
        cover_figure = etree.Element('figure')
        cover_figure.set('id', 'cover-image')

        # Add title for the cover
        cover_title = etree.SubElement(cover_figure, 'title')
        cover_title.text = 'Cover'

        # Create mediaobject structure
        mediaobject = etree.SubElement(cover_figure, 'mediaobject')
        imageobject = etree.SubElement(mediaobject, 'imageobject')
        imagedata = etree.SubElement(imageobject, 'imagedata')
        imagedata.set('fileref', cover_filename)

        # Insert cover as first element after bookinfo
        book_elem.append(cover_figure)

    for chapter in chapters:
        book_elem.append(chapter)

    # Post-process links to fix any xhtml references that weren't converted
    logger.info("Post-processing links to convert xhtml references to chapter references...")
    post_process_links(book_elem, mapper)

    # Write output XML
    tree = etree.ElementTree(book_elem)
    output_xml.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(output_xml), encoding='utf-8', xml_declaration=True, pretty_print=True)

    logger.info(f"Wrote structured XML to {output_xml}")

    # Export reference mapping
    mapping_json = output_xml.parent / "reference_mapping.json"
    mapper.export_to_json(mapping_json)
    logger.info(f"Exported reference mapping to {mapping_json}")

    # Generate report
    report = mapper.generate_report()
    logger.info(f"\n{report}")

    if tracker:
        tracker.update_progress(90)


def main():
    """Command-line entry point"""
    parser = argparse.ArgumentParser(description='Convert ePub to structured XML (v2)')
    parser.add_argument('epub_file', help='Input ePub file')
    parser.add_argument('-o', '--output', help='Output structured.xml file',
                       default='structured.xml')
    parser.add_argument('-t', '--temp', help='Temporary directory',
                       default='epub_temp')

    args = parser.parse_args()

    epub_path = Path(args.epub_file)
    output_xml = Path(args.output)
    temp_dir = Path(args.temp)

    if not epub_path.exists():
        print(f"Error: ePub file not found: {epub_path}", file=sys.stderr)
        sys.exit(1)

    convert_epub_to_structured_v2(epub_path, output_xml, temp_dir)


if __name__ == '__main__':
    main()
