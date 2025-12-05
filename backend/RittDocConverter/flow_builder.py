#!/usr/bin/env python3
"""
Option 2 — Flow Builder + Structurer + QA (RittDocDTD aware)
============================================================
Senior-dev implementation that:
  1) Inventories font specs across the whole book (sizes, weights, families).
  2) Builds a NEW flow XML that preserves your curated reading order and
     all font / span attributes (deep copies). Adds monotonic `top` for flow
     and preserves original geometry in `orig_*`.
  3) Detects and filters running headers/footers & repeating legal/print notes.
  4) Detects lists / grouped items.
  5) Applies heuristics to classify blocks into RittDocDTD labels (from
     labels.expanded.json) and builds a structured DocBook-like tree
     (book→chapter→section→subsection), respecting `starts_container`.
  6) Inserts figure placeholders during flow build; later binds media from the
     media XML without reordering existing nodes.
  7) Emits a QA report highlighting pages/chapters to recheck.

USAGE
-----
# 1) Build flow-only (with placeholders), inventory fonts, detect header/footer
python3 flow_builder.py build \
  --reading reading_order.xml \
  --out-flow flow.xml \
  --labels labels.expanded.json \
  --report qa.json

# 2) Bind media into the flow (no reordering)
python3 flow_builder.py bind \
  --flow flow.xml \
  --media media.xml \
  --out merged.xml \
  --report qa.json

# 3) One-shot: build → bind → structure (DocBook-ish) + QA
python3 flow_builder.py build+bind+structure \
  --reading reading_order.xml \
  --media media.xml \
  --labels labels.expanded.json \
  --out structured.xml \
  --report qa.json

NOTES
-----
• We NEVER re-derive order from coordinates after build; the flow is canonical.
• The structurer uses font inventory + simple lexical cues to map to labels.
• Headers/footers are detected from repeated strings in top/bottom bands.
• This script does not zip/package; keep `package.py` for that.
"""

from __future__ import annotations

import re
import os
import sys
import json
import math
import statistics
import copy
import bisect
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Iterable
import xml.etree.ElementTree as ET
from sqlalchemy import text
from heuristics_Nov3 import label_blocks as heur_label_blocks


# ---------------------------
# Constants / Regexes
# ---------------------------
FIG_REF_RE = re.compile(r"\b(Figure|Fig\.)\s*(\d+)\b", re.IGNORECASE)
COPYRIGHT_RE = re.compile(r"copyright|all rights reserved|no part of this|isbn|printed in", re.I)
PRODUCTION_RE = re.compile(r"bleed|trim|crop marks|for print only|indesign|preflight", re.I)
LIST_BULLET_RE = re.compile(r"^(?:[-•‣▪◦·*]|\(\w\)|\d+[.)])\s+")
CHAPTER_HEAD_RE = re.compile(r"^chapter\s+\d+\b", re.I)

SPECIAL_SECTION_PATTERNS: List[tuple[str, re.Pattern[str]]] = [
    ("toc", re.compile(r"^\s*(table\s+of\s+contents|contents(?:\s+(?:in\s+brief|overview))?)\b", re.I)),
    ("index", re.compile(r"^\s*index\b", re.I)),
    ("glossary", re.compile(r"^\s*glossar(?:y|ies)\b", re.I)),
    # ("key-terms", re.compile(r"^\s*key\s+(?:terms?|terminology|definitions|concepts)\b", re.I)),
]
SPECIAL_SECTION_MODES = {name for name, _ in SPECIAL_SECTION_PATTERNS}
SPECIAL_ROLE_BY_MODE = {
    "toc": "toc",
    "index": "index",
    "glossary": "glossary",
    # "key-terms": "key-terms",
}
TOC_LEADER_RE = re.compile(r"\.{2,}")
ROMAN_NUMERAL_RE = re.compile(
    r"^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$", re.I
)

# ---------------------------
# Data models
# ---------------------------
@dataclass
class FontStats:
    counts_by_size: Dict[float, int] = field(default_factory=dict)
    bold_count: int = 0
    italic_count: int = 0
    families: Dict[str, int] = field(default_factory=dict)
    all_sizes: List[float] = field(default_factory=list)

    def bump(self, size: Optional[float], family: Optional[str], bold: Optional[str], italic: Optional[str]):
        if size is not None and not math.isnan(size):
            self.counts_by_size[size] = self.counts_by_size.get(size, 0) + 1
            self.all_sizes.append(size)
        if family:
            self.families[family] = self.families.get(family, 0) + 1
        if bold and bold.lower() in ("1", "true", "yes", "bold"):
            self.bold_count += 1
        if italic and italic.lower() in ("1", "true", "yes", "italic"):
            self.italic_count += 1

    @property
    def body_size(self) -> Optional[float]:
        if not self.counts_by_size:
            return None
        return max(self.counts_by_size.items(), key=lambda kv: kv[1])[0]

    def quantile(self, q: float) -> Optional[float]:
        if not self.all_sizes:
            return None
        xs = sorted(self.all_sizes)
        i = min(max(int(q * (len(xs) - 1)), 0), len(xs) - 1)
        return xs[i]

    def heading_thresholds(self) -> Tuple[Optional[float], Optional[float]]:
        body = self.body_size
        q95 = self.quantile(0.95)
        q80 = self.quantile(0.80)
        if body is None:
            return (q95, q80)
        # multiplicative guards – robust across different source PDFs
        h1 = max(q95 or 0.0, body * 1.35)
        h2 = max(q80 or 0.0, body * 1.18)
        return (h1, h2)

    @property
    def heading_sizes(self) -> Tuple[Optional[float], Optional[float]]:
        """Property that returns heading size thresholds (h1, h2)."""
        return self.heading_thresholds()


# ---------------------------
# Helpers
# ---------------------------

def _f(s: Optional[str]) -> float:
    try:
        return float(s) if s is not None else math.nan
    except Exception:
        return math.nan


def deepcopy(e: ET.Element) -> ET.Element:
    return copy.deepcopy(e)


def get_text(e: ET.Element) -> str:
    # Concatenate text from node and children
    parts = []
    if e.text:
        parts.append(e.text)
    for ch in e:
        parts.append(get_text(ch))
        if ch.tail:
            parts.append(ch.tail)
    return "".join(parts).strip()


# ---------------------------
# Inventory fonts & detect running matter
# ---------------------------

def inventory_fonts(root: ET.Element) -> FontStats:
    stats = FontStats()
    for t in root.findall('.//text'):
        size = _f(t.get('fontsize'))
        family = t.get('fontname') or t.get('font')
        bold = t.get('bold')
        italic = t.get('italic')
        stats.bump(size, family, bold, italic)
    return stats


def detect_running_matter(
    root: ET.Element,
    *,
    top_band: float = 60.0,
    bottom_band: float = 60.0,
    min_pages: int = 4,
    heading_whitelist: Optional[List[float]] = None
) -> Dict[str, Dict[str, int]]:
    headers: Dict[str, int] = {}
    footers: Dict[str, int] = {}

    for p in root.findall('.//page'):
        try:
            ph = float(p.get('height')) if p.get('height') else math.nan
        except Exception:
            ph = math.nan

        for t in list(p):
            if t.tag != 'text':
                continue
            top = _f(t.get('top'))
            size = _f(t.get('fontsize'))
            txt = get_text(t)
            if not txt:
                continue
            # don't count real headings as running matter
            if heading_whitelist and not math.isnan(size) and any(abs(size - hs) < 0.25 for hs in heading_whitelist):
                continue
            if not math.isnan(top) and top <= top_band:
                headers[txt] = headers.get(txt, 0) + 1
            if not math.isnan(top) and (not math.isnan(ph)) and (ph - top) <= bottom_band:
                footers[txt] = footers.get(txt, 0) + 1

    headers = {k: v for k, v in headers.items() if v >= min_pages}
    footers = {k: v for k, v in footers.items() if v >= min_pages}
    return {"header": headers, "footer": footers}

def should_filter_text(txt: str, repeats: Dict[str, Dict[str, int]]) -> bool:
    if not txt:
        return False
    return (txt in repeats['header']) or (txt in repeats['footer']) \
        or COPYRIGHT_RE.search(txt) or PRODUCTION_RE.search(txt)


# ---------------------------
# Flow builder (no reorder beyond original DOM)
# ---------------------------

def build_flow(reading_xml: str, out_flow: str, *, base_left: float = 72.0, line_step: float = 14.0, labels_path: Optional[str] = None, qa_out: Optional[str] = None) -> Dict:
    rt = ET.parse(reading_xml)
    rr = rt.getroot()

    labels = None
    if labels_path:
        with open(labels_path, 'r', encoding='utf-8') as f:
            labels = json.load(f)

    fontstats = inventory_fonts(rr)
    h1_thresh, h2_thresh = fontstats.heading_thresholds()
    heading_whitelist = [x for x in (h1_thresh, h2_thresh) if x]
    repeats = detect_running_matter(rr, heading_whitelist=heading_whitelist)

    # Track font specifications so we can preserve font metadata (size, family)
    fontspec_sizes: Dict[str, float] = {}

    def _register_fontspec(fs: ET.Element) -> None:
        fid = fs.get('id')
        sz = fs.get('size')
        if not fid or not sz:
            return
        try:
            fontspec_sizes[fid] = float(sz)
        except Exception:
            try:
                fontspec_sizes[fid] = float(sz.strip())
            except Exception:
                pass

    out_root = ET.Element(rr.tag, rr.attrib)

    # Copy any top-level fontspec declarations directly to the output root.
    for fs in rr.findall('fontspec'):
        _register_fontspec(fs)
        out_root.append(deepcopy(fs))
    qa = {"filtered": [], "fig_placeholders": 0, "fontstats": {
        "body": fontstats.body_size,
        "heading_sizes": fontstats.heading_sizes,
        "families": sorted(fontstats.families.items(), key=lambda kv: -kv[1])[:5]
    }}

    for p in rr.findall('.//page'):
        out_p = ET.SubElement(out_root, 'page', dict(p.attrib))
        # Preserve page-scoped fontspec declarations (before any flow content)
        for fs in p.findall('fontspec'):
            _register_fontspec(fs)
            out_p.append(deepcopy(fs))
        cur_top = float(p.get('height') or 792) - 72.0  # start near top margin
        flow_index = 0

        for ch in list(p):
            if ch.tag == 'fontspec':
                continue
            
            if ch.tag != 'text' and ch.tag not in ('table','figure','image'):
                # preserve non-text blocks as-is at their position in flow
                cpy = deepcopy(ch)
                for k in ("top","left","right","bottom"):
                    v = ch.get(k)
                    if v is not None:
                        cpy.set(f"orig_{k}", v)
                cpy.set('flow_index', str(flow_index)); flow_index += 1
                cpy.set('top', f"{cur_top:.2f}"); cur_top -= line_step
                out_p.append(cpy)
                continue
            
            if ch.tag == 'text':
                txt = get_text(ch)
                if should_filter_text(txt, repeats):
                    qa["filtered"].append({"page": p.get('number'), "text": txt[:140]})
                    continue

            cpy = deepcopy(ch)
            for k in ("top","left","right","bottom"):
                v = ch.get(k)
                if v is not None:
                    cpy.set(f"orig_{k}", v)
            cpy.set('flow_index', str(flow_index)); flow_index += 1
            if ch.tag == 'text':
                fid = ch.get('font')
                if fid and fid in fontspec_sizes:
                    cpy.set('fontsize', f"{fontspec_sizes[fid]:g}")
            # keep original left if present, else base_left
            cpy.set('left', ch.get('left') or f"{base_left:.2f}")
            cpy.set('top', f"{cur_top:.2f}"); cur_top -= line_step
            out_p.append(cpy)

            
            # textual figure placeholders
            if ch.tag == 'text':
                m = FIG_REF_RE.search(get_text(cpy))
                if m:
                    fig_num = m.group(2)
                    ph = ET.Element('figure-placeholder', {
                        'ref': fig_num,
                        'flow_index': str(flow_index),
                        'top': f"{cur_top:.2f}"
                    })
                    out_p.append(ph)
                    qa["fig_placeholders"] += 1
                    flow_index += 1
                    cur_top -= line_step
            
    ET.indent(out_root, space='  ')
    ET.ElementTree(out_root).write(out_flow, encoding='utf-8', xml_declaration=True)

    if qa_out:
        with open(qa_out, 'w', encoding='utf-8') as f:
            json.dump(qa, f, indent=2)

    print(f"✓ Built flow XML → {out_flow}")
    return qa


# ---------------------------
# Media binder (slot-based; no reordering)
# ---------------------------

def _collect_media_by_page(media_root: ET.Element) -> Dict[int, List[ET.Element]]:
    out: Dict[int, List[ET.Element]] = {}
    for p in media_root.findall('.//page'):
        try:
            pn = int(p.get('number'))
        except Exception:
            continue
        items: List[ET.Element] = []
        for tag in ("image","figure","diagram","table","media"):
            for e in p.findall(f'.//{tag}'):
                if math.isnan(_f(e.get('top'))):
                    continue
                items.append(deepcopy(e))
        items.sort(key=lambda e: (_f(e.get('top')), _f(e.get('left'))))
        if items:
            out[pn] = items
    return out

def _nearest_caption_ref(page: ET.Element, anchor_index: int, window: int = 5) -> Optional[str]:
    siblings = list(page)
    for offset in range(1, window + 1):
        for i in (anchor_index - offset, anchor_index + offset):
            if 0 <= i < len(siblings):
                e = siblings[i]
                if e.tag == 'text':
                    m = FIG_REF_RE.search(get_text(e))
                    if m:
                        return m.group(2)
    return None

def bind_media(flow_xml: str, media_xml: str, out_xml: str, *, eps: float = 0.5, qa_out: Optional[str] = None) -> Dict:
    ft = ET.parse(flow_xml)
    fr = ft.getroot()
    mt = ET.parse(media_xml)
    mr = mt.getroot()

    media_by_page = _collect_media_by_page(mr)
    qa = {"placed": 0, "unmatched_placeholders": 0}

    for page in fr.findall('.//page'):
        try:
            pn = int(page.get('number'))
        except Exception:
            continue
        media = media_by_page.get(pn, [])
        if not media:
            continue

        orig = list(page)
        slots = [[] for _ in range(len(orig) + 1)]

        # placeholder map
        ph_map = {}
        # textual match first; if ref is missing, try to infer it via nearby captions
        geometric = []
        for m in media:
            ref = m.get('ref') or m.get('num')

            if not ref:
                # --- infer a ref from nearby caption text in the flow ---
                mtp = _f(m.get('top'))
                anchor_idx = None
                best_delta = float('inf')
                for idx, ch in enumerate(orig):
                    otp = _f(ch.get('orig_top'))  # this exists because build_flow writes orig_* attrs
                    if math.isnan(otp) or math.isnan(mtp):
                        continue
                    d = abs(otp - mtp)
                    if d < best_delta:
                        best_delta = d
                        anchor_idx = idx

                # Look ±5 siblings around the anchor for a “Figure N / Fig. N”
                guess = _nearest_caption_ref(page, anchor_idx or 0, window=5)
                if guess:
                    m.set('ref', guess)
                    ref = guess
                    qa["resolved_missing_refs"] = qa.get("resolved_missing_refs", 0) + 1

        if ref and ph_map.get(ref):
            i = ph_map[ref].pop(0)
            # place AFTER the placeholder node (slot i+1)
            slots[i + 1].append(m)
            qa["placed"] += 1
        else:
            geometric.append(m)

        # textual match first
        # geometric: List[ET.Element] = []
        # for m in media:
        #    ref = m.get('ref') or m.get('num')
        #    if ref and ph_map.get(ref):
        #        i = ph_map[ref].pop(0)
        #        slots[i+1].append(m)
        #        qa["placed"] += 1
        #    else:
        #       geometric.append(m)

        # geometric placement (orig_top against media.top)
        child_orig_tops = [_f(ch.get('orig_top')) for ch in orig]
        for m in geometric:
            mt = _f(m.get('top'))
            idx = len(orig)
            if not math.isnan(mt):
                for i, ot in enumerate(child_orig_tops):
                    if not math.isnan(ot) and mt <= ot + eps:
                        idx = i
                        break
            slots[idx].append(m)
            qa["placed"] += 1

        # rebuild
        for ch in orig:
            page.remove(ch)
        for i, ch in enumerate(orig):
            for m in slots[i]:
                page.append(m)
            page.append(ch)
        for m in slots[-1]:
            page.append(m)

        # leftover placeholders
        leftover = sum(len(v) for v in ph_map.values())
        qa["unmatched_placeholders"] += leftover

    ET.indent(fr, space='  ')
    ET.ElementTree(fr).write(out_xml, encoding='utf-8', xml_declaration=True)
    print(f"✓ Bound media → {out_xml}")

    if qa_out:
        with open(qa_out, 'w', encoding='utf-8') as f:
            json.dump(qa, f, indent=2)
    return qa


def merge_media_into_structured(
    structured_xml: str,
    media_xml: str,
    out_xml: str,
    *,
    qa_out: Optional[str] = None,
    media_root_dir: Optional[str] = None,
    top_tolerance: float = 3.0,
) -> Dict[str, int]:
    """
    Merge multimedia extracted via media_extractor_IgnoreVectorTabels.py into an
    already structured XML (produced directly from the reading-order XML).
    Placement uses per-block metadata (`source-page`, `source-top`, `source-flow-idx`)
    emitted during structuring to keep figures in the correct reading sequence.
    """
    structured_tree = ET.parse(structured_xml)
    structured_root = structured_tree.getroot()
    media_tree = ET.parse(media_xml)
    media_root = media_tree.getroot()
    output_root_dir = Path(out_xml).resolve().parent

    parent_map: Dict[ET.Element, ET.Element] = {}
    for parent in structured_root.iter():
        for child in parent:
            parent_map[child] = parent

    anchor_blacklist = {"book", "chapter", "section"}
    anchors: List[Dict[str, Any]] = []
    for element in structured_root.iter():
        if element.tag in anchor_blacklist:
            continue
        idx_attr = element.get("source-flow-idx")
        page_attr = element.get("source-page")
        if idx_attr is None or page_attr is None:
            continue
        try:
            idx_val = int(idx_attr)
        except ValueError:
            continue
        top_attr = element.get("source-top")
        try:
            top_val = float(top_attr) if top_attr is not None else None
        except ValueError:
            top_val = None
        anchors.append(
            {
                "element": element,
                "parent": parent_map.get(element),
                "idx": idx_val,
                "page": str(page_attr),
                "top": top_val,
            }
        )
    anchors.sort(key=lambda item: item["idx"])
    max_idx = max((item["idx"] for item in anchors), default=0)

    PAGE_WIDTH_HINT = 612.0
    PAGE_HEIGHT_HINT = 792.0
    EDGE_TOLERANCE = 25.0
    FULL_WIDTH_THRESHOLD = 520.0
    FULL_HEIGHT_THRESHOLD = 700.0
    STRIP_WIDTH_THRESHOLD = 130.0
    STRIP_HEIGHT_THRESHOLD = 130.0
    DECORATIVE_NAME_KEYWORDS = {
        "background",
        "bg",
        "blank",
        "decor",
        "decorative",
        "placeholder",
        "watermark",
        "border",
        "stripe",
        "edge",
        "cover",
        "spine",
    }

    def _safe_float(value: Optional[str]) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _figure_caption_text(fig_node: ET.Element) -> str:
        caption_el = fig_node.find("caption")
        if caption_el is None:
            return ""
        return "".join(caption_el.itertext()).strip()

    def _inspect_image_bytes(data: bytes, fallback_suffix: str) -> Tuple[int, int, str]:
        if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
            width = int.from_bytes(data[16:20], "big", signed=False)
            height = int.from_bytes(data[20:24], "big", signed=False)
            return width, height, "PNG"

        if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
            if len(data) >= 10:
                width = int.from_bytes(data[6:8], "little", signed=False)
                height = int.from_bytes(data[8:10], "little", signed=False)
                return width, height, "GIF"

        if data.startswith(b"\xff\xd8"):
            offset = 2
            length = len(data)
            while offset + 1 < length:
                if data[offset] != 0xFF:
                    break
                marker = data[offset + 1]
                offset += 2
                if marker in {0xD8, 0xD9}:
                    continue
                if offset + 1 >= length:
                    break
                block_length = int.from_bytes(data[offset : offset + 2], "big", signed=False)
                if marker in {
                    0xC0,
                    0xC1,
                    0xC2,
                    0xC3,
                    0xC5,
                    0xC6,
                    0xC7,
                    0xC9,
                    0xCA,
                    0xCB,
                    0xCD,
                    0xCE,
                    0xCF,
                }:
                    if offset + 7 <= length:
                        height = int.from_bytes(data[offset + 3 : offset + 5], "big", signed=False)
                        width = int.from_bytes(data[offset + 5 : offset + 7], "big", signed=False)
                        return width, height, "JPEG"
                    break
                offset += block_length

        suffix = fallback_suffix.lstrip(".")
        return 0, 0, suffix.upper() if suffix else ""

    def _looks_like_full_bleed(
        width: Optional[float], height: Optional[float], left: Optional[float], top: Optional[float]
    ) -> bool:
        if width is None or height is None:
            return False
        left_val = left if left is not None else 0.0
        top_val = top if top is not None else 0.0
        right_val = left_val + width
        bottom_val = top_val + height
        touches_left = left_val <= EDGE_TOLERANCE
        touches_top = top_val <= EDGE_TOLERANCE
        touches_right = right_val >= PAGE_WIDTH_HINT - EDGE_TOLERANCE
        touches_bottom = bottom_val >= PAGE_HEIGHT_HINT - EDGE_TOLERANCE
        covers_width = touches_left and touches_right
        covers_height = touches_top and touches_bottom
        return (covers_width and height >= FULL_HEIGHT_THRESHOLD) or (covers_height and width >= FULL_WIDTH_THRESHOLD)

    def _looks_like_vertical_strip(
        width: Optional[float], height: Optional[float], left: Optional[float]
    ) -> bool:
        if width is None or height is None:
            return False
        if height < PAGE_HEIGHT_HINT * 0.8:
            return False
        if width > STRIP_WIDTH_THRESHOLD:
            return False
        if left is None:
            return True
        right_val = left + width
        near_left = left <= EDGE_TOLERANCE
        near_right = right_val >= PAGE_WIDTH_HINT - EDGE_TOLERANCE
        return near_left or near_right

    def _looks_like_horizontal_strip(
        width: Optional[float], height: Optional[float], top: Optional[float]
    ) -> bool:
        if width is None or height is None:
            return False
        if width < PAGE_WIDTH_HINT * 0.8:
            return False
        if height > STRIP_HEIGHT_THRESHOLD:
            return False
        if top is None:
            return True
        bottom_val = top + height
        near_top = top <= EDGE_TOLERANCE
        near_bottom = bottom_val >= PAGE_HEIGHT_HINT - EDGE_TOLERANCE
        return near_top or near_bottom

    def _should_skip_media_figure(
        fig_node: ET.Element,
        caption_text: str,
        has_ref: bool,
        raw_fileref: Optional[str],
        image_bytes: Optional[bytes],
        fallback_suffix: str,
    ) -> bool:
        if caption_text or has_ref:
            return False

        if not raw_fileref:
            return True

        name = Path(raw_fileref).name.lower()
        if any(keyword in name for keyword in DECORATIVE_NAME_KEYWORDS):
            return True

        width_attr = _safe_float(fig_node.get("width"))
        height_attr = _safe_float(fig_node.get("height"))
        left_attr = _safe_float(fig_node.get("left"))
        top_attr = _safe_float(fig_node.get("top"))

        full_bleed = _looks_like_full_bleed(width_attr, height_attr, left_attr, top_attr)
        vertical_strip = _looks_like_vertical_strip(width_attr, height_attr, left_attr)
        horizontal_strip = _looks_like_horizontal_strip(width_attr, height_attr, top_attr)

        if image_bytes is None:
            if full_bleed or vertical_strip or horizontal_strip:
                return True
            return False

        if len(image_bytes) == 0:
            return True

        width_px, height_px, _ = _inspect_image_bytes(image_bytes, fallback_suffix)
        full_page_pixels = (
            width_px >= 500
            and height_px >= 700
            and 0.9 <= (height_px / max(width_px, 1)) <= 1.6
        )

        if full_bleed or full_page_pixels:
            return True

        if vertical_strip or horizontal_strip:
            return True

        return False

    def _create_figure_from_media(page: str, fig: ET.Element, new_idx: int) -> ET.Element:
        figure_el = ET.Element("figure")
        fig_id = fig.get("id")
        if fig_id:
            figure_el.set("id", fig_id)
        fig_role = fig.get("type")
        if fig_role:
            figure_el.set("role", fig_role)
        figure_el.set("source-page", page)

        def _copy_attr(src_attr: str, dst_attr: str) -> None:
            val = fig.get(src_attr)
            if val:
                figure_el.set(dst_attr, val)

        _copy_attr("top", "source-top")
        _copy_attr("left", "source-left")
        _copy_attr("width", "source-width")
        _copy_attr("height", "source-height")
        figure_el.set("source-flow-idx", str(new_idx))

        media_ref = fig.find("media")
        fileref = None
        if media_ref is not None:
            fileref = media_ref.findtext("path") or media_ref.findtext("filename")
        if media_root_dir and fileref:
            asset_path = Path(media_root_dir) / fileref
            try:
                rel_path = asset_path.relative_to(output_root_dir)
            except ValueError:
                rel_path = Path(os.path.relpath(asset_path, output_root_dir))
            fileref = rel_path.as_posix()

        mediaobject = ET.SubElement(figure_el, "mediaobject")
        imageobject = ET.SubElement(mediaobject, "imageobject")
        attrs = {"fileref": fileref} if fileref else {}
        ET.SubElement(imageobject, "imagedata", **attrs)

        caption_node = fig.find("caption")
        if caption_node is not None:
            caption_text = (caption_node.findtext("text") or "").strip()
            caption_number = (caption_node.findtext("number") or "").strip()
            if caption_text or caption_number:
                caption_el = ET.SubElement(figure_el, "caption")
                para_el = ET.SubElement(caption_el, "para")
                if caption_text and caption_number:
                    para_el.text = f"{caption_number}. {caption_text}"
                elif caption_text:
                    para_el.text = caption_text
                else:
                    para_el.text = caption_number

        return figure_el

    def _find_anchor(target_page: str, target_top: Optional[float]) -> Tuple[Optional[Dict[str, Any]], bool]:
        same_page = [item for item in anchors if item["page"] == target_page]
        if target_top is not None:
            before = [
                item
                for item in same_page
                if item["top"] is not None and item["top"] <= target_top + top_tolerance
            ]
            if before:
                return max(before, key=lambda item: (item["top"], item["idx"])), True
            after = [
                item
                for item in same_page
                if item["top"] is not None and item["top"] > target_top
            ]
            if after:
                return min(after, key=lambda item: (item["top"], item["idx"])), False
        if same_page:
            return same_page[-1], True
        if anchors:
            return anchors[-1], True
        return None, True

    def _insert_figure(parent: ET.Element, ref: Optional[ET.Element], after: bool, fig_el: ET.Element) -> None:
        if parent is None:
            parent = structured_root
        children = list(parent)
        if ref is None:
            parent.append(fig_el)
            return
        try:
            idx = children.index(ref)
        except ValueError:
            parent.append(fig_el)
            return
        insert_idx = idx + 1 if after else idx
        parent.insert(insert_idx, fig_el)

    stats = {"inserted": 0, "skipped": 0}

    media_pages = media_root.findall(".//page")
    for page in media_pages:
        page_number = page.get("number")
        if page_number is None:
            continue
        figures_parent = page.find("figures")
        if figures_parent is None:
            continue
        figures = figures_parent.findall("figure")
        # sort by top coordinate to keep order
        def _figure_sort_key(fig_el: ET.Element) -> Tuple[float, str]:
            try:
                top_val = float(fig_el.get("top"))
            except (TypeError, ValueError):
                top_val = float("inf")
            return (top_val, fig_el.get("id") or "")

        for fig_el in sorted(figures, key=_figure_sort_key):
            try:
                figure_top = float(fig_el.get("top")) if fig_el.get("top") is not None else None
            except ValueError:
                figure_top = None
            anchor_record, place_after = _find_anchor(str(page_number), figure_top)
            parent = anchor_record["parent"] if anchor_record else None
            reference = anchor_record["element"] if anchor_record else None
            figure_idx = max_idx + 1

            caption_text = _figure_caption_text(fig_el)
            has_ref = bool((fig_el.get("ref") or "").strip())
            media_ref = fig_el.find("media")
            raw_fileref = None
            if media_ref is not None:
                raw_fileref = media_ref.findtext("path") or media_ref.findtext("filename")
            fallback_suffix = Path(raw_fileref).suffix if raw_fileref else ""

            image_bytes: Optional[bytes] = None
            if not caption_text and not has_ref and raw_fileref and media_root_dir:
                candidate_path = Path(media_root_dir) / raw_fileref
                try:
                    image_bytes = candidate_path.read_bytes()
                except OSError:
                    image_bytes = None

            if _should_skip_media_figure(
                fig_el,
                caption_text,
                has_ref,
                raw_fileref,
                image_bytes,
                fallback_suffix,
            ):
                stats["skipped"] += 1
                continue

            figure_docbook = _create_figure_from_media(str(page_number), fig_el, figure_idx)
            _insert_figure(parent, reference, place_after, figure_docbook)
            actual_parent = parent if parent is not None else structured_root
            parent_map[figure_docbook] = actual_parent
            anchors.append(
                {
                    "element": figure_docbook,
                    "parent": actual_parent,
                    "idx": figure_idx,
                    "page": str(page_number),
                    "top": figure_top,
                }
            )
            anchors.sort(key=lambda item: item["idx"])
            max_idx = figure_idx
            stats["inserted"] += 1

    try:
        ET.indent(structured_root, space="  ")
    except Exception:
        pass

    ET.ElementTree(structured_root).write(out_xml, encoding="utf-8", xml_declaration=True)
    if qa_out:
        Path(qa_out).write_text(json.dumps(stats, indent=2), encoding="utf-8")
    return stats


# ---------------------------
# Structurer (RittDocDTD-aware via labels.expanded.json)
# ---------------------------

def load_labels(labels_path: str) -> Dict:
    with open(labels_path, 'r', encoding='utf-8') as f:
        return json.load(f)

LIST_BULLET_RE = re.compile(r'^(?:[-•‣▪◦·*]|\([a-zA-Z]\)|\d+[.)])\s+')


def classify_block(e: ET.Element, fontstats: FontStats, h1_thresh: Optional[float], h2_thresh: Optional[float]) -> str:
    txt = get_text(e)
    size = _f(e.get('fontsize'))

    if CHAPTER_HEAD_RE.search(txt):
        return 'chapter.title'

    if not math.isnan(size):
        if h1_thresh and size >= h1_thresh - 0.25:
            return 'chapter.title'
        if h2_thresh and size >= h2_thresh - 0.25:
            return 'section.title'

    if LIST_BULLET_RE.search(txt):
        return 'list.item'

    return 'para'


def identify_special_section(text: str) -> Optional[str]:
    lowered = text.strip().lower()
    if not lowered:
        return None
    for mode, pattern in SPECIAL_SECTION_PATTERNS:
        if pattern.search(lowered):
            return mode
    return None


def is_toc_page_number(text: str) -> bool:
    if not text:
        return False
    stripped = text.strip()
    if not stripped:
        return False
    if stripped.isdigit():
        return True
    return bool(ROMAN_NUMERAL_RE.match(stripped))


def normalise_toc_text(text: str) -> tuple[str, bool]:
    if not text:
        return "", False
    cleaned = TOC_LEADER_RE.sub(" ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return "", False
    if is_toc_page_number(cleaned):
        return cleaned, True
    return cleaned, False


def looks_like_list_line(e: ET.Element) -> bool:
    txt = get_text(e)
    if LIST_BULLET_RE.search(txt):  # bullets / numbers
        return True
    # treat as list if short text and slightly deeper indent than typical body
    left = _f(e.get('left')); right = _f(e.get('right'))
    return len(txt) < 140 and not math.isnan(left) and left > 90.0  # tweak threshold


def build_structured(
    flow_xml: str,
    labels_path: str,
    out_xml: str,
    qa_out: Optional[str] = None,
    font_roles_path: Optional[str] = None,
    *,
    font_only: bool = False,
) -> Dict:
    """
    Build structured XML (DocBook-flavoured) from the flow XML produced earlier.
    Includes inline figure/media support so downstream packaging can locate assets.
    """
    import json

    # === Helpers =========================================================================
    FONT_HIERARCHY: Dict[float, Tuple[str, int]] = {
        27.0: ("chapter", 1),
        18.0: ("section", 2),
    }

    ROLE_LEVEL_MAP: Dict[str, Tuple[str, int]] = {
        "book.title": ("book.title", 0),
        "chapter": ("chapter", 1),
        "section": ("section", 2),
        "subsection": ("section", 3),
    }

    role_by_size: Dict[float, str] = {}
    chapter_font_size: Optional[float] = None
    body_font_size: Optional[float] = None
    if font_roles_path:
        try:
            _, loaded_role_map = _load_font_roles(font_roles_path)
            if loaded_role_map:
                role_by_size = loaded_role_map
                chapter_font_size = extract_chapter_font_size(role_by_size)
        except Exception as exc:
            print(f"⚠️ Failed to load font roles from {font_roles_path}: {exc}", flush=True)

    ORDERED_LIST_PATTERNS = [
        re.compile(r"^\(?\d{1,3}(?:\.\d+)?[.)]\s+"),
        re.compile(r"^\(?[ivxlcdm]{1,6}[.)]\s+", re.IGNORECASE),
        re.compile(r"^\(?[A-Za-z][.)]\s+"),
    ]
    BULLET_PATTERN = re.compile(r"^(?:[-–—•‣▪◦·*])\s+")
    MEDIA_LEAD_RE = re.compile(r"^\s*(fig(?:ure)?|table|diagram|diag|tab)\b", re.IGNORECASE)
    HIGHLIGHT_ATTR_CANDIDATES = (
        "background",
        "backgroundcolor",
        "background-color",
        "bgcolor",
        "fill",
        "fillcolor",
        "highlight",
        "border",
        "bordercolor",
        "border-color",
        "frame",
        "box",
        "callout",
    )
    HIGHLIGHT_COPY_ATTRS = (
        "background",
        "backgroundcolor",
        "bgcolor",
        "fill",
        "fillcolor",
        "border",
        "bordercolor",
        "color",
        "font",
        "fontname",
        "fontsize",
        "bold",
        "italic",
        "left",
        "top",
        "width",
        "height",
    )

    @dataclass
    class TextBlock:
        node: ET.Element
        text: str
        font_size: Optional[float]
        left: Optional[float]
        top: Optional[float]
        page: Optional[str]
        index: int
        orig_left: Optional[float] = None
        orig_top: Optional[float] = None
        width: Optional[float] = None
        height: Optional[float] = None
        page_width: Optional[float] = None
        page_height: Optional[float] = None
        band: int = 0
        column: int = 0
        is_micro: bool = False

    MICRO_PUNCT_ONLY = re.compile(r"^[\.\u2022·•⋅◦…‧\-–—]+$")
    HANGING_PUNCT = re.compile(r"^[\)\]\}\.,;:!?]+$")

    def _effective_left(block: TextBlock) -> Optional[float]:
        if block.orig_left is not None and not math.isnan(block.orig_left):
            return block.orig_left
        if block.left is not None and not math.isnan(block.left):
            return block.left
        return None

    def _effective_top(block: TextBlock) -> Optional[float]:
        if block.orig_top is not None and not math.isnan(block.orig_top):
            return block.orig_top
        if block.top is not None and not math.isnan(block.top):
            return block.top
        return None

    def _effective_height(block: TextBlock) -> float:
        if block.height is not None and not math.isnan(block.height):
            return block.height
        return 0.0

    def _mark_micro_fragments(blocks: List[TextBlock]) -> None:
        for block in blocks:
            cleaned = (block.text or "").strip()
            if not cleaned:
                block.is_micro = True
                continue
            width = block.width
            alnum_count = sum(1 for ch in cleaned if ch.isalnum())
            if width is not None and not math.isnan(width) and width <= 18.0:
                block.is_micro = True
                continue
            if len(cleaned) <= 2:
                block.is_micro = True
                continue
            if MICRO_PUNCT_ONLY.match(cleaned):
                block.is_micro = True
                continue
            if HANGING_PUNCT.match(cleaned) and len(cleaned) <= 6:
                block.is_micro = True
                continue
            if cleaned in {"+", "±", "†", "‡", "&"}:
                block.is_micro = True
                continue
            if cleaned.endswith(")") and alnum_count == 0 and len(cleaned) <= 4:
                block.is_micro = True
                continue
            if alnum_count == 0 and len(cleaned) <= 5:
                block.is_micro = True
                continue
            block.is_micro = False

    def _robust_gap_threshold(gaps: List[float]) -> float:
        positives = [g for g in gaps if g > 0.25]
        if not positives:
            return float("inf")
        positives.sort()
        median = statistics.median(positives)
        if len(positives) >= 4:
            mid = len(positives) // 2
            lower = positives[:mid]
            upper = positives[mid + (0 if len(positives) % 2 == 0 else 1):]
            q1 = statistics.median(lower) if lower else median
            q3 = statistics.median(upper) if upper else median
            iqr = q3 - q1
        else:
            iqr = 0.0
        baseline = median if median > 0 else positives[-1]
        threshold = baseline + 2.5 * iqr
        threshold = max(threshold, baseline * 2.5)
        threshold = max(threshold, 22.0)
        return threshold

    def _assign_vertical_bands(blocks: List[TextBlock]) -> None:
        ordered = sorted(blocks, key=lambda b: (_effective_top(b) if _effective_top(b) is not None else float("inf"), b.index))
        if not ordered:
            return
        gaps: List[float] = []
        prev_top = None
        prev_bottom = None
        for block in ordered:
            top = _effective_top(block)
            if top is None:
                continue
            height = _effective_height(block)
            if prev_bottom is not None:
                gap = top - prev_bottom
                gaps.append(gap)
            prev_bottom = top + height
            prev_top = top
        threshold = _robust_gap_threshold(gaps)
        band_id = 0
        prev_bottom = None
        for block in ordered:
            top = _effective_top(block)
            if top is None:
                block.band = band_id
                continue
            height = _effective_height(block)
            if prev_bottom is not None and top - prev_bottom > threshold:
                band_id += 1
                prev_bottom = None
            block.band = band_id
            bottom = top + height
            prev_bottom = bottom if prev_bottom is None else max(prev_bottom, bottom)

    def _compute_band_centers(band_blocks: List[TextBlock]) -> List[float]:
        non_micro = [b for b in band_blocks if not b.is_micro]
        positions = [(_effective_left(b), b) for b in non_micro if _effective_left(b) is not None]
        if not positions:
            fallback = [(_effective_left(b), b) for b in band_blocks if _effective_left(b) is not None]
            if not fallback:
                return [0.0]
            avg = sum(p for p, _ in fallback) / len(fallback)
            return [avg]
        positions.sort(key=lambda item: item[0])
        left_values = [p for p, _ in positions]
        page_width = None
        for _, block in positions:
            if block.page_width is not None and not math.isnan(block.page_width):
                page_width = block.page_width
                break
        if page_width is None:
            page_width = 612.0
        column_split_threshold = max(42.0, page_width * 0.08)
        largest_gap = 0.0
        split_idx = None
        for i in range(len(left_values) - 1):
            gap = left_values[i + 1] - left_values[i]
            if gap > largest_gap:
                largest_gap = gap
                split_idx = i
        if split_idx is not None and largest_gap >= column_split_threshold:
            left_cluster = left_values[: split_idx + 1]
            right_cluster = left_values[split_idx + 1 :]
            if left_cluster and right_cluster:
                left_center = sum(left_cluster) / len(left_cluster)
                right_center = sum(right_cluster) / len(right_cluster)
                if right_center - left_center >= column_split_threshold * 0.9:
                    return [left_center, right_center]
        avg = sum(left_values) / len(left_values)
        return [avg]

    def _assign_band_columns(blocks: List[TextBlock]) -> None:
        bands: Dict[int, List[TextBlock]] = {}
        for block in blocks:
            bands.setdefault(block.band, []).append(block)
        for band_blocks in bands.values():
            centers = _compute_band_centers(band_blocks)
            for block in band_blocks:
                left = _effective_left(block)
                if left is None:
                    block.column = 0
                    continue
                distances = [abs(left - center) for center in centers]
                column_idx = min(range(len(centers)), key=lambda idx: distances[idx])
                block.column = column_idx

    def _merge_micro_fragments(blocks: List[TextBlock]) -> None:
        ordered = sorted(blocks, key=lambda b: b.index)
        previous: Optional[TextBlock] = None
        for block in ordered:
            if block.is_micro:
                cleaned = (block.text or "").strip()
                if not cleaned:
                    continue
                if (
                    previous is not None
                    and previous.page == block.page
                    and previous.band == block.band
                    and previous.column == block.column
                    and (previous.text or "").strip()
                ):
                    prev_text = previous.text or ""
                    addition = cleaned
                    if prev_text.endswith("-"):
                        merged = prev_text[:-1] + addition.lstrip()
                    elif addition and addition[0] in ".,;:!?)]}":
                        merged = prev_text.rstrip() + addition
                    else:
                        merged = prev_text.rstrip() + " " + addition
                    previous.text = merged.strip()
                    block.text = ""
                continue
            if (block.text or "").strip():
                previous = block

    def _assign_layout_zones(per_page_blocks: Dict[str, List[TextBlock]]) -> None:
        for blocks in per_page_blocks.values():
            if not blocks:
                continue
            _mark_micro_fragments(blocks)
            _assign_vertical_bands(blocks)
            _assign_band_columns(blocks)
            _merge_micro_fragments(blocks)

    @dataclass
    class MediaBlock:
        node: ET.Element
        tag: str

    @dataclass
    class ListContext:
        indent: float
        element: ET.Element
        kind: str
        last_item: Optional[ET.Element] = None

    @dataclass
    class ParagraphState:
        element: ET.Element
        font_size: Optional[float]
        indent: Optional[float]

    def get_text_from_element(elem: ET.Element) -> str:
        parts: List[str] = []
        if elem.text:
            parts.append(elem.text)
        for child in elem:
            parts.append(get_text_from_element(child))
            if child.tail:
                parts.append(child.tail)
        return "".join(parts).strip()

    def get_font_size(elem: ET.Element) -> Optional[float]:
        value = elem.get("font_size") or elem.get("fontsize")
        if not value:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def classify_font(font_size: Optional[float]) -> tuple[str, int]:
        if font_size is None:
            return "para", 3
        candidates = []
        for size, (tag, level) in FONT_HIERARCHY.items():
            if abs(size - font_size) < 0.4:
                candidates.append((abs(size - font_size), tag, level))
        if candidates:
            _, tag, level = min(candidates, key=lambda item: item[0])
            return tag, level
        return "para", 3

    def normalise_path(path: str) -> str:
        return path.replace("\\", "/").strip()

    def extract_media_payload(node: ET.Element) -> Optional[Dict[str, str]]:
        filename = node.get("filename") or node.get("name")
        path_text = node.findtext("media/path") or node.findtext("path")
        if not path_text and filename:
            path_text = f"multimedia/{filename}"
        fileref = normalise_path(path_text or "")
        if not fileref:
            return None
        caption_text = node.findtext("caption/text") or node.findtext("caption")
        caption_num = node.findtext("caption/number") or node.get("ref")
        alt_text = node.findtext("alt") or node.get("alt")
        role = node.get("type") or node.tag
        media_id = (
            node.get("id")
            or node.get("name")
            or node.get("ref")
            or node.get("rid")
        )
        return {
            "fileref": fileref,
            "caption": caption_text,
            "number": caption_num,
            "alt": alt_text,
            "role": role,
            "id": media_id,
        }

    def get_float_attr(node: ET.Element, *names: str) -> Optional[float]:
        for name in names:
            value = node.get(name)
            if value is None:
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
        return None

    def count_words(text: str) -> int:
        return len(re.findall(r"\b[\w'-]+\b", text or ""))

    def detect_list_marker(text: str) -> tuple[Optional[str], str]:
        stripped = text.lstrip()
        for pattern in ORDERED_LIST_PATTERNS:
            match = pattern.match(stripped)
            if match:
                return "ordered", stripped[match.end():].strip()
        bullet_match = BULLET_PATTERN.match(stripped)
        if bullet_match:
            return "unordered", stripped[bullet_match.end():].strip()
        return None, stripped.strip()

    def detect_chapter_mode(title_text: str) -> str:
        if not title_text:
            return "regular"
        lowered = title_text.strip().lower()
        if re.search(r"\b(table\s+of\s+contents|toc|contents)\b", lowered):
            return "toc"
        if re.search(r"\bindex\b", lowered):
            return "index"
        if re.search(r"\bglossar(?:y|ies)\b", lowered):
            return "glossary"
        # if re.search(r"\bkey\s+(?:terms?|terminology|definitions|concepts)\b", lowered):
        #     return "key-terms"
        return "regular"

    def starts_with_media_keyword(text: str) -> bool:
        return bool(MEDIA_LEAD_RE.match(text or ""))

    def has_highlight_attributes(node: ET.Element) -> bool:
        role_attr = (node.get("role") or "").lower()
        if role_attr in {"sidebar", "highlight", "callout"}:
            return True
        # Check for is_highlight attribute added by grid_reading_order.py (requirement 2.d)
        if node.get("is_highlight") == "true":
            return True
        for attr in HIGHLIGHT_ATTR_CANDIDATES:
            value = node.get(attr)
            if value and str(value).lower() not in {"none", "transparent", "0", "false"}:
                return True
        return False

    def classify_highlight_block(block: TextBlock) -> Optional[str]:
        if not has_highlight_attributes(block.node):
            return None
        words = count_words(block.text)
        if words <= 4:
            return "short-heading"
        if starts_with_media_keyword(block.text):
            return "caption"
        return "sidebar"

    # === Builder =========================================================================
    class XMLBuilder:
        INDENT_THRESHOLD = 4.0
        SAME_LINE_EPS = 0.75

        def __init__(self, *, body_font_size: Optional[float], chapter_font_size: Optional[float]) -> None:
            self.root = ET.Element("book")
            self.stack: List[tuple[ET.Element, int]] = [(self.root, 0)]
            self._mode_stack: List[str] = ["regular"]
            self._list_stack: List[ListContext] = []
            self._paragraph_state: Optional[ParagraphState] = None
            self._chapter_counter = 0
            self._section_counters: Dict[int, int] = {}  # Counter per chapter for sections
            self._current_chapter_mode = "regular"
            self._special_last_para: Optional[tuple[ET.Element, Optional[float], Optional[float]]] = None
            self._last_section_font_size: Optional[float] = None
            self._last_section_level: int = 2
            self._chapter_heading_font_size: Optional[float] = None
            self._last_heading_role: Optional[str] = None
            self._last_heading_font_size: Optional[float] = None
            self._max_flow_index: int = 0
            self._pending_chapter_blocks: List[TextBlock] = []
            self._body_font_size = body_font_size
            self._expected_chapter_font = chapter_font_size
            self._front_matter_active = True
            # For index page reference tracking (requirement 4)
            self._page_content_index: Dict[str, List[tuple[str, str]]] = {}  # page_num -> [(text, uri)]

        def _current_container(self) -> ET.Element:
            return self.stack[-1][0]

        def _flush_paragraph(self) -> None:
            self._paragraph_state = None

        def _close_all_lists(self) -> None:
            self._list_stack.clear()

        def _set_metadata(self, element: ET.Element, block: TextBlock) -> None:
            if block.page is not None:
                element.set("source-page", str(block.page))
            if block.top is not None and not math.isnan(block.top):
                element.set("source-top", f"{block.top:.2f}")
            if block.left is not None and not math.isnan(block.left):
                element.set("source-left", f"{block.left:.2f}")
            element.set("source-flow-idx", str(block.index))
            if block.index > self._max_flow_index:
                self._max_flow_index = block.index

        def _ensure_chapter(self) -> None:
            if any(level == 1 for _, level in self.stack):
                return
            self._chapter_counter += 1
            chapter = ET.SubElement(self.root, "chapter")
            title = ET.SubElement(chapter, "title")
            if self._front_matter_active:
                chapter.set("role", "front-matter")
                title.text = "Front Matter"
                mode = "front-matter"
            else:
                title.text = f"Chapter {self._chapter_counter}"
                mode = "regular"
            self.stack.append((chapter, 1))
            self._mode_stack.append(mode)
            self._current_chapter_mode = mode
            self._chapter_heading_font_size = None
            self._special_last_para = None
            self._last_section_font_size = None
            self._last_section_level = 2
            self._list_stack.clear()
            self._paragraph_state = None

        def _container_has_body(self, element: ET.Element) -> bool:
            for child in element:
                if child.tag != "title":
                    return True
            return False

        def _append_to_title(self, element: ET.Element, text: str) -> None:
            title = element.find("title")
            if title is None:
                title = ET.SubElement(element, "title")
                title.text = text.strip()
                return
            existing = (title.text or "").strip()
            if existing:
                title.text = f"{existing} {text.strip()}"
            else:
                title.text = text.strip()

        def _consume_pending_chapter_prefix(self) -> str:
            if not self._pending_chapter_blocks:
                return ""
            parts = []
            for pending in self._pending_chapter_blocks:
                if pending.text:
                    parts.append(pending.text.strip())
            self._pending_chapter_blocks.clear()
            return " ".join(part for part in parts if part)

        def _flush_pending_chapter_blocks(self) -> None:
            if not self._pending_chapter_blocks:
                return
            buffered = list(self._pending_chapter_blocks)
            self._pending_chapter_blocks.clear()
            for block in buffered:
                self._start_paragraph(block)

        def _should_buffer_chapter_preamble(self, block: TextBlock) -> bool:
            # Don't buffer when in front-matter mode - content should be added to Front Matter chapter
            if self._front_matter_active:
                return False
            text = (block.text or "").strip()
            if not text:
                return False
            font_size = block.font_size
            if font_size is None:
                return False
            if self._body_font_size is not None and font_size < self._body_font_size + 4.0:
                return False
            if CHAPTER_HEAD_RE.match(text):
                return True
            lowered = text.lower()
            if lowered in {"chapter", "chap.", "chap"}:
                return True
            if re.fullmatch(r"\d{1,3}", text):
                if self._expected_chapter_font is not None:
                    return font_size >= self._expected_chapter_font - 3.0
                return True
            return False

        def _detect_special_heading(self, block: TextBlock) -> Optional[str]:
            text = (block.text or "").strip()
            if not text:
                return None
            mode = identify_special_section(text)
            if not mode:
                return None
            if (
                self._current_chapter_mode == mode
                and len(self.stack) > 1
                and self.stack[-1][1] == 1
            ):
                return None
            return mode

        def _open_container(
            self,
            tag: str,
            level: int,
            title_text: str,
            *,
            font_size: Optional[float],
            block: Optional[TextBlock] = None,
            mode_override: Optional[str] = None,
            role_override: Optional[str] = None,
        ) -> None:
            self._flush_paragraph()
            self._close_all_lists()
            while len(self.stack) > 1 and self.stack[-1][1] >= level:
                self.stack.pop()
                self._mode_stack.pop()
            self._current_chapter_mode = self._mode_stack[-1]
            parent = self._current_container()
            element = ET.SubElement(parent, tag)
            title = ET.SubElement(element, "title")
            title.text = title_text.strip() or f"Untitled {tag.title()}"
            self.stack.append((element, level))
            parent_mode = self._mode_stack[-1]
            self._mode_stack.append(parent_mode)
            mode_hint = mode_override or detect_chapter_mode(title_text)
            element_role = role_override
            if tag == "chapter":
                # Generate unique chapter ID: Ch0001, Ch0002, etc. (requirement 3)
                chapter_id = f"Ch{self._chapter_counter:04d}"
                element.set("id", chapter_id)
                # Reset section counters for new chapter
                self._section_counters[self._chapter_counter] = 0

                if element_role is None:
                    element_role = SPECIAL_ROLE_BY_MODE.get(mode_hint)
                if element_role:
                    element.set("role", element_role)
                self._mode_stack[-1] = mode_hint or parent_mode
                self._chapter_heading_font_size = font_size
                self._last_section_font_size = None
                self._last_section_level = 2
                self._special_last_para = None
                if mode_hint not in SPECIAL_SECTION_MODES:
                    self._front_matter_active = False
            elif tag == "section":
                # Generate unique section ID: Ch0001S001, Ch0001S002, etc. (requirement 3)
                if self._chapter_counter not in self._section_counters:
                    self._section_counters[self._chapter_counter] = 0
                self._section_counters[self._chapter_counter] += 1
                section_id = f"Ch{self._chapter_counter:04d}S{self._section_counters[self._chapter_counter]:03d}"
                element.set("id", section_id)

                self._last_section_font_size = font_size
                self._last_section_level = level
                if mode_hint in SPECIAL_SECTION_MODES:
                    self._mode_stack[-1] = mode_hint
            if block is not None:
                self._set_metadata(element, block)
            self._last_heading_role = tag
            self._last_heading_font_size = font_size
            self._current_chapter_mode = self._mode_stack[-1]

        def _start_paragraph(self, block: TextBlock) -> None:
            self._ensure_chapter()
            parent = self._current_container()
            para_el = ET.SubElement(parent, "para")
            para_el.text = block.text.strip()
            self._set_metadata(para_el, block)
            self._paragraph_state = ParagraphState(para_el, block.font_size, block.left)

        def _append_to_paragraph(self, block: TextBlock) -> None:
            if (
                self._paragraph_state
                and self._paragraph_state.element.text is not None
                and self._can_extend_paragraph(block)
            ):
                para_el = self._paragraph_state.element
                current_text = para_el.text or ""
                addition = block.text.strip()
                if current_text.endswith("-"):
                    para_el.text = current_text[:-1] + addition
                else:
                    separator = "" if not current_text else " "
                    para_el.text = current_text + separator + addition
                self._paragraph_state.font_size = block.font_size
                self._paragraph_state.indent = block.left
            else:
                self._start_paragraph(block)

        def _can_extend_paragraph(self, block: TextBlock) -> bool:
            state = self._paragraph_state
            if state is None:
                return False
            if block.font_size is not None and state.font_size is not None:
                if abs(block.font_size - state.font_size) > 0.35:
                    return False
            if block.left is not None and state.indent is not None:
                if abs(block.left - state.indent) > self.INDENT_THRESHOLD:
                    return False
            return True

        def _ensure_list(self, kind: str, indent: Optional[float]) -> ListContext:
            self._ensure_chapter()
            normalized = indent if indent is not None else 0.0
            if not self._list_stack:
                container = self._current_container()
                list_el = ET.SubElement(container, kind)
                ctx = ListContext(indent=normalized, element=list_el, kind=kind)
                self._list_stack.append(ctx)
                return ctx
            current = self._list_stack[-1]
            if normalized > current.indent + self.INDENT_THRESHOLD:
                if current.last_item is None:
                    current.last_item = ET.SubElement(current.element, "listitem")
                nested_parent = current.last_item
                list_el = ET.SubElement(nested_parent, kind)
                ctx = ListContext(indent=normalized, element=list_el, kind=kind)
                self._list_stack.append(ctx)
                return ctx
            if abs(normalized - current.indent) <= self.INDENT_THRESHOLD and current.kind == kind:
                return current
            while self._list_stack and normalized < self._list_stack[-1].indent - self.INDENT_THRESHOLD:
                self._list_stack.pop()
            if self._list_stack:
                top = self._list_stack[-1]
                if abs(normalized - top.indent) <= self.INDENT_THRESHOLD:
                    if top.kind != kind:
                        self._list_stack.pop()
                        return self._ensure_list(kind, indent)
                    return top
            container = self._current_container()
            list_el = ET.SubElement(container, kind)
            ctx = ListContext(indent=normalized, element=list_el, kind=kind)
            self._list_stack.append(ctx)
            return ctx

        def _append_list_item(self, ctx: ListContext, text: str, block: TextBlock) -> None:
            listitem = ET.SubElement(ctx.element, "listitem")
            self._set_metadata(listitem, block)
            para = ET.SubElement(listitem, "para")
            para.text = text.strip()
            ctx.last_item = listitem
            self._paragraph_state = None

        def _emit_caption(self, block: TextBlock) -> None:
            self._flush_paragraph()
            self._close_all_lists()
            self._ensure_chapter()
            parent = self._current_container()
            para = ET.SubElement(parent, "para")
            para.set("role", "caption")
            cleaned = block.text.strip()
            para.text = cleaned
            self._set_metadata(para, block)
            figure_match = FIG_REF_RE.search(cleaned)
            if figure_match:
                para.set("xref", figure_match.group(2))

        def _emit_sidebar(self, block: TextBlock) -> None:
            self._flush_paragraph()
            self._close_all_lists()
            self._ensure_chapter()
            parent = self._current_container()
            sidebar = ET.SubElement(parent, "sidebar")
            sidebar.set("role", "highlight")
            self._set_metadata(sidebar, block)
            for attr in HIGHLIGHT_COPY_ATTRS:
                value = block.node.get(attr)
                if value:
                    sidebar.set(attr, value)
            para = ET.SubElement(sidebar, "para")
            para.text = block.text.strip()

        def _handle_highlight(self, block: TextBlock, highlight_type: str) -> None:
            if highlight_type == "short-heading":
                target_level = self._last_section_level
                font_size = block.font_size or self._last_section_font_size
                if self._last_section_font_size is None:
                    target_level = 2
                elif font_size is not None and self._last_section_font_size is not None:
                    if font_size < self._last_section_font_size - 0.25:
                        target_level = min(self._last_section_level + 1, self._last_section_level + 1)
                    elif abs(font_size - self._last_section_font_size) <= 0.25:
                        target_level = self._last_section_level
                    elif (
                        self._chapter_heading_font_size
                        and font_size < self._chapter_heading_font_size
                    ):
                        target_level = max(self._last_section_level - 1, 2)
                    else:
                        target_level = 2
                else:
                    target_level = self._last_section_level
                self._ensure_chapter()
                self._open_container(
                    "section",
                    max(target_level, 2),
                    block.text,
                    font_size=block.font_size,
                    block=block,
                )
                return
            if highlight_type == "caption":
                self._emit_caption(block)
                return
            self._emit_sidebar(block)

        def _handle_heading(
            self,
            tag: str,
            level: int,
            block: TextBlock,
            *,
            forced_mode: Optional[str] = None,
        ) -> None:
            text = block.text.strip()
            font_size = block.font_size
            if tag == "chapter":
                prefix = self._consume_pending_chapter_prefix()
                if prefix:
                    text = f"{prefix} {text}".strip()
                if (
                    len(self.stack) > 1
                    and self.stack[-1][1] == 1
                    and self._last_heading_role == "chapter"
                    and not self._container_has_body(self.stack[-1][0])
                    and font_size is not None
                    and self._last_heading_font_size is not None
                    and abs(font_size - self._last_heading_font_size) <= 0.4
                ):
                    self._append_to_title(self.stack[-1][0], text)
                    self._chapter_heading_font_size = font_size
                    self._special_last_para = None
                else:
                    self._open_container("chapter", 1, text, font_size=font_size, block=block)
                    """
                    self._open_container(
                        "chapter",
                        1,
                        text,
                        font_size=font_size,
                        block=block,
                        mode_override=forced_mode,
                    )
                    """
                self._list_stack.clear()
                self._paragraph_state = None
            elif tag == "section":
                self._flush_pending_chapter_blocks()
                self._ensure_chapter()
                if (
                    len(self.stack) > 1
                    and self.stack[-1][0].tag == "section"
                    and self.stack[-1][1] >= level
                    and self._last_heading_role == "section"
                    and not self._container_has_body(self.stack[-1][0])
                    and font_size is not None
                    and self._last_heading_font_size is not None
                    and abs(font_size - self._last_heading_font_size) <= 0.4
                ):
                    self._append_to_title(self.stack[-1][0], text)
                else:
                    self._open_container("section", level, text, font_size=font_size, block=block)
                    """
                    self._open_container(
                        "section",
                        level,
                        text,
                        font_size=font_size,
                        block=block,
                        mode_override=forced_mode,
                    )
                    """
                self._list_stack.clear()
                self._paragraph_state = None
                self._special_last_para = None

        def _append_index_like_line(self, block: TextBlock, text: str) -> bool:
            self._flush_paragraph()
            self._close_all_lists()
            parent = self._current_container()
            if self._special_last_para:
                para, _, last_top = self._special_last_para
                if (
                    last_top is not None
                    and block.top is not None
                    and abs(block.top - last_top) <= self.SAME_LINE_EPS
                ):
                    current_text = para.text or ""
                    if current_text.endswith("-"):
                        para.text = current_text[:-1] + text
                    elif current_text.endswith(" ") or not current_text:
                        # Already has a space OR is empty, so no separator needed
                        para.text = current_text + text
                    else:
                        separator = "" if not current_text else " "
                        para.text = current_text + separator + text
                    self._special_last_para = (para, block.left, block.top)
                    return True

            # Parse index entry for page number references (requirement 4)
            # Format: "AIDS 559" or "AIDS 559, 560" or "AIDS 559-561"
            para = ET.SubElement(parent, "para")

            # Try to extract term and page numbers from the text
            # Pattern: text followed by numbers at the end
            import re
            page_num_pattern = re.compile(r'^(.+?)\s+([\d,\s\-]+)$')
            match = page_num_pattern.match(text.strip())

            if match and self._current_chapter_mode == "index":
                term = match.group(1).strip()
                page_refs = match.group(2).strip()

                # Store the term with plain text for now
                para.text = term

                # Parse page numbers (can be comma-separated or range)
                page_numbers = []
                for part in page_refs.replace(',', ' ').split():
                    part = part.strip()
                    if '-' in part:
                        # Range like "559-561"
                        try:
                            start, end = part.split('-')
                            page_numbers.extend(range(int(start), int(end) + 1))
                        except:
                            pass
                    elif part.isdigit():
                        page_numbers.append(int(part))

                # Add page numbers as linkable references
                if page_numbers:
                    para.set("index-term", term)
                    para.set("page-refs", page_refs)
                    # Note: Actual linking to section IDs would require a second pass
                    # after all content is processed to find where each term appears
                    # For now, we store the page references as attributes
                    # A post-processing step would resolve these to section IDs

                    # Display format: "term (page_refs)"
                    para.text = f"{term} ({page_refs})"
            else:
                para.text = text

            self._set_metadata(para, block)
            self._special_last_para = (para, block.left, block.top)
            return True

        def _append_toc_line(self, block: TextBlock, text: str) -> bool:
            self._flush_paragraph()
            self._close_all_lists()
            cleaned, append_to_previous = normalise_toc_text(text)
            if not cleaned:
                return False
            if append_to_previous and self._special_last_para:
                para, _, _ = self._special_last_para
                current_text = para.text or ""
                if current_text.endswith("-"):
                    para.text = current_text[:-1] + cleaned
                elif current_text.endswith(" ") or not current_text:
                    # Already has a space OR is empty, so no separator needed
                    para.text = current_text + text
                else:
                    separator = "" if not current_text else " "
                    para.text = current_text + separator + cleaned
                self._special_last_para = (para, block.left, block.top)
                return True
            parent = self._current_container()
            para = ET.SubElement(parent, "para")
            para.text = cleaned
            self._set_metadata(para, block)
            self._special_last_para = (para, block.left, block.top)
            return True

        def _handle_special_chapter_line(self, block: TextBlock) -> bool:
            text = (block.text or "").strip()
            if not text:
                return False
            mode = self._current_chapter_mode
            if mode == "toc":
                return self._append_toc_line(block, text)
            if mode in {"index", "glossary"}:
                return self._append_index_like_line(block, text)
            self._flush_paragraph()
            self._close_all_lists()
            if self._special_last_para:
                para, last_left, last_top = self._special_last_para
                if (
                    last_left is not None
                    and block.left is not None
                    and abs(block.left - last_left) <= self.INDENT_THRESHOLD
                    and last_top is not None
                    and block.top is not None
                    and abs(block.top - last_top) <= self.SAME_LINE_EPS
                ):
                    current_text = para.text or ""
                    addition = text
                    if current_text.endswith("-"):
                        para.text = current_text[:-1] + addition
                    elif current_text.endswith(" ") or not current_text:
                        # Already has a space OR is empty, so no separator needed
                        para.text = current_text + addition
                    else:
                        separator = "" if not current_text else " "
                        para.text = current_text + separator + addition
                    self._special_last_para = (para, block.left, block.top)
                    return True
            parent = self._current_container()
            para = ET.SubElement(parent, "para")
            para.text = text
            self._special_last_para = (para, block.left, block.top)
            return True

        def _handle_regular_body_block(
            self,
            block: TextBlock,
            prev_block: Optional[TextBlock],
            next_block: Optional[TextBlock],
        ) -> bool:
            if self._pending_chapter_blocks:
                self._flush_pending_chapter_blocks()
            self._special_last_para = None
            marker_kind, stripped_text = detect_list_marker(block.text)
            indent = block.left
            prev_indent = prev_block.left if prev_block else None
            next_indent = next_block.left if next_block else None

            if marker_kind:
                self._flush_paragraph()
                list_kind = "orderedlist" if marker_kind == "ordered" else "itemizedlist"
                ctx = self._ensure_list(list_kind, indent)
                self._append_list_item(ctx, stripped_text or block.text, block)
                return True

            indent_is_increase = (
                prev_indent is not None
                and indent is not None
                and indent > prev_indent + self.INDENT_THRESHOLD
            )

            if indent_is_increase:
                if (
                    next_indent is not None
                    and indent is not None
                    and abs(next_indent - indent) <= self.INDENT_THRESHOLD
                ):
                    self._flush_paragraph()
                    ctx = self._ensure_list("itemizedlist", indent)
                    self._append_list_item(ctx, block.text, block)
                    return True
                if next_indent is None or (
                    prev_indent is not None and next_indent is not None and next_indent <= prev_indent + self.INDENT_THRESHOLD
                ):
                    self._emit_caption(block)
                    return True

            self._close_all_lists()
            self._append_to_paragraph(block)
            return True

        def handle_text_block(
            self,
            block: TextBlock,
            prev_block: Optional[TextBlock],
            next_block: Optional[TextBlock],
        ) -> bool:
            text = block.text.strip()
            if not text:
                return False
            special_mode = self._detect_special_heading(block)
            if special_mode:
                self._handle_heading(
                    "chapter",
                    1,
                    block,
                    forced_mode=special_mode,
                )
                return False
            if self._should_buffer_chapter_preamble(block):
                self._pending_chapter_blocks.append(block)
                return False
            tag, level = classify_font(block.font_size)

            # if self._current_chapter_mode in SPECIAL_SECTION_MODES:
            #    tag, level = ("para", 3)
            # else:
            #    tag, level = classify_font(block.font_size)
            if tag in {"chapter", "section"}:
                self._handle_heading(tag, level, block)
                return False
            highlight_type = classify_highlight_block(block)
            if highlight_type:
                self._handle_highlight(block, highlight_type)
                return False
            if self._current_chapter_mode in {"toc", "index"}:
            # if self._current_chapter_mode in SPECIAL_SECTION_MODES:
                return self._handle_special_chapter_line(block)
            return self._handle_regular_body_block(block, prev_block, next_block)

        def handle_media(self, node: ET.Element) -> bool:
            payload = extract_media_payload(node)
            if not payload:
                return False
            self._flush_paragraph()
            self._close_all_lists()
            self._special_last_para = None
            self._ensure_chapter()
            figure_el = ET.SubElement(self._current_container(), "figure")
            if payload.get("id"):
                figure_el.set("id", payload["id"])
            if payload.get("role"):
                figure_el.set("role", payload["role"])

            mediaobject = ET.SubElement(figure_el, "mediaobject")
            imageobject = ET.SubElement(mediaobject, "imageobject")
            ET.SubElement(imageobject, "imagedata", fileref=payload["fileref"])

            if payload.get("alt"):
                textobject = ET.SubElement(mediaobject, "textobject")
                para = ET.SubElement(textobject, "para")
                para.text = payload["alt"].strip()

            caption_text = payload.get("caption")
            if caption_text:
                caption = ET.SubElement(figure_el, "caption")
                para = ET.SubElement(caption, "para")
                if payload.get("number"):
                    para.text = f"{payload['number']}. {caption_text.strip()}"
                else:
                    para.text = caption_text.strip()
            return True

        def finish(self) -> ET.Element:
            self._flush_paragraph()
            self._close_all_lists()
            return self.root

    # === Main ============================================================================
    print(f"Reading {flow_xml}...", flush=True)
    try:
        tree = ET.parse(flow_xml)
        flow_root = tree.getroot()
    except Exception as exc:
        print(f"✗ Error parsing {flow_xml}: {exc}", flush=True)
        return {"error": str(exc)}

    size_counts: Dict[float, int] = {}
    for node in flow_root.findall(".//text"):
        fs = None
        try:
            fs = float(node.get("font_size") or node.get("fontsize") or "")
        except (TypeError, ValueError):
            pass
        if fs is None or math.isnan(fs):
            continue
        size_counts[fs] = size_counts.get(fs, 0) + 1

    if size_counts:
        body_font_size = max(size_counts.items(), key=lambda kv: kv[1])[0]

    if not role_by_size:
        fallback_roles: Dict[float, str] = {}
        if body_font_size is not None:
            fallback_roles[body_font_size] = "paragraph"

        chapter_candidate_threshold = (body_font_size + 4.0) if body_font_size is not None else None
        min_chapter_count = 5
        raw_chapter_candidates = [
            size
            for size, count in size_counts.items()
            if (chapter_candidate_threshold is None or size >= chapter_candidate_threshold)
            and count >= min_chapter_count
        ]
        if not raw_chapter_candidates:
            raw_chapter_candidates = [
                size for size in size_counts.keys()
                if chapter_candidate_threshold is None or size >= chapter_candidate_threshold
            ]
        chapter_candidates = sorted(set(raw_chapter_candidates), reverse=True)
        for size in chapter_candidates[:2]:
            fallback_roles[size] = "chapter"

        section_candidates = [
            size
            for size, count in sorted(size_counts.items(), reverse=True)
            if (
                (body_font_size is not None and size > body_font_size + 2.0)
                and size not in fallback_roles
                and count >= 5
            )
        ]
        if section_candidates:
            fallback_roles[section_candidates[0]] = "section"

        role_by_size = fallback_roles
        if not chapter_font_size:
            chapter_font_size = extract_chapter_font_size(role_by_size)

    if role_by_size:
        updated_hierarchy: Dict[float, Tuple[str, int]] = {}
        for size_str, role in role_by_size.items():
            size = float(size_str)
            mapping = ROLE_LEVEL_MAP.get(role)
            if mapping:
                updated_hierarchy[size] = mapping
        if any(tag == "chapter" for tag, _ in updated_hierarchy.values()):
            FONT_HIERARCHY = updated_hierarchy
        else:
            # ensure at least one chapter size exists
            chapter_sizes = sorted(
                [float(size) for size in role_by_size.keys() if role_by_size[size] == "chapter"],
                reverse=True,
            )
            if chapter_sizes:
                FONT_HIERARCHY = {chapter_sizes[0]: ("chapter", 1)}

    if not chapter_font_size and FONT_HIERARCHY:
        chapter_sizes = [size for size, (tag, _) in FONT_HIERARCHY.items() if tag == "chapter"]
        if chapter_sizes:
            chapter_font_size = max(chapter_sizes)

    builder = XMLBuilder(body_font_size=body_font_size, chapter_font_size=chapter_font_size)
    text_count = 0
    skipped_text = 0
    figure_count = 0

    media_tags = {"figure", "image", "diagram", "media"}

    flow_sequence: List[tuple[str, object]] = []
    text_indices: List[int] = []
    text_counter = 0
    page_text_blocks: Dict[str, List[TextBlock]] = {}

    for page_idx, page in enumerate(flow_root.findall(".//page")):
        page_number_attr = page.get("number")
        page_id = page_number_attr or str(page_idx)
        page_width = get_float_attr(page, "width")
        page_height = get_float_attr(page, "height")
        page_text_blocks.setdefault(page_id, [])
        for node in list(page):
            tag = (node.tag or "").lower()
            if tag == "text":
                text = get_text_from_element(node)
                font_size = get_font_size(node)
                left = get_float_attr(node, "left", "orig_left")
                orig_left = get_float_attr(node, "orig_left", "left")
                top = get_float_attr(node, "top", "orig_top")
                orig_top = get_float_attr(node, "orig_top", "top")
                width = get_float_attr(node, "width", "orig_width")
                height = get_float_attr(node, "height", "orig_height")
                block = TextBlock(
                    node=node,
                    text=text,
                    font_size=font_size,
                    left=left,
                    top=top,
                    page=page_id,
                    index=text_counter,
                    orig_left=orig_left,
                    orig_top=orig_top,
                    width=width,
                    height=height,
                    page_width=page_width,
                    page_height=page_height,
                )
                position = len(flow_sequence)
                flow_sequence.append(("text", block))
                text_indices.append(position)
                text_counter += 1
                page_text_blocks[page_id].append(block)
            elif tag in media_tags:
                flow_sequence.append(("media", MediaBlock(node=node, tag=tag)))
            else:
                continue

    _assign_layout_zones(page_text_blocks)

    next_text_index: Dict[int, Optional[int]] = {}
    for idx, pos in enumerate(text_indices):
        nxt = text_indices[idx + 1] if idx + 1 < len(text_indices) else None
        next_text_index[pos] = nxt

    prev_text_block: Optional[TextBlock] = None

    for idx, (kind, payload) in enumerate(flow_sequence):
        if kind == "text":
            block: TextBlock = payload  # type: ignore[assignment]
            if not (block.text or "").strip():
                skipped_text += 1
                continue
            if (
                prev_text_block is not None
                and (
                    block.page != prev_text_block.page
                    or block.band != prev_text_block.band
                    or block.column != prev_text_block.column
                )
            ):
                prev_text_block = None
            next_block = None
            nxt_idx = next_text_index.get(idx)
            if nxt_idx is not None:
                next_kind, next_payload = flow_sequence[nxt_idx]
                if next_kind == "text":
                    next_block = next_payload  # type: ignore[assignment]
            counts_for_indent = builder.handle_text_block(block, prev_text_block, next_block)
            if counts_for_indent:
                prev_text_block = block
            text_count += 1
        elif kind == "media":
            media_payload: MediaBlock = payload  # type: ignore[assignment]
            if builder.handle_media(media_payload.node):
                figure_count += 1
        else:
            continue

    structured_root = builder.finish()

    try:
        ET.indent(structured_root, space="  ")
    except Exception:
        pass

    output_path = Path(out_xml)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(structured_root).write(output_path, encoding="utf-8", xml_declaration=True)

    qa = {
        "chapters": len(structured_root.findall(".//chapter")),
        "sections": len(structured_root.findall(".//section")),
        "paras": len(structured_root.findall(".//para")),
        "figures": len(structured_root.findall(".//figure")),
        "skipped_text": skipped_text,
    }

    print(
        f"✓ Processed {text_count} text nodes (skipped {skipped_text}); "
        f"inserted {figure_count} figures",
        flush=True,
    )
    print(
        f"✓ Structured XML → {output_path} "
        f"(chapters={qa['chapters']}, sections={qa['sections']}, "
        f"paras={qa['paras']}, figures={qa['figures']})",
        flush=True,
    )

    if qa_out:
        Path(qa_out).write_text(json.dumps(qa, indent=2), encoding="utf-8")

    return qa


def qa_reading_order(flow_xml: str, structured_xml: str, out_report: str) -> None:
    fr = ET.parse(flow_xml).getroot()
    sr = ET.parse(structured_xml).getroot()

    issues: List[Dict] = []

    # 1) Pages with zero headings but lots of text → might be missed splits
    for page in fr.findall('.//page'):
        texts = sum(1 for ch in page if ch.tag == 'text')
        placeholders = sum(1 for ch in page if ch.tag == 'figure-placeholder')
        if texts > 80:
            issues.append({"type": "dense_page", "page": page.get('number'), "texts": texts, "placeholders": placeholders})

    # 2) Chapters with extremely long runs without a section title
    for chap in sr.findall('.//chapter'):
        paras = chap.findall('.//para')
        sections = chap.findall('section')
        if paras and not sections and len(paras) > 50:
            issues.append({"type": "chapter_without_sections", "chapter_title": (chap.findtext('title') or '').strip(), "para_count": len(paras)})

    # 3) Orphan media placeholders (if any remain)
    orphans = fr.findall('.//figure-placeholder')
    for ph in orphans:
        issues.append({"type": "unresolved_placeholder", "page": ph.get('flow_index'), "ref": ph.get('ref')})

    with open(out_report, 'w', encoding='utf-8') as f:
        json.dump({"issues": issues}, f, indent=2)
    print(f"✓ QA report → {out_report}")

def _load_font_roles(path):
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    sizes = [float(s) for s in cfg["sizes_asc"]]         # ascending
    role_by_size = {float(k): v["role"] for k, v in cfg["roles_by_size"].items()}
    return sizes, role_by_size

SIZE_EPS = 0.15  # points tolerance
def nearest_role(size_value: float, sizes_sorted: list[float], role_by_size: dict[float, str]) -> str:
    if size_value is None:
        return "paragraph"
    # find closest tier
    i = bisect.bisect_left(sizes_sorted, size_value)
    candidates = []
    if i < len(sizes_sorted): candidates.append(sizes_sorted[i])
    if i > 0: candidates.append(sizes_sorted[i-1])
    if not candidates: return "paragraph"
    best = min(candidates, key=lambda s: abs(s - size_value))
    if abs(best - size_value) <= SIZE_EPS:
        return role_by_size.get(best, "paragraph")
    # outside tolerance → choose nearest anyway
    return role_by_size.get(best, "paragraph")


# ---------------------------
# Chapter detection helpers
# ---------------------------

def is_chapter_marker(text: str, font_size: Optional[float], chapter_font_size: Optional[float]) -> bool:
    """
    Check if this text is a chapter marker (e.g., "Chapter 1", "Chapter 5").
    
    Args:
        text: The text content to check (e.g., "Chapter 1")
        font_size: The font size of this text element
        chapter_font_size: The expected font size for chapter headings (from font_roles.json)
    
    Returns:
        True if this looks like a chapter heading, False otherwise
    
    Teacher explanation:
        Imagine you're looking for chapter markers in a book:
        1. First, check if the text SAYS "Chapter 1" or "Chapter 2" (using regex)
        2. Second, check if it's in the RIGHT font size (the font we designated for chapters)
        3. If BOTH conditions are true, we found a chapter!
    
    Example:
        is_chapter_marker("Chapter 5", 24.0, 24.0) → True (text matches, font matches)
        is_chapter_marker("Chapter 5", 12.0, 24.0) → False (font doesn't match)
        is_chapter_marker("This is Chapter 5", 24.0, 24.0) → False (text format doesn't match)
    """
    if text is None or font_size is None or chapter_font_size is None:
        return False
    
    # Step 1: Check if text matches pattern "Chapter 1", "Chapter 2", etc.
    # CHAPTER_HEAD_RE is the regex defined at top of file
    if not CHAPTER_HEAD_RE.match(text):
        return False
    
    # Step 2: Check if font size matches chapter font size (within tolerance)
    # SIZE_EPS = 0.15 points is our tolerance for matching fonts
    # Why tolerance? PDFs sometimes have tiny rounding errors in font sizes
    if abs(font_size - chapter_font_size) <= SIZE_EPS:
        return True
    
    return False


def extract_chapter_font_size(role_by_size: dict[float, str]) -> Optional[float]:
    """
    Find the font size designated for chapters from the role mapping.
    
    Args:
        role_by_size: Dict mapping font sizes to their roles 
                      e.g., {24.0: "chapter", 18.0: "section", 12.0: "paragraph"}
    
    Returns:
        The font size for chapters, or None if not defined
    
    Teacher explanation:
        Your font_roles.json file tells us which font sizes are used for different purposes:
        - 24pt is for chapters
        - 18pt is for sections  
        - 12pt is for paragraphs
        
        This function asks: "Which font size means 'this is a chapter heading'?"
        It loops through all sizes and finds the one marked as role="chapter"
    
    Example:
        role_by_size = {24.0: "chapter", 18.0: "section", 12.0: "paragraph"}
        extract_chapter_font_size(role_by_size) → 24.0
    """
    for size, role in role_by_size.items():
        if role == "chapter":
            return size
    
    # If no chapter font found, return None
    return None


# ---------------------------
# Chapter grouper
# ---------------------------

class ChapterGrouper:
    """
    Groups text elements into chapters based on chapter detection.
    
    Teacher explanation:
        Think of this like a librarian organizing pages into books:
        1. As we read pages in order, we look for "Chapter X" markers
        2. When we find a chapter marker, we start a new chapter group
        3. Everything after that belongs to the chapter until we find the next "Chapter X"
        4. The chapter TITLE can span multiple lines if they're the same font size
    
    How to use it:
        grouper = ChapterGrouper(chapter_font_size=24.0)
        for text, font_size in elements:
            grouper.add_element(text, font_size)
        chapters = grouper.get_chapters()  # Returns list of chapter groups
    """
    
    def __init__(self, chapter_font_size: Optional[float]):
        """
        Initialize the chapter grouper.
        
        Args:
            chapter_font_size: The font size that marks chapter headings (from font_roles.json)
        """
        self.chapter_font_size = chapter_font_size
        self.chapters: List[Dict] = []  # List of chapter groups
        self.current_chapter: Optional[Dict] = None
        self.current_title_lines: List[str] = []  # Lines that are part of chapter title
        self.last_title_font_size: Optional[float] = None
    
    def add_element(self, text: str, font_size: Optional[float]) -> None:
        """
        Add a text element and decide if it belongs to current chapter or starts new chapter.
        
        Args:
            text: The text content
            font_size: The font size of this text
        
        Logic flow (like a decision tree):
        1. Is this a chapter marker? → Start new chapter
        2. Are we building a title? (same/bigger font) → Add to title
        3. Otherwise → Add to chapter body
        """
        if text is None or not text.strip():
            return
        
        text = text.strip()
        
        # Check if this is a chapter marker
        if is_chapter_marker(text, font_size, self.chapter_font_size):
            # Save previous chapter if it exists
            if self.current_chapter is not None:
                self._finalize_current_chapter()
            
            # Start new chapter with this text as first title line
            self.current_chapter = {
                "title_lines": [text],
                "body_lines": [],
                "first_font_size": font_size
            }
            self.last_title_font_size = font_size
            self.current_title_lines = [text]
        
        elif self.current_chapter is None:
            # We haven't found a chapter marker yet, skip this element
            # (This handles preamble/front matter before first chapter)
            pass
        
        elif font_size is not None and self.last_title_font_size is not None:
            # We're already in a chapter, decide where this element goes
            
            # Is this part of the chapter title?
            # (same size or bigger than the chapter marker)
            if font_size >= (self.last_title_font_size - SIZE_EPS):
                # This is part of the chapter title
                self.current_chapter["title_lines"].append(text)
                self.last_title_font_size = font_size
                self.current_title_lines.append(text)
            else:
                # This is body content (smaller font)
                self.current_chapter["body_lines"].append(text)
        
        else:
            # Fallback: add to body
            if self.current_chapter is not None:
                self.current_chapter["body_lines"].append(text)
    
    def _finalize_current_chapter(self) -> None:
        """
        Finish the current chapter and add it to our chapters list.
        """
        if self.current_chapter is not None:
            self.chapters.append(self.current_chapter)
            self.current_chapter = None
            self.current_title_lines = []
            self.last_title_font_size = None
    
    def finalize(self) -> None:
        """
        Call this when done adding elements to finalize the last chapter.
        """
        self._finalize_current_chapter()
    
    def get_chapters(self) -> List[Dict]:
        """
        Get all detected chapters.
        
        Returns:
            List of chapter dicts with structure:
            [
                {
                    "title_lines": ["Chapter 1", "Introduction"],
                    "body_lines": ["Lorem ipsum...", "Dolor sit amet..."]
                },
                ...
            ]
        """
        return self.chapters
    
    def get_chapter_summary(self) -> Dict:
        """
        Get a summary of detected chapters for debugging/logging.
        
        Returns:
            Dict with chapter stats like:
            {
                "total_chapters": 5,
                "chapters": [
                    {"title": "Chapter 1 Introduction", "body_lines": 150},
                    ...
                ]
            }
        """
        summary = {
            "total_chapters": len(self.chapters),
            "chapters": []
        }
        
        for ch in self.chapters:
            title = " ".join(ch["title_lines"])
            body_count = len(ch["body_lines"])
            summary["chapters"].append({
                "title": title,
                "body_lines": body_count
            })
        
        return summary

# map role → level consistent with your labels containers (book > chapter > section > subsection > para)
LEVEL = {"book.title": 0, "chapter": 1, "section": 2, "subsection": 3, "paragraph": 4}
CONTAINER_FOR_ROLE = {
    "book.title": None,            # attach to <book><title>
    "chapter": "chapter",          # starts container
    "section": "section",          # starts container (under chapter)
    "subsection": "section",       # starts container (under section)
    "paragraph": "para"            # leaf
}

# ---------------------------
# CLI
# ---------------------------

def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description='Flow Builder + Media Binder + Structurer + QA')
    ap.add_argument("--font-roles", help="font_roles.json from font_roles_auto.py")
    ap.add_argument("--font-only", action="store_true", help="Skip heuristics and build structure using font tiers only")
    
    sub = ap.add_subparsers(dest='cmd', required=True)

    p_build = sub.add_parser('build', help='Build flow XML from reading-order XML')
    p_build.add_argument('--reading', required=True)
    p_build.add_argument('--out-flow', required=True)
    p_build.add_argument('--labels', required=False)
    p_build.add_argument('--report', required=False)

    p_bind = sub.add_parser('bind', help='Bind media into an existing flow XML')
    p_bind.add_argument('--flow', required=True)
    p_bind.add_argument('--media', required=True)
    p_bind.add_argument('--out', required=True)
    p_bind.add_argument('--report', required=False)

    p_all = sub.add_parser('build+bind+structure', help='End-to-end build, bind, and structure')
    p_all.add_argument('--reading', required=True)
    p_all.add_argument('--media', required=True)
    p_all.add_argument('--labels', required=True)
    p_all.add_argument('--out', required=True)
    p_all.add_argument('--report', required=False)

    args = ap.parse_args()

    if args.cmd == 'build':
        build_flow(args.reading, args.out_flow, labels_path=args.labels, qa_out=args.report)
        return 0

    if args.cmd == 'bind':
        # bind_media(args.flow, args.media, args.out, qa_out=args.report)
        bind_media(args.flow, args.media, args.out, qa_out=args.report)
        return 0

    if args.cmd == 'build+bind+structure':
        tmp_flow = str(Path(args.out).with_suffix('.flow.tmp.xml'))
        build_flow(args.reading, tmp_flow, labels_path=args.labels, qa_out=args.report)
        tmp_structured = str(Path(args.out).with_suffix('.structured.tmp.xml'))
        build_structured(
            tmp_flow,
            args.labels,
            tmp_structured,
            qa_out=args.report,
            font_roles_path=args.font_roles,
            font_only=args.font_only,
        )
        media_root_dir = str(Path(args.media).resolve().parent)
        merge_media_into_structured(tmp_structured, args.media, args.out, media_root_dir=media_root_dir)
        
        # optional: produce extra QA (do this BEFORE cleanup!)
        if args.report:
            qa_reading_order(tmp_flow, args.out, args.report)
        
        # Now cleanup temp files AFTER we're done using them
        try:
            Path(tmp_flow).unlink(missing_ok=True)
            Path(tmp_structured).unlink(missing_ok=True)
        except Exception:
            pass
        return 0

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
