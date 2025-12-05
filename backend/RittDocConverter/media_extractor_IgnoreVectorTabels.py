"""
PDF Media Extractor - Professional Edition v2.2
================================================

BASED ON PROVEN LOGIC from pdf_vector_extractor.py (ULTIMATE VERSION)

Extracts content from PDFs with intelligent filtering:
- Vector drawings (diagrams, flowcharts) - PROVEN extraction logic
- Raster images (photos, embedded images)
- **NEW v2.2: Tables are automatically detected and SKIPPED**

Features:
✨ Uses PROVEN overlap-based merging (2pt tolerance)
✨ Uses PROVEN caption text matching
✨ Uses PROVEN text boundary expansion
✨ Smart chapter/section detection
✨ Naming: Ch0001F01, Ch0002F02 (figures only)
✨ Single multimedia/ output folder
✨ pdftohtml-compatible XML coordinates

v2.2 Features:
🚫 **COMPREHENSIVE TABLE DETECTION & SKIPPING**:
   - Checks for "Table" captions
   - Verifies visible grid boundaries (horizontal/vertical lines)
   - Confirms text in cell-like arrangement
   - Uses confidence scoring (Caption=50pts, Grid=30pts, Cells=20pts)
   - Tables with confidence ≥50 are automatically skipped

v2.1 Features:
🎯 Filters 0-byte images automatically
🎯 Detects decorative images (no caption/label/details, small size/dimensions)
🎯 Image deduplication using MD5 hashing
🎯 Duplicate figures reuse the first extracted asset (no extra files)
🎯 XML references for duplicate images (no duplicate files saved)
🎯 Works for both raster AND vector images
🎯 Detailed statistics on filtered/duplicate images

For beginners: This tool now intelligently detects and SKIPS tables completely.
It looks for three signs: (1) caption says "Table", (2) has visible grid lines,
and (3) has text arranged in cells. When it finds a table, it won't save it!
"""

import fitz  # PyMuPDF
import xml.etree.ElementTree as ET
from xml.dom import minidom
import os
import re
from collections import defaultdict
import hashlib
from io import BytesIO
import tempfile  # ADD THIS
import shutil    # ADD THIS
import re, math 
import argparse
from pathlib import Path
import sys, math, re
import argparse
from PIL import Image



FIG_REF_RE = re.compile(r"\b(?:Figure|Fig\.)\s*(\d+(?:\.\d+)?)\b", re.IGNORECASE)

def _extract_ref_from_caption_info(caption_info: dict | None) -> str | None:
    """
    Return 'N' or 'N.M' from caption metadata, else None.
    Works with keys like 'caption_label' and 'full_caption' used in your code.
    """
    if not caption_info:
        return None
    for key in ("caption_label", "full_caption", "text", "caption"):
        val = caption_info.get(key)
        if not val:
            continue
        m = FIG_REF_RE.search(val)
        if m:
            return m.group(1)
    return None

# ============================================================================
# PROVEN HELPER FUNCTIONS (from original pdf_vector_extractor.py)
# ============================================================================

def rect_overlap(rect1, rect2, pad=2.0):
    """
    Check if two rectangles overlap when slightly inflated by padding.
    PROVEN LOGIC - from original extractor
    """
    r1_x0 = rect1[0] - pad
    r1_y0 = rect1[1] - pad
    r1_x1 = rect1[2] + pad
    r1_y1 = rect1[3] + pad
    
    r2_x0 = rect2[0] - pad
    r2_y0 = rect2[1] - pad
    r2_x1 = rect2[2] + pad
    r2_y1 = rect2[3] + pad
    
    if r1_x1 < r2_x0 or r2_x1 < r1_x0:
        return False
    if r1_y1 < r2_y0 or r2_y1 < r1_y0:
        return False
    
    return True


def rect_union(rect1, rect2):
    """
    Create a bounding box that contains both rectangles.
    PROVEN LOGIC - from original extractor
    """
    min_x = min(rect1[0], rect2[0])
    min_y = min(rect1[1], rect2[1])
    max_x = max(rect1[2], rect2[2])
    max_y = max(rect1[3], rect2[3])
    
    return [min_x, min_y, max_x, max_y]


def merge_overlapping_rects(rects, pad=2.0):
    """
    Merge all rectangles that overlap, using transitive closure.
    PROVEN LOGIC - from original extractor
    """
    if not rects:
        return []
    
    merged = [list(r) for r in rects]
    
    changed = True
    while changed:
        changed = False
        output = []
        
        while merged:
            current = merged.pop(0)
            temp = []
            for other in merged:
                if rect_overlap(current, other, pad):
                    current = rect_union(current, other)
                    changed = True
                else:
                    temp.append(other)
            output.append(current)
            merged = temp
        
        merged = output[:]
    
    return merged


def find_text_near_boundaries(page, rect, boundary_distance=15):
    """
    Find all text near boundaries of a rectangle.
    PROVEN LOGIC - from original extractor
    """
    x1, y1, x2, y2 = rect
    
    search_rect = fitz.Rect(
        x1 - boundary_distance,
        y1 - boundary_distance,
        x2 + boundary_distance,
        y2 + boundary_distance
    )
    search_rect = search_rect & page.rect
    
    text_instances = page.get_text("dict", clip=search_rect)
    
    text_boxes = []
    for block in text_instances.get("blocks", []):
        if block.get("type") != 0:
            continue
        
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "").strip()
                if not text:
                    continue
                
                bbox = span.get("bbox", [0, 0, 0, 0])
                text_rect = [bbox[0], bbox[1], bbox[2], bbox[3]]
                
                if is_text_near_boundary(text_rect, rect, boundary_distance):
                    text_boxes.append({
                        'rect': text_rect,
                        'text': text,
                        'distance': calculate_boundary_distance(text_rect, rect)
                    })
    
    return text_boxes


def is_text_near_boundary(text_rect, drawing_rect, threshold=15):
    """
    Check if text is near boundary.
    PROVEN LOGIC - from original extractor
    """
    tx1, ty1, tx2, ty2 = text_rect
    dx1, dy1, dx2, dy2 = drawing_rect
    
    text_cx = (tx1 + tx2) / 2
    text_cy = (ty1 + ty2) / 2
    
    dist_left = abs(text_cx - dx1)
    dist_right = abs(text_cx - dx2)
    dist_top = abs(text_cy - dy1)
    dist_bottom = abs(text_cy - dy2)
    
    min_edge_dist = min(dist_left, dist_right, dist_top, dist_bottom)
    is_near = min_edge_dist <= threshold
    
    margin = 20
    is_inside = (text_cx > dx1 + margin and 
                 text_cx < dx2 - margin and 
                 text_cy > dy1 + margin and 
                 text_cy < dy2 - margin)
    
    return is_near and not is_inside


def calculate_boundary_distance(text_rect, drawing_rect):
    """Calculate minimum distance from text to boundary."""
    tx1, ty1, tx2, ty2 = text_rect
    dx1, dy1, dx2, dy2 = drawing_rect
    
    text_cx = (tx1 + tx2) / 2
    text_cy = (ty1 + ty2) / 2
    
    dist_left = abs(text_cx - dx1)
    dist_right = abs(text_cx - dx2)
    dist_top = abs(text_cy - dy1)
    dist_bottom = abs(text_cy - dy2)
    
    return round(min(dist_left, dist_right, dist_top, dist_bottom), 2)


def expand_rect_to_include_text(rect, text_boxes):
    """
    Expand rectangle to include text boxes.
    PROVEN LOGIC - from original extractor
    """
    if not text_boxes:
        return rect
    
    expanded = list(rect)
    
    for text_box in text_boxes:
        text_rect = text_box['rect']
        expanded = rect_union(expanded, text_rect)
    
    return expanded


def extract_full_caption_text(page, drawing_rect, search_distance=150):
    """
    Extract FULL caption text.
    PROVEN LOGIC - from original extractor
    """
    caption_patterns = [
        r'\b[Ff]igure\s+\d+(?:\.\d+)?',
        r'\b[Ff]ig\.?\s+\d+(?:\.\d+)?',
        r'\b[Tt]able\s+\d+(?:\.\d+)?',
        r'\b[Ii]mage\s+\d+(?:\.\d+)?',
        r'\b[Ii]llustration\s+\d+',
        r'\b[Dd]iagram\s+\d+',
        r'\b[Cc]hart\s+\d+',
    ]
    
    x1, y1, x2, y2 = drawing_rect
    search_rect = fitz.Rect(
        x1 - search_distance,
        y1 - search_distance,
        x2 + search_distance,
        y2 + search_distance
    )
    search_rect = search_rect & page.rect
    
    text_blocks = page.get_text("dict", clip=search_rect)
    
    for block in text_blocks.get("blocks", []):
        if block.get("type") != 0:
            continue
        
        block_text = ""
        block_bbox = None
        
        for line in block.get("lines", []):
            line_text = ""
            for span in line.get("spans", []):
                line_text += span.get("text", "")
            block_text += line_text + " "
            
            if block_bbox is None and line.get("spans"):
                block_bbox = line["spans"][0].get("bbox", [0, 0, 0, 0])
        
        block_text = block_text.strip()
        
        for pattern in caption_patterns:
            match = re.search(pattern, block_text)
            if match:
                caption_label = match.group(0)
                full_caption = block_text
                
                if len(full_caption) > 200:
                    sentence_end = re.search(r'[.!?]\s', full_caption[:200])
                    if sentence_end:
                        full_caption = full_caption[:sentence_end.end()].strip()
                    else:
                        full_caption = full_caption[:200].strip() + "..."
                
                if not block_bbox:
                    block_bbox = [0, 0, 0, 0]
                
                caption_center_x = (block_bbox[0] + block_bbox[2]) / 2
                caption_center_y = (block_bbox[1] + block_bbox[3]) / 2
                drawing_center_x = (x1 + x2) / 2
                drawing_center_y = (y1 + y2) / 2
                
                distance = ((caption_center_x - drawing_center_x) ** 2 + 
                          (caption_center_y - drawing_center_y) ** 2) ** 0.5
                
                return {
                    'caption_label': caption_label,
                    'caption_full': full_caption,
                    'caption_bbox': block_bbox,
                    'distance': round(distance, 2),
                    'position': 'above' if block_bbox[3] < y1 else 
                              'below' if block_bbox[1] > y2 else 'beside'
                }
    
    return None


def has_text_in_region(page, rect):
    """Check if text exists in region. PROVEN LOGIC."""
    clip_rect = fitz.Rect(rect[0], rect[1], rect[2], rect[3])
    text = page.get_text("text", clip=clip_rect)
    text = text.strip()
    
    return {
        'has_text': len(text) > 0,
        'text_content': text,
        'text_length': len(text)
    }


def is_likely_background(page, drawing_rect, page_rect, threshold=0.5):
    """Detect background elements. PROVEN LOGIC."""
    drawing_width = drawing_rect[2] - drawing_rect[0]
    drawing_height = drawing_rect[3] - drawing_rect[1]
    drawing_area = drawing_width * drawing_height
    
    page_width = page_rect.width
    page_height = page_rect.height
    page_area = page_width * page_height
    
    if page_area == 0:
        return False
    
    coverage = drawing_area / page_area
    
    if coverage > threshold:
        text_info = has_text_in_region(page, drawing_rect)
        if text_info['has_text']:
            return False
        else:
            return True
    
    if coverage < 0.01 and drawing_area < 100:
        return True
    
    return False


def group_by_full_caption(page, merged_rects, drawings):
    """
    Group by FULL caption text.
    PROVEN LOGIC - from original extractor
    """
    if not merged_rects:
        return []
    
    rect_captions = []
    for rect_idx, rect in enumerate(merged_rects):
        caption_info = extract_full_caption_text(page, rect, search_distance=150)
        
        if caption_info:
            rect_captions.append({
                'rect_idx': rect_idx,
                'rect': rect,
                'caption_label': caption_info['caption_label'],
                'caption_full': caption_info['caption_full'],
                'caption_info': caption_info
            })
        else:
            rect_captions.append({
                'rect_idx': rect_idx,
                'rect': rect,
                'caption_label': None,
                'caption_full': None,
                'caption_info': None
            })
    
    caption_to_rects = {}
    for rc in rect_captions:
        caption_key = rc['caption_full']
        if caption_key:
            if caption_key not in caption_to_rects:
                caption_to_rects[caption_key] = []
            caption_to_rects[caption_key].append(rc)
    
    final_rects = []
    used_indices = set()
    
    for caption_full, rect_list in caption_to_rects.items():
        if len(rect_list) > 1:
            merged_rect = rect_list[0]['rect']
            for rc in rect_list[1:]:
                merged_rect = rect_union(merged_rect, rc['rect'])
                used_indices.add(rc['rect_idx'])
            
            final_rects.append({
                'rect': merged_rect,
                'caption_info': rect_list[0]['caption_info'],
                'is_merged': True,
                'component_count': len(rect_list)
            })
            used_indices.add(rect_list[0]['rect_idx'])
        else:
            rc = rect_list[0]
            final_rects.append({
                'rect': rc['rect'],
                'caption_info': rc['caption_info'],
                'is_merged': False,
                'component_count': 1
            })
            used_indices.add(rc['rect_idx'])
    
    for rc in rect_captions:
        if rc['rect_idx'] not in used_indices:
            final_rects.append({
                'rect': rc['rect'],
                'caption_info': None,
                'is_merged': False,
                'component_count': 1
            })
    
    return final_rects


# ============================================================================
# NEW: CHAPTER/SECTION DETECTION
# ============================================================================

class ChapterDetector:
    """Detects chapters and sections in PDF."""
    
    def __init__(self):
        self.chapter_patterns = [
            r'Chapter\s+(\d+)',
            r'CHAPTER\s+(\d+)',
            r'^(\d+)\.\s+[A-Z]',
            r'Ch\.\s*(\d+)',
            r'^(\d+)\s+[A-Z][A-Z]',
        ]
        
        self.section_patterns = [
            r'^(\d+)\.(\d+)',
            r'^(\d+)\.(\d+)\.(\d+)',
        ]
        
        self.current_chapter = 1
        self.current_section = 1
        self.page_to_chapter = {}
        self.page_to_section = {}
    
    def detect_structure(self, pdf_document):
        """Scan PDF to find chapters."""
        print("🔍 Detecting document structure...")
        
        for page_num in range(len(pdf_document)):
            page = pdf_document[page_num]
            blocks = page.get_text("dict")["blocks"]
            
            for block in blocks:
                if block.get("type") != 0:
                    continue
                
                for line in block.get("lines", []):
                    line_text = ""
                    is_large = False
                    is_bold = False
                    
                    for span in line.get("spans", []):
                        line_text += span.get("text", "")
                        size = span.get("size", 0)
                        flags = span.get("flags", 0)
                        
                        if size > 14:
                            is_large = True
                        if flags & 2**4:
                            is_bold = True
                    
                    line_text = line_text.strip()
                    
                    if is_large or is_bold:
                        for pattern in self.chapter_patterns:
                            match = re.search(pattern, line_text)
                            if match:
                                chapter_num = int(match.group(1))
                                self.page_to_chapter[page_num] = chapter_num
                                self.current_chapter = chapter_num
                                print(f"   📖 Page {page_num + 1}: Chapter {chapter_num}")
                                break
                        
                        for pattern in self.section_patterns:
                            match = re.search(pattern, line_text)
                            if match:
                                section_str = '.'.join(match.groups())
                                self.page_to_section[page_num] = section_str
                                print(f"   📑 Page {page_num + 1}: Section {section_str}")
                                break
        
        self._fill_chapter_gaps(len(pdf_document))
        print(f"   ✅ Found {len(set(self.page_to_chapter.values()))} chapters")
    
    def _fill_chapter_gaps(self, total_pages):
        """Fill in missing chapter numbers."""
        current_chapter = 1
        for page_num in range(total_pages):
            if page_num in self.page_to_chapter:
                current_chapter = self.page_to_chapter[page_num]
            else:
                self.page_to_chapter[page_num] = current_chapter
    
    def get_chapter(self, page_num):
        return self.page_to_chapter.get(page_num, 1)
    
    def get_section(self, page_num):
        return self.page_to_section.get(page_num, None)


# ============================================================================
# NEW: COORDINATE CONVERSION
# ============================================================================

def convert_to_pdftohtml_coords(bbox, page_height):
    """Convert PyMuPDF coords to pdftohtml coords."""
    x0, y0, x1, y1 = bbox
    
    top = page_height - y1
    bottom = page_height - y0
    left = x0
    right = x1
    
    return {
        'left': round(left, 2),
        'top': round(top, 2),
        'right': round(right, 2),
        'bottom': round(bottom, 2),
        'width': round(right - left, 2),
        'height': round(bottom - top, 2)
    }


# ============================================================================
# NEW: RASTER IMAGE EXTRACTION
# ============================================================================

def extract_raster_images(page, page_num):
    """Extract embedded raster images."""
    images = []
    image_list = page.get_images(full=True)
    
    for img_index, img_info in enumerate(image_list):
        xref = img_info[0]
        image_rects = page.get_image_rects(xref)
        
        if not image_rects:
            continue
        
        rect = image_rects[0]
        
        images.append({
            'type': 'raster',
            'xref': xref,
            'index': img_index,
            'bbox': [rect.x0, rect.y0, rect.x1, rect.y1],
            'page': page_num
        })
    
    return images


# ============================================================================
# NEW: TABLE DETECTION
# ============================================================================

def is_likely_table(path_dict):
    """
    Detect if drawing is a table based on structure.
    
    For beginners: This looks at the drawing and checks if it has
    lots of rectangles and straight lines arranged in a grid pattern,
    which is what tables look like!
    """
    items = path_dict.get('items', [])
    if not items:
        return False
    
    rect_count = sum(1 for item in items if item[0] == 're')
    line_count = sum(1 for item in items if item[0] == 'l')
    curve_count = sum(1 for item in items if item[0] == 'c')
    
    total = rect_count + line_count + curve_count
    if total == 0:
        return False
    
    simple_ratio = (rect_count + line_count) / total
    return simple_ratio > 0.8 and rect_count >= 4


def has_table_caption(caption_info):
    """
    Check if caption indicates this is a table.
    
    For beginners: This looks at the caption text to see if it says
    "Table 1", "Table 2.3", etc. - a clear sign it's a table!
    
    Parameters:
        caption_info: Dictionary with 'caption_label' and 'caption_full'
    
    Returns:
        True if caption indicates a table, False otherwise
    """
    if not caption_info:
        return False
    
    caption_label = caption_info.get('caption_label', '')
    caption_full = caption_info.get('caption_full', '')
    
    # Check if caption starts with "Table" (case-insensitive)
    table_pattern = r'\b[Tt]able\s+\d+(?:\.\d+)?'
    
    if re.search(table_pattern, caption_label):
        return True
    if re.search(table_pattern, caption_full):
        return True
    
    return False


def has_grid_structure(page, bbox):
    """
    Check if region has visible grid lines (table boundaries).
    
    For beginners: This looks at the PDF page and counts how many
    horizontal and vertical lines are in the region. Tables have
    lots of lines forming a grid!
    
    Parameters:
        page: PyMuPDF page object
        bbox: Bounding box [x0, y0, x1, y1]
    
    Returns:
        True if has grid-like structure, False otherwise
    """
    x0, y0, x1, y1 = bbox
    
    # Get all drawing paths in this region
    paths = page.get_drawings()
    
    horizontal_lines = 0
    vertical_lines = 0
    
    for path in paths:
        path_rect = path.get("rect")
        
        # Check if this path overlaps with our bbox
        if not rect_overlap(list(path_rect), bbox, pad=2):
            continue
        
        items = path.get('items', [])
        
        for item in items:
            if item[0] == 'l':  # Line
                # item[1] is start point, item[2] is end point
                start = item[1]
                end = item[2]
                
                # Check if it's roughly horizontal
                if abs(start.y - end.y) < 5:  # Very small Y difference
                    horizontal_lines += 1
                
                # Check if it's roughly vertical
                if abs(start.x - end.x) < 5:  # Very small X difference
                    vertical_lines += 1
    
    # A table typically has at least 3 horizontal lines and 2 vertical lines
    # (header row, data rows, and column separators)
    has_grid = (horizontal_lines >= 3 and vertical_lines >= 2)
    
    return has_grid


def has_text_in_cells(page, bbox):
    """
    Check if region has text that looks like it's organized in cells.
    
    For beginners: This extracts all the text from the region and checks
    if it's arranged in a grid pattern (like rows and columns), which is
    what table cells look like!
    
    Parameters:
        page: PyMuPDF page object
        bbox: Bounding box [x0, y0, x1, y1]
    
    Returns:
        True if has cell-like text arrangement, False otherwise
    """
    x0, y0, x1, y1 = bbox
    clip_rect = fitz.Rect(x0, y0, x1, y1)
    
    # Get words in this region
    words = page.get_text("words", clip=clip_rect)
    
    if len(words) < 4:  # Tables usually have at least 4 words
        return False
    
    # Group words by their Y position (rows)
    rows_dict = defaultdict(list)
    
    for word in words:
        word_text = word[4]
        word_y = (word[1] + word[3]) / 2  # Middle Y position
        word_x = word[0]
        
        # Round Y to group into rows (tolerance of 5 points)
        row_key = round(word_y / 5) * 5
        rows_dict[row_key].append({'text': word_text, 'x': word_x})
    
    # Check if we have multiple rows
    if len(rows_dict) < 2:
        return False
    
    # Check if rows have similar column structure
    # (words at similar X positions across rows)
    row_lengths = [len(words) for words in rows_dict.values()]
    
    # If most rows have similar number of words, it's likely a table
    if len(row_lengths) >= 2:
        avg_length = sum(row_lengths) / len(row_lengths)
        similar_rows = sum(1 for length in row_lengths if abs(length - avg_length) <= 2)
        
        # If at least 50% of rows have similar word counts, likely a table
        if similar_rows / len(row_lengths) >= 0.5:
            return True
    
    return False


def is_table_comprehensive(page, bbox, caption_info, page_drawings):
    """
    Comprehensive table detection using multiple signals.
    
    For beginners: This is like a detective that looks for multiple clues:
    1. Does the caption say "Table"?
    2. Does it have grid lines (visible boundaries)?
    3. Does it have text arranged in cells?
    
    If it finds enough clues, it concludes this is a table!
    
    Parameters:
        page: PyMuPDF page object
        bbox: Bounding box [x0, y0, x1, y1]
        caption_info: Caption information
        page_drawings: List of drawing objects in the region
    
    Returns:
        (is_table, confidence_score, reasons)
    """
    reasons = []
    confidence = 0
    
    # Signal 1: Caption says "Table" (STRONG signal - 50 points)
    if has_table_caption(caption_info):
        confidence += 50
        reasons.append("Caption indicates 'Table'")
    
    # Signal 2: Has grid structure (STRONG signal - 30 points)
    if has_grid_structure(page, bbox):
        confidence += 30
        reasons.append("Has visible grid lines")
    
    # Signal 3: Has text in cell-like arrangement (MEDIUM signal - 20 points)
    if has_text_in_cells(page, bbox):
        confidence += 20
        reasons.append("Has text in cell-like arrangement")
    
    # Signal 4: Check if drawings look like table (WEAK signal - 10 points)
    has_table_drawing = False
    for drawing in page_drawings:
        if rect_overlap(drawing['rect'], bbox, pad=5):
            if is_likely_table(drawing['path']):
                has_table_drawing = True
                break
    
    if has_table_drawing:
        confidence += 10
        reasons.append("Has table-like vector drawing")
    
    # Decision: If confidence >= 50, it's a table
    # (This means either caption says "Table", or we have grid + cells)
    is_table = confidence >= 50
    
    return is_table, confidence, reasons


def extract_table_data(page, bbox):
    """Extract structured data from table."""
    x0, y0, x1, y1 = bbox
    clip_rect = fitz.Rect(x0, y0, x1, y1)
    words = page.get_text("words", clip=clip_rect)
    
    if not words:
        return {'rows': [], 'cols': 0, 'cells': []}
    
    rows_dict = defaultdict(list)
    
    for word in words:
        word_text = word[4]
        word_y = (word[1] + word[3]) / 2
        word_x = word[0]
        
        row_key = round(word_y / 5) * 5
        rows_dict[row_key].append({'text': word_text, 'x': word_x, 'y': word_y})
    
    sorted_rows = sorted(rows_dict.items(), key=lambda x: x[0])
    
    table_rows = []
    max_cols = 0
    
    for row_y, words_in_row in sorted_rows:
        sorted_words = sorted(words_in_row, key=lambda w: w['x'])
        row_cells = []
        
        if sorted_words:
            current_cell = sorted_words[0]['text']
            last_x = sorted_words[0]['x']
            
            for word in sorted_words[1:]:
                if word['x'] - last_x > 20:
                    row_cells.append(current_cell)
                    current_cell = word['text']
                else:
                    current_cell += " " + word['text']
                last_x = word['x']
            
            row_cells.append(current_cell)
        
        table_rows.append(row_cells)
        max_cols = max(max_cols, len(row_cells))
    
    for row in table_rows:
        while len(row) < max_cols:
            row.append("")
    
    return {'rows': len(table_rows), 'cols': max_cols, 'cells': table_rows}


# ============================================================================
# NEW: MEDIA NAMING
# ============================================================================

class MediaNamer:
    """Generates names like Ch0001f01 or Ch0001s0102f03."""

    def __init__(self):
        # Counters are tracked per (chapter, section_key)
        self.figure_counters = defaultdict(int)

    @staticmethod
    def _section_key(section: str | None) -> str:
        """
        Normalise section identifier into compact token.

        Examples:
            "1.2"   -> "s0102"
            "3.10"  -> "s0310"
            None    -> ""
        """
        if not section:
            return ""

        tokens = re.findall(r"\d+", str(section))
        if not tokens:
            return ""
        parts = "".join(f"{int(tok):02d}" for tok in tokens)
        return f"s{parts}"

    def get_figure_name(self, chapter: int, section: str | None) -> str:
        """
        Return a file-safe identifier that includes chapter, optional section,
        and a scoped figure counter.
        """
        section_token = self._section_key(section)
        counter_key = (chapter, section_token)
        self.figure_counters[counter_key] += 1
        counter = self.figure_counters[counter_key]
        if section_token:
            return f"Ch{int(chapter):04d}{section_token}f{counter:02d}"
        return f"Ch{int(chapter):04d}f{counter:02d}"


# ============================================================================
# NEW: IMAGE DEDUPLICATION
# ============================================================================

class ImageDeduplicator:
    """
    Detect duplicate images so we only persist a single JPEG per unique hash.
    Subsequent references reuse the first filename.
    """

    def __init__(self, multimedia_dir: str):
        self.multimedia_dir = multimedia_dir
        self.image_hashes: Dict[str, str] = {}  # hash -> filename relative to multimedia_dir
        self.hash_usage: Dict[str, List[tuple[int, str | None]]] = defaultdict(list)

    @staticmethod
    def calculate_image_hash(image_bytes: bytes) -> str:
        """Return a stable fingerprint for the binary payload."""
        return hashlib.md5(image_bytes).hexdigest()

    def add_image(
        self,
        image_bytes: bytes,
        image_ext: str,
        page_num: int,
        media_name: str,
        caption_label: str | None = None,
    ) -> tuple[str, bool, str, bool]:
        """
        Register an image and return:
        (filename, is_duplicate, hash, should_save_bytes)
        """
        img_hash = self.calculate_image_hash(image_bytes)

        if img_hash in self.image_hashes:
            filename = self.image_hashes[img_hash]
            self.hash_usage[img_hash].append((page_num, caption_label))
            return filename, True, img_hash, False

        filename = f"{media_name}.{image_ext}"
        self.image_hashes[img_hash] = filename
        self.hash_usage[img_hash].append((page_num, caption_label))
        return filename, False, img_hash, True

    def get_usage_count(self, img_hash: str) -> int:
        """Return the number of references recorded for this hash."""
        return len(self.hash_usage.get(img_hash, []))

    def get_usage_info(self, img_hash: str):
        """Return recorded usage metadata for diagnostics."""
        return self.hash_usage.get(img_hash, [])


def convert_bytes_to_jpeg(image_bytes: bytes, *, quality: int = 92) -> bytes:
    """
    Convert arbitrary image bytes into baseline JPEG.

    Ensures we always emit RGB JPEGs regardless of source format (PNG, GIF, etc).
    """
    with Image.open(BytesIO(image_bytes)) as img:
        if img.mode not in ("RGB",):
            img = img.convert("RGB")
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=quality)
        return buffer.getvalue()


def is_decorative_image(image_bytes, caption, min_size_kb=1, bbox=None):
    """
    Detect if an image is decorative (should be ignored).
    
    Decorative images typically:
    - Have no caption, label, or identifying text
    - Are very small in file size (< 1 KB)
    - Are very small in dimensions (< 50x50 pixels)
    - Repeated many times (logos, icons, bullets)
    - Background patterns or page decorations
    
    For beginners: This filters out logos, bullets, borders, backgrounds,
    and other decorative elements that aren't real content figures.
    
    Parameters:
        image_bytes: The image data
        caption: Caption info (or None) - includes caption_label and caption_full
        min_size_kb: Minimum size in KB (default 1 KB)
        bbox: Bounding box [x0, y0, x1, y1] for dimension check (optional)
    
    Returns:
        True if decorative, False if real content
    """
    # Rule 1: Empty or 0-byte images are ALWAYS decorative
    size_bytes = len(image_bytes)
    if size_bytes == 0:
        return True
    
    # Rule 2: Check if it has any identifying information
    # Real figures have captions like "Figure 1.2" or "Table 3"
    has_caption = caption is not None and caption.get('caption_label')
    has_details = caption is not None and caption.get('caption_full')
    
    # Rule 3: Check dimensions if bbox provided
    # Very small images (< 50x50 points) without captions are likely decorative
    is_very_small_dimensions = False
    is_medium_size = False
    if bbox:
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        # Images smaller than 50x50 points (about 0.7 inches) are suspicious
        if width < 50 and height < 50:
            is_very_small_dimensions = True
        # Medium-sized images (50-150 points) are often decorative if no caption
        if width < 150 and height < 150:
            is_medium_size = True
    
    # Rule 4: Tiny file size (< 1 KB) + no caption = decorative
    if size_bytes < (min_size_kb * 1024):
        if not has_caption:
            return True
    
    # Rule 5: Small file size (< 5 KB) + no caption + no details = decorative
    # This catches logos and icons
    if size_bytes < (5 * 1024):
        if not has_caption and not has_details:
            return True
    
    # Rule 6: Very small dimensions + no caption = decorative
    # This catches borders, bullets, and small icons
    if is_very_small_dimensions and not has_caption:
        return True
    
    # Rule 7 (STRICTER): Medium size + no caption = likely decorative
    # Background images and page decorations are often medium-sized
    if is_medium_size and not has_caption:
        return True
    
    # Rule 8 (NEW - MOST IMPORTANT): No caption + reasonable size = still decorative!
    # Real content figures ALMOST ALWAYS have captions
    # Background images, page decorations, and repeated elements do NOT
    if not has_caption:
        # Be more lenient for very large images (might be uncaptioned photos)
        if size_bytes < (50 * 1024):  # Less than 50KB
            return True
    
    # If none of the decorative rules match, it's probably real content
    return False


# ============================================================================
# MAIN EXTRACTION (using PROVEN logic)
# ============================================================================

def extract_all_media(pdf_path, output_dir, text_boundary_distance=15, use_temp_folder=False):
    """
    Main extraction using PROVEN logic from original extractor.
    Now with decorative image filtering and deduplication!
    """
    print("=" * 70)
    print("📚 PDF Media Extractor v2.1 - Enhanced Filtering")
    print("=" * 70)
    print(f"📖 Opening: {pdf_path}")
    
    # NEW: Use temp folder if requested
    if use_temp_folder:
        temp_dir = tempfile.mkdtemp(prefix="pdf_media_")
        multimedia_dir = os.path.join(temp_dir, "multimedia")
        print(f"✨ Using temp folder: {temp_dir}")
    else:
        temp_dir = None
        multimedia_dir = os.path.join(output_dir, "multimedia")

    os.makedirs(multimedia_dir, exist_ok=True)

    pdf_doc = fitz.open(str(pdf_path))

    chapter_detector = ChapterDetector()
    chapter_detector.detect_structure(pdf_doc)
    
    namer = MediaNamer()
    deduplicator = ImageDeduplicator(multimedia_dir)
    all_items = []
    figure_counter = {}
    
    print(f"\n📄 Processing {len(pdf_doc)} pages...")
    print(f"   🔤 Text boundary: {text_boundary_distance} points")
    
    for page_num in range(len(pdf_doc)):
        page = pdf_doc[page_num]
        chapter = chapter_detector.get_chapter(page_num)
        section = chapter_detector.get_section(page_num)
        
        print(f"\n   Page {page_num + 1} (Chapter {chapter})" + 
              (f", Section {section}" if section else ""))
        
        page_height = page.rect.height
        
        # 1. RASTER IMAGES
        raster_images = extract_raster_images(page, page_num)
        print(f"      📸 Raster images: {len(raster_images)}")
        
        decorative_count = 0
        duplicate_count = 0
        skipped_table_count = 0
        
        for img in raster_images:
            xref = img['xref']
            base_image = pdf_doc.extract_image(xref)
            image_bytes = base_image["image"]
            
            # Check if 0-byte or empty
            if len(image_bytes) == 0:
                decorative_count += 1
                continue
            
            # Get caption for this image - we'll use this throughout
            img_caption = extract_full_caption_text(page, img['bbox'])
            
            # CHECK IF THIS IS A TABLE - if so, SKIP IT!
            is_table, confidence, reasons = is_table_comprehensive(
                page, img['bbox'], img_caption, []
            )
            
            if is_table:
                skipped_table_count += 1
                reason_str = ", ".join(reasons)
                print(f"         🚫 Table detected in raster image (confidence: {confidence}): {reason_str} - SKIPPED")
                continue
            
            # Check if decorative (no caption + small size + small dimensions)
            if is_decorative_image(image_bytes, img_caption, min_size_kb=1, bbox=img['bbox']):
                decorative_count += 1
                continue
            
            # Check for duplicates and get filename
            media_name = namer.get_figure_name(chapter, section)
            jpeg_bytes = convert_bytes_to_jpeg(image_bytes)
            filename, is_shared, img_hash, should_save = deduplicator.add_image(
                jpeg_bytes, "jpg", page_num + 1, media_name,
                img_caption['caption_label'] if img_caption else None
            )
            
            # Save the image if it's not a duplicate
            if should_save:
                filepath = os.path.join(multimedia_dir, filename)
                with open(filepath, 'wb') as f:
                    f.write(jpeg_bytes)
            
            if is_shared:
                duplicate_count += 1
            
            # Extract reference number from caption
            coords = convert_to_pdftohtml_coords(img['bbox'], page_height)
            ref = _extract_ref_from_caption_info(img_caption)
            
            all_items.append({
                'type': 'figure',
                'subtype': 'raster',
                'name': media_name,
                'filename': filename,
                'page': page_num + 1,
                'chapter': chapter,
                'section': section,
                'coords': coords,
                'caption': img_caption,
                'ref': ref,
                'is_shared': is_shared,
                'image_hash': img_hash,
                'usage_count': deduplicator.get_usage_count(img_hash)
            })
            
            status = " (duplicate)" if is_shared else ""
            print(f"         ✅ {media_name}{status}")
        
        if decorative_count > 0:
            print(f"      🎨 Decorative images filtered: {decorative_count}")
        if duplicate_count > 0:
            print(f"      🔗 Duplicate images: {duplicate_count}")
        if skipped_table_count > 0:
            print(f"      🚫 Tables skipped: {skipped_table_count}")
        
        # 2. VECTOR DRAWINGS (using PROVEN logic)
        paths = page.get_drawings()
        
        if paths:
            print(f"      🎨 Processing {len(paths)} vector paths...")
            
            # Filter background
            page_drawings = []
            for idx, path in enumerate(paths):
                rect = path.get("rect")
                if not is_likely_background(page, list(rect), page.rect):
                    page_drawings.append({
                        'index': idx,
                        'path': path,
                        'rect': list(rect)
                    })
            
            if page_drawings:
                # PROVEN: Merge overlapping
                rects_only = [d['rect'] for d in page_drawings]
                merged_rects = merge_overlapping_rects(rects_only, pad=2.0)
                
                # PROVEN: Group by caption
                if len(merged_rects) > 1:
                    final_rects = group_by_full_caption(page, merged_rects, page_drawings)
                else:
                    if merged_rects:
                        caption_info = extract_full_caption_text(page, merged_rects[0])
                        final_rects = [{
                            'rect': merged_rects[0],
                            'caption_info': caption_info,
                            'is_merged': False,
                            'component_count': 1
                        }]
                    else:
                        final_rects = []
                
                # PROVEN: Expand for text
                for region in final_rects:
                    rect = region['rect']
                    boundary_text = find_text_near_boundaries(page, rect, text_boundary_distance)
                    
                    if boundary_text:
                        expanded_rect = expand_rect_to_include_text(rect, boundary_text)
                        region['rect'] = expanded_rect
                        region['was_expanded'] = True
                        region['boundary_text_count'] = len(boundary_text)
                    else:
                        region['was_expanded'] = False
                        region['boundary_text_count'] = 0
                
                # Separate tables from figures using comprehensive detection
                tables_in_vectors = []
                figures_only = []
                skipped_tables = 0
                
                for region in final_rects:
                    caption = region.get('caption_info')
                    bbox = region['rect']
                    
                    # Use comprehensive table detection
                    is_table, confidence, reasons = is_table_comprehensive(
                        page, bbox, caption, page_drawings
                    )
                    
                    if is_table:
                        # SKIP THIS TABLE - don't save it!
                        skipped_tables += 1
                        reason_str = ", ".join(reasons)
                        print(f"      🚫 Table detected (confidence: {confidence}): {reason_str} - SKIPPED")
                    else:
                        # This is a figure, keep it
                        figures_only.append(region)
                
                print(f"      ✅ Figures to save: {len(figures_only)}")
                print(f"      🚫 Tables skipped: {skipped_tables}")
                
                # Save figures
                vector_decorative_count = 0
                vector_duplicate_count = 0
                
                for region in figures_only:
                    caption = region.get('caption_info')
                    
                    # Skip if no caption at all (likely decorative)
                    if not caption:
                        vector_decorative_count += 1
                        continue
                    
                    media_name = namer.get_figure_name(chapter, section)
                    
                    bbox = region['rect']
                    
                    # Validate bbox dimensions
                    width = bbox[2] - bbox[0]
                    height = bbox[3] - bbox[1]
                    
                    if width <= 0 or height <= 0:
                        print(f"         ⚠️  {media_name}: Invalid dimensions ({width:.1f}x{height:.1f}), skipped")
                        continue
                    
                    if width < 5 or height < 5:
                        print(f"         ⚠️  {media_name}: Too small ({width:.1f}x{height:.1f}), skipped")
                        vector_decorative_count += 1
                        continue
                    
                    margin = 5
                    clip_rect = fitz.Rect(
                        bbox[0] - margin, bbox[1] - margin,
                        bbox[2] + margin, bbox[3] + margin
                    )
                    
                    # Ensure clip_rect is within page bounds
                    clip_rect = clip_rect & page.rect
                    
                    # Validate clip_rect
                    if clip_rect.is_empty or clip_rect.width < 1 or clip_rect.height < 1:
                        print(f"         ⚠️  {media_name}: Invalid clip region, skipped")
                        continue
                    
                    try:
                        mat = fitz.Matrix(2, 2)
                        pix = page.get_pixmap(matrix=mat, clip=clip_rect)
                        
                        # Validate pixmap dimensions
                        if pix.width == 0 or pix.height == 0:
                            print(f"         ⚠️  {media_name}: Empty pixmap ({pix.width}x{pix.height}), skipped")
                            continue
                        
                        # Get image bytes for deduplication and decorative check
                        image_bytes = pix.tobytes("png")
                        
                        # Check if decorative (even for vector images)
                        if is_decorative_image(image_bytes, caption, min_size_kb=1, bbox=bbox):
                            vector_decorative_count += 1
                            print(f"         🎨 {media_name}: Decorative, skipped")
                            continue
                        
                        # Check for duplicates using deduplicator
                        jpeg_bytes = convert_bytes_to_jpeg(image_bytes)
                        filename, is_shared, img_hash, should_save = deduplicator.add_image(
                            jpeg_bytes, "jpg", page_num + 1, media_name,
                            caption['caption_label'] if caption else None
                        )
                        
                        # Save the image if it's not a duplicate
                        if should_save:
                            filepath = os.path.join(multimedia_dir, filename)
                            with open(filepath, 'wb') as f:
                                f.write(jpeg_bytes)
                        
                        if is_shared:
                            vector_duplicate_count += 1
                        
                        # Only add if save succeeded
                        coords = convert_to_pdftohtml_coords(bbox, page_height)
                        
                        ref = None
                        if caption:
                            # caption is the dict returned by extract_full_caption_text / group_by_full_caption
                            ref = _extract_ref_from_caption_info(caption)
                        
                        # --- Fallback numbering if no ref found ---
                        if not ref and chapter is not None:
                            # Create a per-chapter running counter
                            figure_counter.setdefault(chapter, 0)
                            figure_counter[chapter] += 1
                            ref = f"{chapter}.{figure_counter[chapter]}"

                        all_items.append({
                            'type': 'figure',
                            'subtype': 'vector',
                            'name': media_name,
                            'filename': filename,
                            'page': page_num + 1,
                            'chapter': chapter,
                            'section': section,
                            'coords': coords,
                            'caption': caption,
                            'ref': ref,
                            'is_shared': is_shared,
                            'image_hash': img_hash,
                            'usage_count': deduplicator.get_usage_count(img_hash)
                        })
                        
                        status = " (duplicate)" if is_shared else ""
                        print(f"         ✅ {media_name}{status}")
                        
                    except Exception as e:
                        print(f"         ⚠️  {media_name}: Save failed ({str(e)}), skipped")
                        continue
                
                # Print summary of filtered vector images
                if vector_decorative_count > 0:
                    print(f"      🎨 Vector decorative images filtered: {vector_decorative_count}")
                if vector_duplicate_count > 0:
                    print(f"      🔗 Vector duplicate images: {vector_duplicate_count}")
    
    pdf_doc.close()
    
    figures = [item for item in all_items if item['type'] == 'figure']
    duplicate_items = [item for item in all_items if item.get('is_shared', False)]
    unique_images = len(all_items) - len(duplicate_items)
    
    print("\n" + "=" * 70)
    print("📊 EXTRACTION SUMMARY")
    print("=" * 70)
    print(f"   📸 Figures: {len(figures)}")
    print(f"      - Raster: {sum(1 for f in figures if f['subtype'] == 'raster')}")
    print(f"      - Vector: {sum(1 for f in figures if f['subtype'] == 'vector')}")
    print(f"   🚫 Tables: SKIPPED (tables are now filtered out)")
    print(f"   🔗 Duplicate images: {len(duplicate_items)}")
    print(f"   💾 Unique images saved: {unique_images}")
    print(f"   📁 Output assets: {multimedia_dir}")
    print("=" * 70)
    
    return all_items, temp_dir, multimedia_dir

def cleanup_temp_folder(temp_dir):
    """
    Clean up temporary folder after packaging.
    
    Args:
        temp_dir: Path to temp directory (or None if not using temp)
    """
    if temp_dir and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
        print(f"🧹 Cleaned up temp folder: {temp_dir}")

# ============================================================================
# XML GENERATION
# ============================================================================

def create_xml_output(items, output_path, pdf_path):
    """Create XML with page-level structure."""
    print("\n📝 Creating XML...")
    
    root = ET.Element('document')
    root.set('source', os.path.basename(pdf_path))
    root.set('coordinate_system', 'pdftohtml')
    
    summary = ET.SubElement(root, 'summary')
    figures = [item for item in items if item['type'] == 'figure']
    duplicate_items = [item for item in items if item.get('is_shared', False)]
    
    ET.SubElement(summary, 'total_figures').text = str(len(figures))
    ET.SubElement(summary, 'duplicate_figures').text = str(len(duplicate_items))
    ET.SubElement(summary, 'note').text = "Tables are automatically detected and skipped. Duplicate figures reuse the first saved asset."
    
    pages_dict = defaultdict(list)
    for item in items:
        pages_dict[item['page']].append(item)
    
    pages_elem = ET.SubElement(root, 'pages')
    
    for page_num in sorted(pages_dict.keys()):
        page_items = pages_dict[page_num]
        
        page_elem = ET.SubElement(pages_elem, 'page')
        page_elem.set('number', str(page_num))
        page_elem.set('chapter', str(page_items[0]['chapter']))
        if page_items[0]['section']:
            page_elem.set('section', str(page_items[0]['section']))
        
        page_figures = [item for item in page_items if item['type'] == 'figure']
        if page_figures:
            figures_elem = ET.SubElement(page_elem, 'figures')
            figures_elem.set('count', str(len(page_figures)))
            
            for fig in page_figures:
                fig_elem = ET.SubElement(figures_elem, 'figure')
                fig_elem.set('id', fig['name'])
                fig_elem.set('type', fig['subtype'])
                
                # Add coordinates as direct attributes (matching text XML format)
                fig_elem.set('top', str(int(fig['coords']['top'])))
                fig_elem.set('left', str(int(fig['coords']['left'])))
                fig_elem.set('width', str(int(fig['coords']['width'])))
                fig_elem.set('height', str(int(fig['coords']['height'])))

                if fig.get('ref'):
                    fig_elem.set('ref', str(fig["ref"]))
                
                if fig.get('filename'):
                    fig_elem.set('filename', str(fig['filename']))
                
                # Mark if this is a duplicate image
                if fig.get('is_shared', False):
                    fig_elem.set('shared', 'true')
                    fig_elem.set('usage_count', str(fig.get('usage_count', 1)))
                
                media_ref = ET.SubElement(fig_elem, 'media')
                ET.SubElement(media_ref, 'filename').text = os.path.basename(fig['filename'])
                ET.SubElement(media_ref, 'path').text = f"multimedia/{fig['filename']}"
                
                if fig['caption']:
                    caption_elem = ET.SubElement(fig_elem, 'caption')
                    ET.SubElement(caption_elem, 'number').text = fig['caption']['caption_label']
                    ET.SubElement(caption_elem, 'text').text = fig['caption']['caption_full']
    
    xml_string = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(xml_string)
    
    print(f"✅ XML created: {output_path}")


def generate_html_table(table_data, table_id):
    """Generate HTML table code."""
    html = f'<table id="{table_id}" border="1">\n'
    
    for row_idx, row_cells in enumerate(table_data['cells']):
        html += '  <tr>\n'
        tag = 'th' if row_idx == 0 else 'td'
        
        for cell_text in row_cells:
            html += f'    <{tag}>{cell_text}</{tag}>\n'
        
        html += '  </tr>\n'
    
    html += '</table>'
    
    return html


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main function."""
    print("\n" + "=" * 70)
    print("📚 PDF MEDIA EXTRACTOR v2.2")
    print("=" * 70)
    print("✨ Using PROVEN extraction logic")
    print("✨ Extracts: Raster + Vector figures")
    print("🚫 **NEW: Tables automatically detected & SKIPPED**")
    print("✨ Smart naming: Ch0001f01, Ch0001s0102f02")
    print("✨ Filters decorative images automatically")
    print("✨ Deduplicates images automatically")
    print("✨ pdftohtml-compatible coordinates")
    print("=" * 70)
    print()
    

    ap = argparse.ArgumentParser(description="PDF media extractor (raster + vector, tables skipped)")
    ap.add_argument("pdf", help="Path to the PDF file")
    ap.add_argument("--out", required=True, help="Path to write media.xml")
    ap.add_argument("--text-boundary", type=float, help="Caption search distance in points (default: 15)")
    ap.add_argument(
        "--use-temp",
        action="store_true",
        help="Store extracted media in a temporary directory (auto-cleaned unless --keep-temp).",
    )
    ap.add_argument(
        "--keep-temp",
        action="store_true",
        help="Keep the temporary directory when using --use-temp (implies non-cleanup).",
    )
    ap.add_argument(
        "--no-input",
        action="store_true",
        help="Run non-interactively (suppress prompts and use defaults).",
    )
    args = ap.parse_args()

    pdf_path = Path(args.pdf).resolve()
    xml_output = Path(args.out).resolve()

    if not pdf_path.exists() or not pdf_path.is_file():
        print(f"❌ Error: File not found: {pdf_path}")
        raise SystemExit(1)

    if pdf_path.suffix.lower() != ".pdf":
        print(f"❌ Error: Not a PDF: {pdf_path}")
        raise SystemExit(1)

    # Use the directory from the --out parameter for saving multimedia
    output_dir = os.path.dirname(str(xml_output)) or "."

    interactive = (not args.no_input) and sys.stdin.isatty()

    text_boundary_distance = args.text_boundary if args.text_boundary is not None else 15.0
    if args.text_boundary is None and interactive:
        print("\n🔤 Text Boundary Detection:")
        print("   Distance in points (default: 15)")
        boundary_input = input("   [15]: ").strip()
        if boundary_input:
            try:
                text_boundary_distance = float(boundary_input)
            except Exception:
                print("   Using default (15)")

    use_temp_folder = args.use_temp
    if not use_temp_folder:
        use_temp_folder = True  # Use temp folders by default

    try:
        all_items, temp_dir, multimedia_dir = extract_all_media(
            pdf_path, output_dir, text_boundary_distance, use_temp_folder
        )

        if not all_items:
            print("\n⚠️  No media found.")
            return

        create_xml_output(all_items, xml_output, pdf_path)

        print("\n" + "=" * 70)
        print("🎉 SUCCESS!")
        print("=" * 70)
        print(f"📁 Media assets: {multimedia_dir}")
        print(f"📄 XML: {xml_output}")
        print("=" * 70)

        if temp_dir:
            if args.keep_temp:
                print(f"\n📁 Temp folder retained: {temp_dir}")
            else:
                cleanup_temp_folder(temp_dir)

    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback

        traceback.print_exc()



if __name__ == "__main__":
    main()