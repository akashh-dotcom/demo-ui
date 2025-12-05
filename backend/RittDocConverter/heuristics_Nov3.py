from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median
from typing import Iterable, List, Optional, Sequence
from typing import Optional, Sequence
from lxml import etree

# Import word split fixer
try:  # Prefer absolute import when executed as a script
    from enhanced_word_split_fixer import fix_word_splits_enhanced
except ImportError:  # pragma: no cover - fallback when packaged differently
    try:
        from .enhanced_word_split_fixer import fix_word_splits_enhanced
    except ImportError:
        # Fallback if the helper is unavailable
        def fix_word_splits_enhanced(text: str) -> str:  # type: ignore[override]
            return text


# Import PyPDF2 for bookmark extraction (fallback to older name if needed)
try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        PdfReader = None

logger = logging.getLogger(__name__)

# Additional imports for new preprocessing functionality
from typing import Set, Tuple, Dict
from collections import defaultdict


def _f(x):
    try:
        return float(x)
    except Exception:
        return float("nan")

# --- compatibility: synthesize a "line" view from an entry ---
class _LineCompat:
    __slots__ = ("text", "font_size", "top", "left", "right", "bottom", "height", "el", "page_height", "page_width", "page_num")
    def __init__(self, text, font_size, top, left, el=None, page_height=None, page_width=None, page_num=None, right=None, bottom=None, height=None):
        self.text = text or ""
        self.font_size = font_size
        self.top = top
        self.left = left
        self.right = right
        self.bottom = bottom
        self.height = height
        self.el = el  # optional backref
        self.page_height = page_height
        self.page_width = page_width
        self.page_num = page_num

def _line_of(entry: dict) -> _LineCompat:
    # If the old path provided a real line, prefer it.
    if "line" in entry and entry["line"] is not None:
        ln = entry["line"]
        # assume ln has .text, .font_size, .top, .left
        return _LineCompat(
            getattr(ln, "text", ""),
            getattr(ln, "font_size", None),
            getattr(ln, "top", None),
            getattr(ln, "left", None),
            getattr(ln, "el", None),
            getattr(ln, "page_height", None),
            getattr(ln, "page_width", None),
            getattr(ln, "page_num", None),
            getattr(ln, "right", None),
            getattr(ln, "bottom", None),
            getattr(ln, "height", None),
        )
    # New path (preserve-flow entries): synthesize from the entry itself
    el = entry.get("el")
    right = entry.get("right", None)
    bottom = entry.get("bottom", None)
    height = entry.get("height", None)
    left = entry.get("left", None)
    top = entry.get("top", None)

    if el is not None:
        if height is None:
            hv = el.get("height")
            if hv is not None:
                try:
                    height = float(hv)
                except Exception:
                    pass
        if right is None:
            wv = el.get("width")
            if wv is not None and left is not None:
                try:
                    width_f = float(wv)
                    left_f = float(left)
                    right = left_f + width_f
                except Exception:
                    pass
        if bottom is None and top is not None and height is not None:
            try:
                bottom = float(top) + float(height)
            except Exception:
                pass

    return _LineCompat(
        entry.get("text", ""),
        entry.get("font_size", None),
        top,
        left,
        entry.get("el"),
        entry.get("page_height", None),
        entry.get("page_width", None),
        entry.get("page_num", None),
        right,
        bottom,
        height,
    )

def _collect_fontspecs(root):
    """Map fontspec id -> size (float)."""
    mp = {}
    for fs in root.findall(".//fontspec"):
        fid = fs.get("id")
        sz = fs.get("size")
        if not fid or not sz:
            continue
        try:
            mp[fid] = float(sz)
        except Exception:
            pass
    return mp

def _max_text_size(text_el, fontspec_map):
    """
    Return the best font size for a <text> node:
    - prefer explicit text_el.get('font_size') if present
    - else resolve text_el.get('font') via fontspecs
    - else check child <span font="..."> and take max
    """
    v = text_el.get("font_size")
    if v:
        try:
            return float(v)
        except Exception:
            pass

    f = text_el.get("font")
    if f and f in fontspec_map:
        return fontspec_map[f]

    best = None
    for sp in text_el.findall(".//span"):
        sf = sp.get("font")
        if sf and sf in fontspec_map:
            sz = fontspec_map[sf]
            best = sz if best is None or sz > best else best
    return best

# ============================================================================
# NEW: Global Coordinate Transformation Functions
# ============================================================================

def _add_global_coordinates(tree: etree._ElementTree) -> dict:
    """
    Add global coordinate metadata and transform all coordinates from page-relative to document-global.
    
    Returns:
        Metadata dict with page offsets and dimensions
    """
    pages = tree.findall(".//page")
    cumulative_height = 0.0
    page_metadata = []
    
    for page in pages:
        page_num = int(page.get("number", "0") or 0)
        page_height = float(page.get("height", "0") or 0)
        page_width = float(page.get("width", "0") or 0)
        
        # Store metadata
        page_metadata.append({
            "page_num": page_num,
            "offset_top": cumulative_height,
            "page_width": page_width,
            "page_height": page_height,
        })
        
        # Add global coordinates to all text elements
        for text_node in page.findall("text"):
            local_top = float(text_node.get("top", "0") or 0)
            local_left = float(text_node.get("left", "0") or 0)
            
            # Add global attributes
            text_node.set("global_top", str(cumulative_height + local_top))
            text_node.set("global_left", str(local_left))
            text_node.set("norm_top", str(local_top / page_height if page_height else 0))
            text_node.set("norm_left", str(local_left / page_width if page_width else 0))
        
        # Add global coordinates to images
        for image_node in page.findall("image"):
            local_top = float(image_node.get("top", "0") or 0)
            local_left = float(image_node.get("left", "0") or 0)
            
            image_node.set("global_top", str(cumulative_height + local_top))
            image_node.set("global_left", str(local_left))
            image_node.set("norm_top", str(local_top / page_height if page_height else 0))
            image_node.set("norm_left", str(local_left / page_width if page_width else 0))
        
        cumulative_height += page_height
    
    return {
        "total_pages": len(pages),
        "page_metadata": page_metadata,
        "total_height": cumulative_height,
    }


# ============================================================================
# NEW: Print Artifact Removal Functions
# ============================================================================

def _is_roman_numeral(text: str) -> bool:
    """Check if text is a Roman numeral (i, ii, iii, iv, v, etc.)"""
    if not text:
        return False
    return bool(re.match(r'^[ivxlcdm]+$', text, re.IGNORECASE))


def _is_sequential_pattern(texts: Set[str]) -> bool:
    """
    Check if texts follow a sequential pattern like page numbers.
    Returns True for page number patterns, False for content.
    """
    if not texts or len(texts) < 2:
        return False
    
    # Don't mark chapter/section headings as sequential (they're content!)
    text_lower = [t.lower() for t in texts]
    content_keywords = ["chapter", "section", "unit", "lesson", "appendix", "part"]
    if any(keyword in t for t in text_lower for keyword in content_keywords):
        return False
    
    # Check for numeric sequences
    digits = []
    for text in texts:
        nums = re.findall(r'\\d+', text)
        if nums:
            digits.extend(int(n) for n in nums)
    
    if len(digits) >= 2:
        sorted_digits = sorted(set(digits))
        if len(sorted_digits) >= 2:
            span = sorted_digits[-1] - sorted_digits[0]
            if span <= len(sorted_digits) * 3:
                return True
    
    # Check for roman numerals
    if len(texts) >= 2 and all(_is_roman_numeral(t) for t in texts):
        return True
    
    # Check for "Page X" patterns
    page_pattern = re.compile(r'^(page\\s+)?\\d+$', re.IGNORECASE)
    if len(texts) >= 2 and all(page_pattern.match(t) for t in texts):
        return True
    
    return False


def _remove_duplicate_text(page: etree._Element) -> int:
    """
    Remove duplicate text nodes at the same position.
    Returns count of duplicates removed.
    """
    text_nodes = list(page.findall("text"))
    if not text_nodes:
        return 0
    
    position_groups = defaultdict(list)
    
    for node in text_nodes:
        top = node.get("top")
        left = node.get("left")
        text = "".join(node.itertext()).strip()
        width = node.get("width")
        height = node.get("height")
        
        key = (top, left, text, width, height)
        position_groups[key].append(node)
    
    removed_count = 0
    for key, nodes in position_groups.items():
        if len(nodes) > 1:
            for duplicate in nodes[1:]:
                parent = duplicate.getparent()
                if parent is not None:
                    parent.remove(duplicate)
                    removed_count += 1
    
    return removed_count


def _detect_repeated_text_patterns(tree: etree._ElementTree) -> Tuple[Set[str], Set[str]]:
    """
    Find text that repeats in the same position across multiple pages.
    
    Returns:
        Tuple of (repeated_patterns, copyright_patterns)
        - repeated_patterns: Text to filter out everywhere
        - copyright_patterns: Copyright text (keep first occurrence only)
    """
    position_text = defaultdict(list)
    copyright_patterns = set()
    
    for page in tree.findall(".//page"):
        page_num = int(page.get("number", "0") or 0)
        page_height = float(page.get("height", "0") or 0)
        page_width = float(page.get("width", "0") or 0)
        
        if not page_height or not page_width:
            continue
        
        for text_node in page.findall("text"):
            text = "".join(text_node.itertext()).strip()
            if not text or len(text) < 2:
                continue
            
            # Check for copyright patterns
            if text.lower().startswith("copyright") or "©" in text or "(c)" in text.lower():
                copyright_patterns.add(text)
            
            top = float(text_node.get("top", "0") or 0)
            left = float(text_node.get("left", "0") or 0)
            norm_top = round(top / page_height, 2)
            norm_left = round(left / page_width, 2)
            
            in_header_footer_zone = norm_top < 0.12 or norm_top > 0.88
            position_text[(norm_top, norm_left)].append((text, page_num, in_header_footer_zone))
    
    repeated_patterns = set()
    
    for position, occurrences in position_text.items():
        if len(occurrences) < 3:
            continue
        
        hf_occurrences = [(text, page) for text, page, in_zone in occurrences if in_zone]
        unique_texts = set(text for text, _, _ in occurrences)
        
        # Exact repetition
        if len(unique_texts) == 1 and len(hf_occurrences) >= 3:
            text = list(unique_texts)[0]
            if len(text) <= 100:
                # Don't add copyright to repeated_patterns (we handle it separately)
                if not (text.lower().startswith("copyright") or "©" in text):
                    repeated_patterns.add(text)
        
        # Sequential pattern (page numbers, etc.)
        elif len(unique_texts) >= 2 and _is_sequential_pattern(unique_texts):
            if len(hf_occurrences) >= 2:
                repeated_patterns.update(unique_texts)
    
    return repeated_patterns, copyright_patterns


def _is_header_footer_enhanced(line, repeated_patterns: Set[str], 
                                 copyright_patterns: Set[str], 
                                 seen_copyright: Set[str]) -> bool:
    
    ph = getattr(line, "page_height", None)
    lt = getattr(line, "top", None)
    if ph is None or lt is None:
        return False
    """
    Enhanced header/footer detection.
    Keeps first occurrence of copyright, removes repeats.
    
    Args:
        line: Line object
        repeated_patterns: Patterns to always filter
        copyright_patterns: Copyright text patterns
        seen_copyright: Set tracking which copyright we've already seen
    """
    text = line.text.strip()
    if not text:
        return True
    
    # Check if this is a copyright pattern
    if text in copyright_patterns:
        # Keep first occurrence (on early pages)
        if line.page_num is not None and line.page_num <= 5 and text not in seen_copyright:
            seen_copyright.add(text)
            return False  # Keep it
        else:
            return True  # Remove repeated copyright
    
    # Check if in repeated patterns
    if text in repeated_patterns:
        return True
    
    # ========== POSITION-BASED DETECTION ==========
    
    # Simple numeric page numbers
    if len(text) <= 4 and text.isdigit():
        if line.page_height and (
            line.top < line.page_height * 0.08 or line.top > line.page_height * 0.9
        ):
            return True
    
    # Roman numerals as page numbers
    if _is_roman_numeral(text) and len(text) <= 5:
        if line.page_height and (
            line.top < line.page_height * 0.08 or line.top > line.page_height * 0.9
        ):
            return True
    
    # ========== PATTERN-BASED DETECTION ==========
    
    # Print production artifacts
    production_patterns = [
        r'\d{3,}-\d{3,}.*\.indd',
        r'\d{3,}-\d{3,}.*\.qxd',
        r'\d{1,2}/\d{1,2}/\d{2,4}\s+\d{1,2}:\d{2}',
        r'^\d{4}-\d{2}-\d{2}$',
        r'^\d{2}-\d{2}-\d{4}$',
    ]
    
    for pattern in production_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    
    # Continuation markers
    continuation_patterns = [
        r'\(continued\)',
        r'continued on',
        r'continued from',
        r'\(cont\.\)',
        r'\(cont\)',
    ]
    
    for pattern in continuation_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    
    # "Page X of Y"
    if re.match(r'^page\s+\d+(\s+of\s+\d+)?$', text, re.IGNORECASE):
        return True
    
    # Short text at page edges
    if len(text) <= 25:
        if line.page_height and (
            line.top < line.page_height * 0.10 or line.top > line.page_height * 0.88
        ):
            if line.page_width and (
                line.left < line.page_width * 0.15 or line.left > line.page_width * 0.80
            ):
                if line.font_size is not None and line.font_size < 16:
                    return True
    
    # Isolated numbers at bottom
    if text.isdigit() and len(text) <= 4:
        if line.page_height and line.top > line.page_height * 0.85:
            return True
    
    # Publisher/ISBN info at bottom
    publisher_patterns = [
        r'isbn[-:\s]*\d',
        r'published by',
        r'all rights reserved',
        r'printed in',
    ]
    
    for pattern in publisher_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            if line.page_height and line.top > line.page_height * 0.80:
                return True
    
    return False


def _preprocess_xml_for_ebook(tree: etree._ElementTree) -> Tuple[dict, Set[str], Set[str]]:
    """
    Master preprocessing function for ebook production.
    
    Returns:
        Tuple of (statistics, repeated_patterns, copyright_patterns)
    """
    stats = {
        "duplicates_removed": 0,
        "repeated_patterns_found": 0,
        "copyright_patterns_found": 0,
        "total_pages": 0,
    }
    
    # Phase 1: Remove duplicates
    logger.info("📄 Phase 1: Removing duplicate/layered text...")
    for page in tree.findall(".//page"):
        stats["total_pages"] += 1
        duplicates = _remove_duplicate_text(page)
        stats["duplicates_removed"] += duplicates
    
    if stats["duplicates_removed"] > 0:
        logger.info(f"   ✅ Removed {stats['duplicates_removed']} duplicate text nodes")
    else:
        logger.info(f"   ✓ No duplicates found")
    
    # Phase 2: Detect repeated patterns
    logger.info("🔍 Phase 2: Detecting repeated patterns...")
    repeated_patterns, copyright_patterns = _detect_repeated_text_patterns(tree)
    stats["repeated_patterns_found"] = len(repeated_patterns)
    stats["copyright_patterns_found"] = len(copyright_patterns)
    
    if repeated_patterns:
        logger.info(f"   ✅ Found {len(repeated_patterns)} repeated patterns to remove")
        for pattern in sorted(list(repeated_patterns)[:5]):
            logger.info(f"      • {pattern}")
        if len(repeated_patterns) > 5:
            logger.info(f"      ... and {len(repeated_patterns) - 5} more")
    
    if copyright_patterns:
        logger.info(f"   ℹ️  Found {len(copyright_patterns)} copyright patterns (keeping first occurrence)")
    
    return stats, repeated_patterns, copyright_patterns




@dataclass
class TextSegment:
    text: str
    left: float
    width: float
    font_size: float


@dataclass
class Line:
    page_num: int
    page_width: float
    page_height: float
    top: float
    left: float
    height: float
    font_size: float
    text: str = ""
    segments: List[TextSegment] = field(default_factory=list)
    column_index: Optional[int] = None

    @property
    def right(self) -> float:
        return max((seg.left + seg.width) for seg in self.segments) if self.segments else self.left

    @property
    def column_positions(self) -> List[float]:
        """Return the canonical left positions for text columns within the line."""

        positions: List[float] = []
        tolerance = 6.0
        for segment in sorted(self.segments, key=lambda s: s.left):
            placed = False
            for idx, value in enumerate(positions):
                if abs(value - segment.left) <= tolerance:
                    # Smooth the column position to absorb minor jitter
                    positions[idx] = (positions[idx] + segment.left) / 2.0
                    placed = True
                    break
            if not placed:
                positions.append(segment.left)
        return sorted(positions)


def _clean_join(segments: Sequence[TextSegment]) -> str:
    parts: List[str] = []
    for segment in sorted(segments, key=lambda s: s.left):
        text = segment.text
        if not text:
            continue
        if parts and not parts[-1].endswith(" ") and not text.startswith(" "):
            parts.append(" ")
        parts.append(text)
    # Apply word split fixer to handle PDF ligature issues
    result = "".join(parts)
    return fix_word_splits_enhanced(result)


def _parse_lines(page: etree._Element, fontspecs: dict) -> List[Line]:
    nodes = sorted(
        [
            (
                float(node.get("top", "0")),
                float(node.get("left", "0")),
                node,
            )
            for node in page.findall("text")
        ],
        key=lambda item: (item[0], item[1]),
    )

    lines: List[Line] = []
    tolerance = 2.0
    for top, left, node in nodes:
        content = "".join(node.itertext())
        if not content.strip():
            continue
        font_id = node.get("font")
        fontspec = fontspecs.get(font_id, {})
        font_size = float(fontspec.get("size", node.get("size", 0)) or 0)
        width = float(node.get("width", "0"))
        height = float(node.get("height", "0"))
        segment = TextSegment(text=content, left=left, width=width, font_size=font_size)

        if lines and abs(lines[-1].top - top) <= tolerance:
            line = lines[-1]
            line.segments.append(segment)
            line.left = min(line.left, left)
            line.height = max(line.height, height)
            if segment.font_size:
                line.font_size = max(line.font_size, segment.font_size)
        else:
            lines.append(
                Line(
                    page_num=int(page.get("number", "0") or 0),
                    page_width=float(page.get("width", "0") or 0),
                    page_height=float(page.get("height", "0") or 0),
                    top=top,
                    left=left,
                    height=height,
                    font_size=font_size,
                    segments=[segment],
                )
            )

        # --- finalize lines safely ---
    valid_lines = []
    for line in lines:
        # join segments into text
        line.text = _clean_join(line.segments)
        # collect sizes (skip Nones)
        sizes = [seg.font_size for seg in line.segments if seg.font_size is not None]
        # drop lines with no segments or no usable sizes
        if not line.segments or not sizes:
            continue
        # safe max
        line.font_size = max(sizes)
        valid_lines.append(line)

    # return only lines that have visible text
    return [ln for ln in valid_lines if ln.text and ln.text.strip()]


def _detect_page_columns(lines: Sequence[Line]) -> List[float]:
    """
    Enhanced column detection with tighter thresholds for index pages.
    """
    if not lines:
        return []
    
    # Check if this looks like an index page
    first_lines = [line.text.lower() for line in lines[:5]]
    has_index_keyword = any('index' in text or 'glossary' in text for text in first_lines)
    lines_with_numbers = sum(1 for line in lines if re.search(r'\d+', line.text))
    number_ratio = lines_with_numbers / len(lines) if lines else 0
    is_index_page = has_index_keyword or number_ratio > 0.5
    
    if is_index_page:
        tolerance = 15.0
        min_samples = 2
        logger.info(f"🔖 Detected index/glossary page")
    else:
        tolerance = 25.0
        min_samples = 3
    
    page_width = max((line.page_width for line in lines), default=0.0)
    bins: List[dict] = []
    
    for line in lines:
        if line.right is None or line.left is None:
            continue
        width = line.right - line.left
        if page_width and width >= page_width * 0.65:
            continue
        if width < 20:
            continue
        position = line.left
        for bin_ in bins:
            if abs(bin_["pos"] - position) <= tolerance:
                bin_["pos"] = (bin_["pos"] * bin_["count"] + position) / (bin_["count"] + 1)
                bin_["count"] += 1
                break
        else:
            bins.append({"pos": position, "count": 1})
    
    columns = [bin_["pos"] for bin_ in bins if bin_["count"] >= min_samples]
    columns.sort()
    
    if len(columns) <= 1:
        return []
    
    if page_width:
        span = columns[-1] - columns[0]
        min_span = max(120.0, page_width * 0.25)
        if span < min_span:
            return []
    
    filtered: List[float] = []
    for pos in columns:
        if not filtered:
            filtered.append(pos)
            continue
        if all(abs(pos - existing) > tolerance for existing in filtered):
            filtered.append(pos)
    
    result = filtered if len(filtered) >= 2 else []
    if result:
        logger.info(f"📊 Detected {len(result)} columns at positions: {[f'{p:.1f}' for p in result]}")
    return result

def _assign_column(line: Line, columns: Sequence[float]) -> Optional[int]:
    """Assign line to column using center point."""
    if not columns:
        return None
    if line.right is None or line.left is None:
        return None
    width = line.right - line.left
    page_width = line.page_width or 0.0
    if page_width and width >= page_width * 0.65:
        return None
    line_center = line.left + (width / 2)
    nearest = min(range(len(columns)), key=lambda idx: abs(columns[idx] - line_center))
    if abs(columns[nearest] - line.left) > 50.0:
        return None
    return nearest

def _emit_column_chunk(chunk: Sequence[Line], column_count: int) -> List[Line]:
    ordered: List[Line] = []
    groups: List[List[Line]] = [[] for _ in range(column_count)]
    for line in chunk:
        if line.column_index is None:
            continue
        groups[line.column_index].append(line)
    for group in groups:
        group.sort(key=lambda ln: ln.top)
        ordered.extend(group)
    return ordered


def _reorder_lines_for_columns(lines: Sequence[Line]) -> List[Line]:
    """Enhanced column reordering ensuring column-by-column reading."""
    columns = _detect_page_columns(lines)
    if not columns:
        for line in lines:
            line.column_index = None
        return list(lines)
    
    for line in lines:
        line.column_index = _assign_column(line, columns)
    
    column_groups: List[List[Line]] = [[] for _ in range(len(columns))]
    full_width_lines: List[Line] = []
    
    for line in lines:
        if line.column_index is None:
            full_width_lines.append(line)
        else:
            column_groups[line.column_index].append(line)
    
    for group in column_groups:
        group.sort(key=lambda ln: ln.top)
    
    reordered: List[Line] = []
    for col_idx, group in enumerate(column_groups):
        if group:
            logger.debug(f"  Column {col_idx}: {len(group)} lines")
            reordered.extend(group)
    
    if full_width_lines:
        if full_width_lines[0].top < 150:
            reordered = full_width_lines + reordered
        else:
            reordered.extend(full_width_lines)
    
    if len(columns) > 1:
        logger.info(f"✅ Reordered {len(lines)} lines into {len(columns)} columns (column-by-column)")
    return reordered


def _is_front_matter_heading(text: str, page_num: Optional[int]) -> bool:
    """Detect if this is front matter (not a chapter)."""
    text_lower = text.lower().strip()
    chapter_pattern = r'\bchapter\s+\d+\b'
    if re.search(chapter_pattern, text_lower):
        return False
    if page_num is not None and page_num < 30:
        front_matter_keywords = [
            'index', 'table of contents', 'contents in brief', 'detailed contents',
            'contributors', 'reviewers', 'acknowledgments', 'acknowledgements',
            'preface', 'foreword', 'introduction', 'about the author',
            'about this book', 'how to use', 'key to', 'nursing diagnoses',
            'essential terminology', 'contents on', 'davis plus',
        ]
        if any(keyword in text_lower for keyword in front_matter_keywords):
            logger.debug(f"✅ Identified as front matter: {text[:50]}")
            return True
        if len(text) < 200:
            logger.debug(f"✅ Early page heading = front matter: {text[:50]}")
            return True
    return False

def _line_gap(prev_line: Line, next_line: Line) -> float:
    return next_line.top - prev_line.top


# OLD _is_header_footer function removed - replaced with _is_header_footer_enhanced above


def _is_header_footer(line: Line) -> bool:
    """
    Basic header/footer detection for internal helper functions.
    For main filtering, use _is_header_footer_enhanced instead.
    """
    text = line.text.strip()
    if not text:
        return True
    
    # Simple page numbers at top/bottom
    if len(text) <= 4 and text.isdigit():
        if line.page_height and (
            line.top < line.page_height * 0.08 or line.top > line.page_height * 0.9
        ):
            return True
    
    # Very short text at edges
    if len(text) <= 10:
        if line.page_height and (
            line.top < line.page_height * 0.08 or line.top > line.page_height * 0.9
        ):
            return True
    
    return False

def _body_font_size(lines: Sequence[Line]) -> float:
    if not lines:
        return 12.0
    samples = [line.font_size for line in lines if len(line.text.strip()) >= 30 and line.font_size]
    if not samples:
        samples = [line.font_size for line in lines if line.font_size]
    if not samples:
        return 12.0
    return float(median(samples))


CHAPTER_KEYWORD_RE = re.compile(r"\bchapter\b", re.IGNORECASE)
CHAPTER_RE = re.compile(r"^(chapter|chap\.|unit|lesson|module)\b", re.IGNORECASE)
TOC_RE = re.compile(r"^table of contents$", re.IGNORECASE)
INDEX_RE = re.compile(r"^index\b", re.IGNORECASE)
SECTION_RE = re.compile(r"^(section|sec\.|part)\b", re.IGNORECASE)
CAPTION_RE = re.compile(r"^(figure|fig\.|table)\s+\d+", re.IGNORECASE)
ORDERED_LIST_RE = re.compile(r"^(?:\(?\d+[\.\)]|[A-Za-z][\.)])\s+")

HEADING_FONT_TOLERANCE = 1.0


def _get_bookmark_page_number(bookmark, reader) -> Optional[int]:
    """
    Try multiple methods to extract page number from a bookmark.
    
    Different PDFs and PyPDF2 versions store bookmark destinations differently.
    This function tries all known methods to maximize compatibility.
    
    Args:
        bookmark: Bookmark object from PyPDF2
        reader: PdfReader instance
    
    Returns:
        Page number (0-indexed) or None if not found
    """
    # Method 1: Try the .page attribute (most common)
    try:
        if hasattr(bookmark, 'page') and bookmark.page is not None:
            return reader.pages.index(bookmark.page)
    except Exception:
        pass
    
    # Method 2: Try accessing as dictionary with '/Page' key
    try:
        if isinstance(bookmark, dict) and '/Page' in bookmark:
            page_obj = bookmark['/Page']
            return reader.pages.index(page_obj)
    except Exception:
        pass
    
    # Method 3: Try get_destination() method (older PyPDF2 versions)
    try:
        if hasattr(bookmark, 'get_destination'):
            dest = bookmark.get_destination()
            if dest and hasattr(dest, 'page'):
                return reader.pages.index(dest.page)
    except Exception:
        pass
    
    # Method 4: Try dictionary-style access for destination
    try:
        if hasattr(bookmark, '__getitem__'):
            dest = bookmark['/Dest']
            if dest:
                # Destination can be an array [page, /XYZ, left, top, zoom]
                if isinstance(dest, list) and len(dest) > 0:
                    page_ref = dest[0]
                    return reader.pages.index(page_ref)
    except Exception:
        pass
    
    # Method 5: Try named destinations
    try:
        if hasattr(reader, 'named_destinations'):
            # Some bookmarks reference named destinations
            if hasattr(bookmark, 'title'):
                for name, dest in reader.named_destinations.items():
                    if hasattr(dest, 'page'):
                        # This is a guess - named destinations don't always match titles
                        return reader.pages.index(dest.page)
    except Exception:
        pass
    
    return None

"""
def _extract_bookmark_page_ranges(pdf_path: str) -> Optional[List[dict]]:
"""
"""
    Extract level 0 (top-level) bookmarks from PDF with their page ranges.
    
    This is the PRIMARY method for chapter detection - only falls back to 
    heuristics if bookmarks are not available.
    
    Args:
        pdf_path: Path to the PDF file
    
    Returns:
        List of bookmark dictionaries with 'title', 'start_page', 'end_page'
        Returns None if bookmarks cannot be extracted
"""
"""
    if PdfReader is None:
        logger.info("📚 PyPDF2/pypdf not available - skipping bookmark extraction")
        return None
    
    try:
        reader = PdfReader(pdf_path)
        outlines = reader.outline
        total_pages = len(reader.pages)
        
        if not outlines:
            logger.info("📚 No bookmarks found in PDF - will use heuristic detection")
            return None
        
        # Collect level 0 (top-level) bookmarks only
        level_0_bookmarks = []
        
        for item in outlines:
            # Level 0 bookmarks are NOT nested in lists
            # If item is a list, it contains nested sub-bookmarks - skip it
            if isinstance(item, list):
                continue
            
            # This is a level 0 bookmark
            if not hasattr(item, 'title'):
                continue
                
            title = item.title
            
            # Get the starting page number using robust method
            start_page = _get_bookmark_page_number(item, reader)
            
            if start_page is not None:
                level_0_bookmarks.append({
                    'title': title,
                    'start_page': start_page,  # 0-indexed
                })
            else:
                logger.warning(f"Could not extract page for bookmark '{title}': no valid page reference found")
                continue
        
        if not level_0_bookmarks:
            logger.info("📚 No valid level 0 bookmarks found - will use heuristic detection")
            return None
        
        # ═══════════════════════════════════════════════════════════════
        # FILTER: Only keep bookmarks that look like actual chapters
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"📚 Found {len(level_0_bookmarks)} level 0 bookmarks total")
        
        # Filter to only keep bookmarks starting with "Chapter" (case-insensitive)
        chapter_bookmarks = []
        non_chapter_bookmarks = []
        
        for bm in level_0_bookmarks:
            title = bm['title'].strip()
            # Check if this looks like a chapter heading
            if re.match(r'^Chapter\s+\d+', title, re.IGNORECASE):
                chapter_bookmarks.append(bm)
            else:
                non_chapter_bookmarks.append(title)
        
        if not chapter_bookmarks:
            logger.warning("⚠️  No chapter bookmarks found after filtering")
            logger.warning("   (Looking for bookmarks starting with 'Chapter N:')")
            logger.warning("   Falling back to heuristic chapter detection")
            return None
        
        logger.info(f"✅ Filtered to {len(chapter_bookmarks)} CHAPTER bookmarks only")
        logger.info(f"   (Ignored {len(non_chapter_bookmarks)} non-chapter bookmarks)")
        
        # Show a few examples of what was filtered out
        if non_chapter_bookmarks:
            logger.info("   📝 Examples of ignored bookmarks:")
            for title in non_chapter_bookmarks[:5]:
                logger.info(f"      • {title}")
            if len(non_chapter_bookmarks) > 5:
                logger.info(f"      ... and {len(non_chapter_bookmarks) - 5} more")
        
        # Use the filtered chapter bookmarks from here on
        level_0_bookmarks = chapter_bookmarks
        
        # Calculate ending pages
        # Each bookmark ends where the next one starts (minus 1)
        for i in range(len(level_0_bookmarks)):
            if i < len(level_0_bookmarks) - 1:
                # Not the last bookmark - ends where next one starts
                level_0_bookmarks[i]['end_page'] = level_0_bookmarks[i + 1]['start_page'] - 1
            else:
                # Last bookmark - ends at the end of the document
                level_0_bookmarks[i]['end_page'] = total_pages - 1
        
        logger.info(f"✅ Successfully extracted {len(level_0_bookmarks)} bookmarks from PDF")
        for bm in level_0_bookmarks:
            logger.info(f"   📖 '{bm['title']}': pages {bm['start_page']+1}-{bm['end_page']+1}")
        
        return level_0_bookmarks
    
    except Exception as e:
        logger.warning(f"❌ Error extracting bookmarks from PDF: {e}")
        logger.info("📚 Will use heuristic detection instead")
        return None
"""

def _create_blocks_from_bookmarks(
    bookmark_ranges: List[dict],
    pdfxml_path: str,
    config: dict
) -> Optional[List[dict]]:
    """
    Create chapter blocks based on PDF bookmarks.
    
    This converts bookmark page ranges into the block structure expected
    by the rest of the pipeline.
    
    Args:
        bookmark_ranges: List of bookmarks with start_page and end_page
        pdfxml_path: Path to the PDF XML file (to get page dimensions)
        config: Configuration dict
    
    Returns:
        List of blocks with chapter labels, or None if conversion fails
    """
    try:
        tree = etree.parse(pdfxml_path)
        root = tree.getroot()
        
        # Build a mapping of page numbers to page elements (for dimensions)
        pages = {}
        for page in root.findall(".//page"):
            page_num = int(page.get("number", "0"))
            pages[page_num] = page
        
        blocks = []
        
        for bm in bookmark_ranges:
            title = bm['title']
            start_page = bm['start_page']
            end_page = bm['end_page']
            
            # Get page dimensions from the first page of this chapter
            page_elem = pages.get(start_page)
            if page_elem is not None:
                page_width = float(page_elem.get("width", "612") or "612")
                page_height = float(page_elem.get("height", "792") or "792")
            else:
                page_width = 612.0
                page_height = 792.0
            
            # Create a chapter block
            # Note: We use page_num as the start page where this chapter begins
            block = {
                "label": "chapter",
                "text": title,
                "page_num": start_page,  # 0-indexed page number
                "bbox": {
                    "top": 0.0,
                    "left": 0.0,
                    "width": page_width,
                    "height": 72.0,  # Approximate heading height
                },
                "font_size": 18.0,  # Default chapter heading size
                "bookmark_based": True,  # Flag to indicate this came from bookmarks
                "end_page": end_page,  # Store the ending page for reference
            }
            blocks.append(block)
        
        logger.info(f"✅ Created {len(blocks)} chapter blocks from bookmarks")
        return blocks
    
    except Exception as e:
        logger.error(f"❌ Error creating blocks from bookmarks: {e}")
        return None


def _inject_bookmark_chapters(blocks: List[dict], bookmark_ranges: List[dict]) -> List[dict]:
    """
    Inject bookmark-based chapter headings into the blocks at appropriate positions.
    
    This function:
    1. Removes heuristically-detected chapter headings (to avoid duplicates)
    2. Inserts bookmark-based chapter headings at the correct page numbers
    3. Preserves all other content blocks (paragraphs, figures, etc.)
    
    Args:
        blocks: List of all content blocks (from heuristic extraction)
        bookmark_ranges: List of bookmark dictionaries with title, start_page, end_page
    
    Returns:
        Updated list of blocks with bookmark-based chapter headings
    """
    logger.info(f"🔄 Injecting {len(bookmark_ranges)} bookmark-based chapters into {len(blocks)} blocks")
    
    # Step 1: Remove heuristically-detected chapter headings
    # Keep everything else (paragraphs, sections, figures, etc.)
    filtered_blocks = []
    removed_chapters = 0
    
    for block in blocks:
        if block.get("label") == "chapter":
            # Remove heuristic chapter headings - we'll replace with bookmark-based ones
            removed_chapters += 1
            logger.debug(f"   Removing heuristic chapter: '{block.get('text', '')[:50]}'")
            continue
        filtered_blocks.append(block)
    
    if removed_chapters > 0:
        logger.info(f"   📝 Removed {removed_chapters} heuristically-detected chapter headings")
    
    # Step 2: Create chapter heading blocks from bookmarks
    bookmark_chapter_blocks = []
    
    for bm in bookmark_ranges:
        title = bm['title']
        start_page = bm['start_page']
        end_page = bm['end_page']
        
        # Create a chapter heading block
        chapter_block = {
            "label": "chapter",
            "text": title,
            "page_num": start_page,  # 0-indexed
            "bbox": {
                "top": 0.0,
                "left": 0.0,
                "width": 612.0,
                "height": 72.0,
            },
            "font_size": 18.0,  # Default chapter heading size
            "bookmark_based": True,  # Flag to indicate source
            "end_page": end_page,  # Store ending page
        }
        bookmark_chapter_blocks.append(chapter_block)
    
    # Step 3: Merge blocks - insert chapter headings at correct positions
    # Sort all blocks by page number first
    all_blocks_to_sort = filtered_blocks + bookmark_chapter_blocks
    
    # Sort by page number, then by vertical position (top)
    # Chapter headings should come first on their page (top=0.0)
    sorted_blocks = sorted(
        all_blocks_to_sort,
        key=lambda b: (
            b.get("page_num", 0),
            b.get("bbox", {}).get("top", 0.0)
        )
    )
    
    logger.info(f"   ✅ Merged {len(filtered_blocks)} content blocks with {len(bookmark_chapter_blocks)} bookmark chapters")
    logger.info(f"   📖 Result: {len(sorted_blocks)} total blocks")
    
    return sorted_blocks


def _looks_like_book_title(line: Line, body_size: float) -> bool:
    # text = line.text.strip()
    text = (getattr(line, "text", "") or "").strip()
    # Safely get page_num; if absent, treat as large (so it won't match)
    page_num = getattr(line, "page_num", None)
    if not text or (page_num is not None and page_num > 2):
        return False
    if line.top > line.page_height * 0.45 if line.page_height else line.top > 400:
        return False
    if line.font_size is not None and line.font_size >= body_size + 6:
        return True
    if line.font_size is not None and line.font_size >= body_size + 4 and len(text.split()) <= 12:
        return True
    return False


def _collect_multiline_book_title(
    entries: Sequence[dict], start_idx: int, body_size: float
) -> tuple[list[Line], int]:
    """Collect consecutive lines that belong to the book title block."""

    first_entry = entries[start_idx]
    first_line = _line_of(first_entry)
    heading_lines = [first_line]
    lookahead_idx = start_idx + 1

    while lookahead_idx < len(entries):
        next_entry = entries[lookahead_idx]
        if next_entry.get("kind") not in ("line", "text"):
            break
        next_line = _line_of(next_entry)
        if _is_header_footer(next_line):
            break
        text = next_line.text.strip()
        if not text:
            break
        if text.lower() == "table of contents":
            break

        same_page = (
            next_line.page_num is not None and 
            first_line.page_num is not None and 
            next_line.page_num == first_line.page_num
        )
        similar_font = False
        if first_line.font_size and next_line.font_size:
            similar_font = (
                abs(next_line.font_size - first_line.font_size) <= HEADING_FONT_TOLERANCE
            )

        if same_page and (similar_font or _looks_like_book_title(next_line, body_size)):
            heading_lines.append(next_line)
            lookahead_idx += 1
            continue

        break

    return heading_lines, lookahead_idx
def _has_heading_font(line: Line, body_size: float) -> bool:
    if not line.font_size:
        return False
    return line.font_size >= body_size + 2.0


def _looks_like_chapter_heading(line: Line, body_size: float) -> bool:
    text = line.text.strip()
    if not text:
        return False
    if CHAPTER_KEYWORD_RE.search(text):
        return _has_heading_font(line, body_size)
    if CHAPTER_RE.match(text):
        return _has_heading_font(line, body_size)
    if not _has_heading_font(line, body_size):
        return False
    if line.page_height and line.top <= line.page_height * 0.45:
        return True
    if len(text.split()) <= 10:
        return True
    return False


def _collect_multiline_heading(
    entries: Sequence[dict], start_idx: int, body_size: float
) -> tuple[list[Line], int]:
    first_entry = entries[start_idx]
    first_line = _line_of(first_entry)
    base_font = first_line.font_size
    heading_lines = [first_line]
    lookahead_idx = start_idx + 1

    while lookahead_idx < len(entries):
        next_entry = entries[lookahead_idx]
        if next_entry.get("kind") not in ("line", "text"):
            break
        next_line = _line_of(next_entry)
        if _is_header_footer(next_line):
            break
        text = next_line.text.strip()
        if not text:
            break
        if base_font and next_line.font_size:
            if abs(next_line.font_size - base_font) <= HEADING_FONT_TOLERANCE:
                heading_lines.append(next_line)
                lookahead_idx += 1
                continue
        break

    return heading_lines, lookahead_idx


def _is_index_heading(line: Line, body_size: float) -> bool:
    text = line.text.strip()
    if not text:
        return False
    if not INDEX_RE.match(text):
        return False
    return _has_heading_font(line, body_size)


def _looks_like_section_heading(line: Line, body_size: float) -> bool:
    text = line.text.strip()
    if not text:
        return False
    if SECTION_RE.match(text):
        return True
    if line.font_size is not None and line.font_size >= body_size + 1.5 and len(text.split()) <= 14:
        return True
    if len(text.split()) <= 8 and text.isupper() and line.font_size is not None and line.font_size >= body_size:
        return True
    return False


def _looks_like_caption(line: Line) -> bool:
    text = line.text.strip()
    if not text:
        return False
    if CAPTION_RE.match(text):
        return True
    return False


def _is_list_item(text: str, mapping: dict) -> tuple[bool, str, str]:
    stripped = text.lstrip()
    pdf_cfg = mapping.get("pdf", {})
    markers = pdf_cfg.get("list_markers", [])
    for marker in markers:
        if stripped.startswith(marker):
            remainder = stripped[len(marker) :].strip()
            return True, "itemized", remainder or text.strip()
    if ORDERED_LIST_RE.match(stripped):
        remainder = ORDERED_LIST_RE.sub("", stripped, count=1).strip()
        return True, "ordered", remainder or stripped
    return False, "", text


def _should_merge(prev_line: Line, next_line: Line, body_size: float) -> bool:
    if prev_line.page_num != next_line.page_num:
        return False
    vertical_gap = _line_gap(prev_line, next_line)
    if prev_line.height is None or next_line.height is None:
        return False
    if vertical_gap > max(prev_line.height, next_line.height) * 1.9 + 2:
        return False
    if prev_line.left is None or next_line.left is None:
        return False
    indent_diff = abs(prev_line.left - next_line.left)
    if indent_diff > 60 and vertical_gap > min(prev_line.height, next_line.height) * 1.1:
        return False
    # Treat significant negative indent as new paragraph (hanging indent)
    if next_line.left - prev_line.left < -80:
        return False
    return True


from typing import Optional, Sequence

def _finalize_paragraph(lines: Sequence, default_font_size: Optional[float] = None) -> Optional[dict]:
    """
    Build a paragraph block from a list of line objects.
    Robust to empty / degenerate lines. Returns None if nothing usable.
    """
    if not lines:
        return None

    # keep lines that actually have visible text
    lines = [ln for ln in lines if getattr(ln, "text", "") and ln.text.strip()]
    if not lines:
        return None

    # aggregate font sizes safely
    sizes = [getattr(ln, "font_size", None) for ln in lines if getattr(ln, "font_size", None) is not None]
    para_font_size = max(sizes) if sizes else (default_font_size if default_font_size is not None else 0.0)

    # join text (preserve line breaks minimally)
    text = " ".join(ln.text.strip() for ln in lines).strip()
    # if you have a better de-hyphenation, keep it; otherwise ignore failure
    try:
        text = fix_word_splits_enhanced(text)
    except Exception:
        pass

    # compute bbox if coords exist
    def _f(v):
        try:
            return float(v)
        except Exception:
            return float("nan")

    xs0 = [_f(getattr(ln, "left", None))   for ln in lines if getattr(ln, "left",   None) is not None]
    ys0 = [_f(getattr(ln, "top", None))    for ln in lines if getattr(ln, "top",    None) is not None]
    xs1 = [_f(getattr(ln, "right", None))  for ln in lines if getattr(ln, "right",  None) is not None]
    ys1 = [_f(getattr(ln, "bottom", None)) for ln in lines if getattr(ln, "bottom", None) is not None]

    bbox = None
    if xs0 and ys0 and xs1 and ys1:
        bbox = {
            "top":    min(ys0),
            "left":   min(xs0),
            "width":  max(xs1) - min(xs0),
            "height": max(ys1) - min(ys0),
        }

    return {
        "label": "para",
        "text": text,
        "page_num": getattr(lines[0], "page_num", None),
        "bbox": bbox,
        "font_size": para_font_size,
    }


def _finalize_index_entry(
    lines: Sequence[Line], default_font_size: Optional[float] = None
) -> Optional[dict]:
    """
    Build a dedicated block for index entries so the structurer can emit cleaner XML.
    """
    block = _finalize_paragraph(lines, default_font_size=default_font_size)
    if block:
        block["label"] = "index_item"
        txt = block.get("text") or ""
        # Ensure a separator between trailing text and the first page number.
        cleaned = re.sub(r"(?<=[A-Za-z])(?=\d)", " ", txt)
        block["text"] = cleaned
    return block


def _extract_table(lines: Sequence[Line], start_idx: int) -> tuple[dict, int] | None:
    rows: List[List[str]] = []
    column_positions: List[float] = []
    idx = start_idx
    min_rows = 2
    while idx < len(lines):
        line = lines[idx]
        cols = line.column_positions
        if len(cols) < 2:
            break
        if not column_positions:
            column_positions = cols
        elif len(cols) != len(column_positions):
            break
        elif any(abs(a - b) > 25 for a, b in zip(cols, column_positions)):
            break

        cells = [""] * len(column_positions)
        for segment in sorted(line.segments, key=lambda s: s.left):
            if not segment.text.strip():
                continue
            nearest = min(
                range(len(column_positions)),
                key=lambda idx_: abs(column_positions[idx_] - segment.left),
            )
            existing = cells[nearest]
            if existing:
                if not existing.endswith(" ") and not segment.text.startswith(" "):
                    existing += " "
                cells[nearest] = existing + segment.text
            else:
                cells[nearest] = segment.text.strip()
        rows.append([cell.strip() for cell in cells])
        idx += 1
        if idx < len(lines):
            gap = _line_gap(line, lines[idx])
            if line.height is not None and lines[idx].height is not None:
                if gap > max(line.height, lines[idx].height) * 1.8:
                    break

    if len(rows) >= min_rows:
        table_block = {
            "label": "table",
            "rows": rows,
            "page_num": lines[start_idx].page_num,
            "bbox": {
                "top": lines[start_idx].top,
                "left": min(column_positions) if column_positions else lines[start_idx].left,
                "width": (
                    (max(column_positions) - min(column_positions)) if column_positions else 0
                ),
                "height": lines[idx - 1].top - lines[start_idx].top + lines[idx - 1].height,
            },
            "text": "\n".join(" | ".join(row) for row in rows),
        }
        return table_block, idx
    return None


# helper (place near other helpers)
def _flow_index(el: ET.Element) -> int:
    # prefer explicit flow index if present; else -1
    for k in ("flow_idx", "seq", "order", "reading_idx"):
        v = el.get(k)
        if v is not None:
            try: return int(v)
            except: pass
    return -1

def _entry_from_text(text_el: ET.Element, fontspecs_map) -> dict:
    # reuse your _max_text_size and parsing; keep it simple here:
    return {
        "kind": "text",
        "el": text_el,
        "text": (text_el.text or "").strip(),
        "font_size": _max_text_size(text_el, fontspecs_map),
        "flow_idx": _flow_index(text_el),
        "top": _f(text_el.get("orig_top") or text_el.get("top")),
        "left": _f(text_el.get("orig_left") or text_el.get("left")),
    }

def _iter_page_entries_preserve(page, fontspec_map):
    # Pull page context (be liberal with attribute names)
    pnum = None
    for k in ("number", "index", "page", "id"):
        v = page.get(k)
        if v is not None:
            try:
                pnum = int(v)
                break
            except Exception:
                pass

    ph = None
    for k in ("height", "pageheight", "h"):
        v = page.get(k)
        if v is not None:
            try:
                ph = float(v)
                break
            except Exception:
                pass

    pw = None
    for k in ("width", "pagewidth", "w"):
        v = page.get(k)
        if v is not None:
            try:
                pw = float(v)
                break
            except Exception:
                pass

    entries = []
    for ch in list(page):  # document order as written by grid_reading_order
        if ch.tag == "text":
            entries.append({
                "kind": "text",
                "el": ch,
                "text": (ch.text or "").strip(),
                "font_size": _max_text_size(ch, fontspec_map),
                "flow_idx": _flow_index(ch),
                "top": _f(ch.get("orig_top") or ch.get("top")),
                "left": _f(ch.get("orig_left") or ch.get("left")),
                "page_height": ph,
                "page_width": pw,
                "page_number": pnum,
            })
        elif ch.tag in ("figure", "image", "diagram", "table"):
            # For non-text, we still carry page context (some filters look at it)
            entries.append({
                "kind": ch.tag,
                "el": ch,
                "top": _f(ch.get("orig_top") or ch.get("top")),
                "left": _f(ch.get("orig_left") or ch.get("left")),
                "page_height": ph,
                "page_width": pw,
                "page_number": pnum,
            })
        # ignore other tags
    return entries

def _iter_page_entries(page: etree._Element, fontspecs: dict) -> Iterable[dict]:
    lines = _parse_lines(page, fontspecs)
    lines = _reorder_lines_for_columns(lines)
    for line in lines:
        yield {"kind": "line", "line": line}

    for image in page.findall("image"):
        src = image.get("src")
        if not src:
            continue
        yield {
            "kind": "image",
            "image": {
                "src": src,
                "top": float(image.get("top", "0") or 0),
                "left": float(image.get("left", "0") or 0),
                "width": float(image.get("width", "0") or 0),
                "height": float(image.get("height", "0") or 0),
                "page_num": int(page.get("number", "0") or 0),
            },
        }

def _flow_index(el):
    # prefer explicit flow index from reading_order.xml; else -1
    for k in ("flow_idx", "reading_idx", "seq", "order"):
        v = el.get(k)
        if v is not None:
            try:
                return int(v)
            except Exception:
                pass
    return -1


def label_blocks(pdfxml_path: str, mapping: dict, pdf_path: Optional[str] = None) -> List[dict]:
    """
    Produce a linear list of labeled content blocks from the flow XML.

    Pipeline:
      1) Parse flow XML, (optionally) preprocess for ebook production.
      2) For each <page>, collect entries in **preserved flow order** using
         _iter_page_entries_preserve(page, fontspecs_map). If a page lacks
         flow_idx (older outputs), fall back to (top, left) sorting.
      3) Filter headers / footers / repeated copyright with
         _is_header_footer_enhanced(...).
      4) Detect multi-line titles / headings / TOC / Index, list items, captions.
      5) Merge paragraphs with _should_merge and finalize with _finalize_paragraph.
      6) Return a flat list of dict blocks suitable for the structurer.

    Requires the following helpers to exist in this module:
      - _collect_fontspecs(root)
      - _iter_page_entries_preserve(page, fontspecs_map)
      - _line_of(entry)
      - _is_header_footer_enhanced(line, repeated_patterns, copyright_patterns, seen_copyright)
      - _body_font_size(lines)
      - _is_index_heading(line, body_size)
      - _looks_like_book_title(line, body_size)
      - _looks_like_chapter_heading(line, body_size)
      - _looks_like_section_heading(line, body_size)
      - _looks_like_caption(line)
      - _is_list_item(text, mapping) -> (matched: bool, list_type: str, cleaned_text: str)
      - _should_merge(prev_line, next_line, body_size)
      - _finalize_paragraph(lines: List[Line], default_font_size: Optional[float] = None) -> Optional[dict]
      - _collect_multiline_heading(entries, idx, body_size)
      - _collect_multiline_book_title(entries, idx, body_size)
      - Constants: CHAPTER_KEYWORD_RE, TOC_RE, HEADING_FONT_TOLERANCE

    Returns:
      List[dict] blocks (labels include 'book_title', 'chapter', 'section',
      'caption', 'list_item', 'toc', 'figure', 'para').
    """
    # ── Parse flow XML
    tree = etree.parse(pdfxml_path)
    root = tree.getroot()

    # ── Optional preprocessing (safe if you have these functions; else no-ops)
    try:
        logger.info("=" * 70); logger.info("PREPROCESSING XML FOR EBOOK PRODUCTION"); logger.info("=" * 70)
        logger.info("🌍 Adding global coordinates...")
        doc_metadata = _add_global_coordinates(tree)  # optional
        logger.info(f"   ✅ Processed {doc_metadata.get('total_pages', 0)} pages")
        logger.info(f"   ✅ Total document height: {doc_metadata.get('total_height', 0):.0f}px")

        preprocessing_stats, repeated_patterns, copyright_patterns = _preprocess_xml_for_ebook(tree)
        logger.info("✅ Preprocessing complete:")
        logger.info(f"   • Removed {preprocessing_stats.get('duplicates_removed', 0)} duplicate text nodes")
        logger.info(f"   • Identified {preprocessing_stats.get('repeated_patterns_found', 0)} repeated patterns")
        logger.info(f"   • Found {preprocessing_stats.get('copyright_patterns_found', 0)} copyright notices (keeping first)")
        logger.info("=" * 70)
    except Exception:
        # If those hooks don't exist or fail, carry on with defaults
        repeated_patterns = []
        copyright_patterns = []
        logger.debug("Preprocessing hooks unavailable or skipped; continuing.")

    # ── Fontspecs map for style lookups
    fontspecs_map = _collect_fontspecs(root)

    # ── Build per-page entries in preserved order, with fallbacks
    entries: List[dict] = []
    for page in root.findall(".//page"):
        page_entries = _iter_page_entries_preserve(page, fontspecs_map)

        # Attach page context for downstream checks
        ph = float(page.get("height") or 0)
        pw = float(page.get("width") or 0)
        pn = int(page.get("number") or 0)
        for e in page_entries:
            e["page_height"] = ph
            e["page_width"] = pw
            e["page_number"] = pn

        # If *none* of the entries on this page has a flow_idx, fallback to (top,left)
        if not any((e.get("flow_idx", -1) >= 0) for e in page_entries):
            page_entries.sort(key=lambda e: (e.get("top", float("inf")), e.get("left", float("inf"))))

        entries.extend(page_entries)

    # ── Body font estimate for heuristics
    # Use safe wrapper to build Line objects from entries
    lines_for_body = []
    for e in entries:
        if e.get("kind") in ("text", "line"):
            try:
                lines_for_body.append(_line_of(e))
            except Exception:
                pass
    body_size = _body_font_size(lines_for_body)
    logger.debug("Estimated body font size: %.2f", body_size)

    # ── Main scan
    blocks: List[dict] = []
    current_para: List[Any] = []
    saw_book_title = False
    in_index_section = False
    front_matter_mode = False # JC look this
    front_matter_locked = False
    content_started = False
    seen_copyright = set()
    current_index_lines: List[Line] = []
    index_base_left: Optional[float] = None
    index_letter_re = re.compile(r"^[A-Z]$")

    def _flush_index_entry() -> None:
        nonlocal current_index_lines
        if not current_index_lines:
            return
        blk = _finalize_index_entry(current_index_lines, default_font_size=body_size)
        if blk:
            blocks.append(blk)
        current_index_lines = []

    def _append_paragraph_block(block: Optional[dict], *, fm_override: Optional[str] = None) -> None:
        if not block:
            return
        if front_matter_mode and not front_matter_locked:
            block["label"] = "front_matter"
            block["fm_type"] = fm_override or block.get("fm_type", "para")
        blocks.append(block)

    # Should we enforce that a "chapter" must contain word Chapter/Unit etc.?
    should_enforce_chapter_keyword = any(
        e.get("kind") in ("text", "line")
        and CHAPTER_KEYWORD_RE.search((_line_of(e).text or "").strip())
        and _has_heading_font(_line_of(e), body_size)
        for e in entries
    )
    enforce_chapter_keyword = False
    chapter_heading_font_size: Optional[float] = None

    idx = 0
    N = len(entries)
    while idx < N:
        entry = entries[idx]

        # Figures (images/figure nodes) pass-through: flush paragraph then emit figure
        if entry.get("kind") in ("image", "figure"):
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
                current_para = []
            src = None
            source_path = None
            caption_text = ""
            top = entry.get("top")
            left = entry.get("left")
            width = entry.get("width")
            height = entry.get("height")
            page_num = entry.get("page_number")

            if entry.get("kind") == "image" and "image" in entry:
                image = entry["image"]  # expected structure from older extractor path
                src = image.get("src")
                caption_text = (image.get("caption") or "").strip()
                top = image.get("top")
                left = image.get("left")
                width = image.get("width")
                height = image.get("height")
                page_num = image.get("page_num", page_num)
                source_path = src
            else:
                fig_el = entry.get("el")
                if fig_el is not None:
                    src = fig_el.get("filename") or fig_el.get("src")
                    path_el = fig_el.find(".//path")
                    if path_el is not None and path_el.text:
                        source_path = path_el.text.strip()
                    if not src and source_path:
                        src = Path(source_path).name
                    if not source_path and src:
                        source_path = src
                    cap_el = fig_el.find(".//caption")
                    if cap_el is not None:
                        try:
                            caption_text = get_text(cap_el)
                        except Exception:
                            caption_text = "".join(cap_el.itertext()).strip()
                    top = _f(fig_el.get("top"))
                    left = _f(fig_el.get("left"))
                    width = _f(fig_el.get("width"))
                    height = _f(fig_el.get("height"))
                    if page_num is None:
                        page_num = entry.get("page_number")

            blocks.append({
                "label": "figure",
                "text": caption_text or "",
                "page_num": page_num,
                "src": src,
                "source_path": source_path,
                "format": entry.get("el").get("type") if entry.get("kind") == "figure" and entry.get("el") is not None else None,
                "id": entry.get("el").get("id") if entry.get("kind") == "figure" and entry.get("el") is not None else None,
                "bbox": {
                    "top": top,
                    "left": left,
                    "width": width,
                    "height": height,
                },
            })
            idx += 1
            continue

        # Normalize to a Line-like object for all text-ish entries
        line = _line_of(entry)
        # Ensure line has page context so downstream checks never see None
        try:
            if getattr(line, "page_num", None) is None:
                line.page_num = entry.get("page_number", 0)
            if getattr(line, "page_height", None) is None:
                line.page_height = entry.get("page_height", 0.0)
            if getattr(line, "page_width", None) is None:
                line.page_width = entry.get("page_width", 0.0)
        except Exception:
            # be defensive: don't let attribute errors break the pass
            pass

        # Skip headers/footers/copyright noise
        try:
            if _is_header_footer_enhanced(line, repeated_patterns, copyright_patterns, seen_copyright):
                idx += 1
                continue
        except Exception:
            # Be defensive: if the enhanced predicate needs fields we don’t have, skip enhancement
            pass

        text = (line.text or "").strip()

        # ── Inside Index: handle leaving the index cleanly
        if in_index_section and _has_heading_font(line, body_size):
            # If it’s just another "Index/References" heading inside the index, skip duplicate
            if _is_index_heading(line, body_size):
                idx += 1
                continue
            # One-character “heading-like” debris inside index: ignore
            if len(text) <= 1:
                idx += 1
                continue
            # Leaving index: flush paragraph and let the line fall through for normal handling
            _flush_index_entry()
            current_index_lines = []
            index_base_left = None
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
                current_para = []
            in_index_section = False
            # Important: do NOT advance idx here; let the heading logic below process this same line

        # ── Index section entry
        if _is_index_heading(line, body_size):
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
                current_para = []
            _flush_index_entry()
            current_index_lines = []
            index_base_left = None
            heading_lines, next_idx = _collect_multiline_heading(entries, idx, body_size)
            if heading_lines:
                left = min((h.left if h.left is not None else 0.0) for h in heading_lines)
                right = max(
                    h.right if h.right is not None
                    else (h.left if h.left is not None else 0.0)
                    for h in heading_lines
                )
                top = heading_lines[0].top if heading_lines[0].top is not None else 0.0
                bottom = max(
                    (h.top if h.top is not None else 0.0) +
                    (h.height if h.height is not None else 0.0)
                    for h in heading_lines
                )

                combined_text = " ".join((h.text or "").strip() for h in heading_lines if (h.text or "").strip())
                blocks.append({
                    "label": "chapter",
                    "text": combined_text,
                    "page_num": heading_lines[0].page_num,
                    "bbox": {"top": top, "left": left, "width": right - left, "height": bottom - top},
                    "font_size": max(h.font_size for h in heading_lines if h.font_size),
                    "chapter_role": "index",
                })
                in_index_section = True
                # Prime the base indentation using the first non-letter line we encounter
                if heading_lines:
                    first_line = heading_lines[-1]
                    index_base_left = first_line.left if first_line.left is not None else index_base_left
                idx = next_idx
                continue

        # ── TOC heading
        if TOC_RE.match(text.lower()) and _has_heading_font(line, body_size):
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
                current_para = []
            heading_lines, next_idx = _collect_multiline_heading(entries, idx, body_size)
            if heading_lines:
                left = min((h.left if h.left is not None else 0.0) for h in heading_lines)
                right = max(
                    h.right if h.right is not None
                    else (h.left if h.left is not None else 0.0)
                    for h in heading_lines
                )
                top = heading_lines[0].top if heading_lines[0].top is not None else 0.0
                bottom = max(
                    (h.top if h.top is not None else 0.0) +
                    (h.height if h.height is not None else 0.0)
                    for h in heading_lines
                )

                combined_text = " ".join((h.text or "").strip() for h in heading_lines if (h.text or "").strip())
                blocks.append({
                    "label": "toc",
                    "text": combined_text,
                    "page_num": heading_lines[0].page_num,
                    "bbox": {"top": top, "left": left, "width": right - left, "height": bottom - top},
                    "font_size": max(h.font_size for h in heading_lines if h.font_size),
                })
                front_matter_mode = False
                front_matter_locked = True
                idx = next_idx
                continue

        if in_index_section and entry.get("kind") in ("line", "text"):
            if not text:
                idx += 1
                continue

            if index_letter_re.match(text):
                _flush_index_entry()
                current_index_lines = []
                index_base_left = None
                left = line.left if line.left is not None else 0.0
                right = line.right if line.right is not None else left
                blocks.append({
                    "label": "index_letter",
                    "text": text,
                    "page_num": line.page_num,
                    "bbox": {
                        "top": line.top,
                        "left": left,
                        "width": right - left,
                        "height": line.height,
                    },
                    "font_size": line.font_size,
                })
                idx += 1
                continue

            current_left = line.left if line.left is not None else (index_base_left or 0.0)
            if not current_index_lines:
                index_base_left = current_left
                _flush_index_entry()
                current_index_lines = [line]
            else:
                assert index_base_left is not None  # for type-checkers
                continuation = (
                    current_left > index_base_left + 8
                    or bool(re.match(r"^[,0-9]", text))
                )
                if continuation:
                    current_index_lines.append(line)
                else:
                    _flush_index_entry()
                    index_base_left = current_left
                    current_index_lines = [line]

            idx += 1
            continue

        # ── Book title (only once)
        if not saw_book_title and _looks_like_book_title(line, body_size):
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
            current_para = []
            heading_lines, next_idx = _collect_multiline_book_title(entries, idx, body_size)
            if heading_lines:
                left = min((h.left if h.left is not None else 0.0) for h in heading_lines)
                right = max(
                    h.right if h.right is not None
                    else (h.left if h.left is not None else 0.0)
                    for h in heading_lines
                )
                top = heading_lines[0].top if heading_lines[0].top is not None else 0.0
                bottom = max(
                    (h.top if h.top is not None else 0.0) +
                    (h.height if h.height is not None else 0.0)
                    for h in heading_lines
                )

                combined_text = " ".join((h.text or "").strip() for h in heading_lines if (h.text or "").strip())
                blocks.append({
                    "label": "book_title",
                    "text": combined_text,
                    "page_num": heading_lines[0].page_num,
                    "bbox": {"top": top, "left": left, "width": right - left, "height": bottom - top},
                    "font_size": max(h.font_size for h in heading_lines if h.font_size),
                })
                saw_book_title = True
                idx = next_idx
                continue

        # ── Chapter heading
        if _looks_like_chapter_heading(line, body_size):
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
                current_para = []

            heading_lines, lookahead_idx = _collect_multiline_heading(entries, idx, body_size)
            if heading_lines:
                combined_text = " ".join((h.text or "").strip() for h in heading_lines if (h.text or "").strip())
                contains_keyword = any(
                    CHAPTER_KEYWORD_RE.search((h.text or "").strip()) for h in heading_lines if (h.text or "").strip()
                )

                allow_heading = True
                first_line = heading_lines[0]
                base_font = first_line.font_size or 0.0

                if should_enforce_chapter_keyword and enforce_chapter_keyword and not contains_keyword:
                    allow_heading = False

                if contains_keyword and base_font:
                    if chapter_heading_font_size is None:
                        chapter_heading_font_size = base_font
                    elif abs(base_font - chapter_heading_font_size) > HEADING_FONT_TOLERANCE:
                        allow_heading = False
                    else:
                        chapter_heading_font_size = base_font
                elif chapter_heading_font_size is not None and should_enforce_chapter_keyword and enforce_chapter_keyword:
                    allow_heading = False

                left = min((h.left if h.left is not None else 0.0) for h in heading_lines)
                right = max(
                    h.right if h.right is not None
                    else (h.left if h.left is not None else 0.0)
                    for h in heading_lines
                )
                top = heading_lines[0].top if heading_lines[0].top is not None else 0.0
                bottom = max(
                    (h.top if h.top is not None else 0.0) +
                    (h.height if h.height is not None else 0.0)
                    for h in heading_lines
                )

                if allow_heading:
                    heading_label = (
                        "toc" if re.search(r'\b(table\s+of\s+)?contents\b', combined_text, re.IGNORECASE)
                        else "front_matter" if _is_front_matter_heading(combined_text, heading_lines[0].page_num)
                        else "chapter"
                    )
                    fm_type = None
                    if (
                        front_matter_mode
                        and not front_matter_locked
                        and not content_started
                        and heading_label == "chapter"
                    ):
                        heading_label = "front_matter"
                        fm_type = "heading"
                    if heading_label == "front_matter":
                        front_matter_mode = True
                        fm_type = "heading"
                    elif heading_label == "chapter":
                        front_matter_mode = False
                        front_matter_locked = True
                        content_started = True
                    block_entry = {
                        "label": heading_label,
                        "text": combined_text,
                        "page_num": heading_lines[0].page_num,
                        "bbox": {"top": top, "left": left, "width": right - left, "height": bottom - top},
                        "font_size": max(h.font_size for h in heading_lines if h.font_size),
                    }
                    if fm_type:
                        block_entry["fm_type"] = fm_type
                    blocks.append(block_entry)
                    if contains_keyword:
                        enforce_chapter_keyword = True
                else:
                    # demote to section
                    blocks.append({
                        "label": "section",
                        "text": combined_text,
                        "page_num": heading_lines[0].page_num,
                        "bbox": {"top": top, "left": left, "width": right - left, "height": bottom - top},
                        "font_size": max(h.font_size for h in heading_lines if h.font_size),
                    })
                idx = lookahead_idx
                continue

        # ── Section heading
        if _looks_like_section_heading(line, body_size):
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
                current_para = []
            blocks.append({
                "label": "section",
                "text": text,
                "page_num": line.page_num,
                "bbox": {
                    "top": line.top, 
                    "left": line.left, 
                    "width": (line.right - line.left) if (line.right is not None and line.left is not None) else None, 
                    "height": line.height
                },
                "font_size": line.font_size,
            })
            idx += 1
            continue

        # ── Caption
        if _looks_like_caption(line):
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
                current_para = []
            blocks.append({
                "label": "caption",
                "text": text,
                "page_num": line.page_num,
                "bbox": {
                    "top": line.top, 
                    "left": line.left, 
                    "width": (line.right - line.left) if (line.right is not None and line.left is not None) else None, 
                    "height": line.height
                },
                "font_size": line.font_size,
            })
            idx += 1
            continue

        # ── List item
        matched, list_type, list_text = _is_list_item(text, mapping)
        if matched:
            if current_para:
                blk = _finalize_paragraph(current_para, default_font_size=body_size)
                _append_paragraph_block(blk)
                current_para = []
            blocks.append({
                "label": "list_item",
                "text": list_text,
                "page_num": line.page_num,
                "bbox": {
                    "top": line.top, 
                    "left": line.left, 
                    "width": (line.right - line.left) if (line.right is not None and line.left is not None) else None, 
                    "height": line.height
                },
                "font_size": line.font_size,
                "list_type": list_type,
            })
            idx += 1
            continue

        # ── Paragraph aggregation
        if not current_para:
            current_para = [line]
        elif _should_merge(current_para[-1], line, body_size):
            current_para.append(line)
        else:
            blk = _finalize_paragraph(current_para, default_font_size=body_size)
            _append_paragraph_block(blk)
            current_para = [line]

        idx += 1

    # Flush final paragraph
    if current_para:
        blk = _finalize_paragraph(current_para, default_font_size=body_size)
        _append_paragraph_block(blk)
    _flush_index_entry()

    logger.info("Labeled %s blocks", len(blocks))
    return blocks