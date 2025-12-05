#!/usr/bin/env python3
import argparse, json, math
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

def _f(x):
    try: return float(x)
    except: return math.nan

def main():
    ap = argparse.ArgumentParser(description="Auto-derive font roles per book")
    ap.add_argument("reading_xml")
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-roles", type=int, default=5, help="max distinct size tiers to classify")
    ap.add_argument("--size-decimals", type=int, default=2, help="round sizes to this many decimals")
    ap.add_argument("--ignore-small", type=float, default=6.0, help="ignore sizes below (pts)")
    args = ap.parse_args()

    root = ET.parse(args.reading_xml).getroot()

    # build map from font id → nominal size (pts)
    font_size_map = {}
    for fs in root.findall(".//fontspec"):
        fid = fs.get("id")
        size_attr = fs.get("size")
        size_val = _f(size_attr)
        if fid is not None and not math.isnan(size_val):
            font_size_map[fid] = round(size_val, args.size_decimals)

    # gather sizes (optionally include weight/family if present on spans or text)
    size_counts = Counter()
    weights = defaultdict(Counter)
    families = defaultdict(Counter)

    for tx in root.findall(".//text"):
        font_id = tx.get("font")
        size_hint = tx.get("font_size") or tx.get("size")
        if font_id in font_size_map:
            s = font_size_map[font_id]
        else:
            s = _f(size_hint)
        if math.isnan(s) or s < args.ignore_small: 
            continue
        s = round(s, args.size_decimals)
        sz_key = str(s)
        size_counts[sz_key] += 1

        # optional: peek nested spans
        for sp in tx.findall(".//span"):
            w = sp.get("weight") or sp.get("bold")
            if w: weights[sz_key][str(w).lower()] += 1
            fam = sp.get("family") or sp.get("font")
            if fam: families[sz_key][fam] += 1

    # sort sizes ASC → small → large
    tiers = sorted((float(k), v, k) for k, v in size_counts.items())
    sizes_sorted = [str(round(sz, args.size_decimals)) for sz, _, _ in tiers]

    # default every tier to paragraph so we can promote selectively
    roles = {
        sz_key: {
            "role": "paragraph",
            "count": size_counts[sz_key],
            "top_weight": weights[sz_key].most_common(1)[0][0] if weights[sz_key] else None,
            "top_family": families[sz_key].most_common(1)[0][0] if families[sz_key] else None,
        }
        for sz_key in sizes_sorted
    }

    if not tiers:
        # nothing to map
        out = {
            "sizes_asc": sizes_sorted,
            "roles_by_size": roles,
            "notes": {
                "largest_is_book_title": False,
                "mapping_source": "auto-derived per book (empty)"
            }
        }
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        print(f"✓ Wrote font roles → {args.out}")
        return

    # helpers for later decisions
    tiers_desc = sorted(tiers, key=lambda item: item[0], reverse=True)
    body_size_val, _, _ = max(
        ((float(sz_key), count, sz_key) for sz_key, count in size_counts.items()),
        key=lambda item: item[1]
    )
    body_size = body_size_val
    heading_threshold = max(body_size + 1.0, body_size * 1.2)

    # 1) Largest size → book title
    largest_size_val, _, largest_key = tiers_desc[0]
    roles[largest_key]["role"] = "book.title"

    # 2) Choose chapter tier: prefer the most common large heading size
    min_chapter_count_primary = 5
    min_chapter_count_fallback = 2  # allow very short books when needed
    pool_size = max(args.max_roles, 6)
    heading_pool = tiers_desc[1: 1 + pool_size]
    chapter_candidates = [
        (size_val, count, sz_key)
        for size_val, count, sz_key in heading_pool
        if size_val >= heading_threshold and count >= min_chapter_count_primary
    ]
    if not chapter_candidates:
        chapter_candidates = [
            (size_val, count, sz_key)
            for size_val, count, sz_key in heading_pool
            if size_val >= heading_threshold and count >= min_chapter_count_fallback
        ]

    chapter_size_val = None
    if chapter_candidates:
        chapter_candidates.sort(key=lambda item: (-item[0], -item[1]))
        chapter_size_val, chapter_count, chapter_key = chapter_candidates[0]
        roles[chapter_key]["role"] = "chapter"
    else:
        chapter_size_val = largest_size_val

    # 3) Section tier: next sizable heading below the chapter tier
    min_section_count = 5
    section_candidates = [
        (size_val, count, sz_key)
        for size_val, count, sz_key in tiers_desc
        if roles[sz_key]["role"] == "paragraph"
        and size_val < chapter_size_val
        and size_val >= max(body_size + 0.5, body_size * 1.1)
        and count >= min_section_count
    ]
    section_size_val = chapter_size_val
    if section_candidates:
        section_candidates.sort(key=lambda item: (-item[0], -item[1]))
        section_size_val, _, section_key = section_candidates[0]
        roles[section_key]["role"] = "section"

    # 4) Subsection tier: smaller headings below section tier
    min_subsection_count = 5
    subsection_candidates = [
        (size_val, count, sz_key)
        for size_val, count, sz_key in tiers_desc
        if roles[sz_key]["role"] == "paragraph"
        and size_val < section_size_val
        and size_val >= max(body_size, body_size * 1.05)
        and count >= min_subsection_count
    ]
    if subsection_candidates:
        subsection_candidates.sort(key=lambda item: (-item[0], -item[1]))
        _, _, subsection_key = subsection_candidates[0]
        roles[subsection_key]["role"] = "subsection"

    out = {
        "sizes_asc": sizes_sorted,
        "roles_by_size": roles,
        "notes": {
            "largest_is_book_title": True,
            "mapping_source": "auto-derived per book"
        }
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"✓ Wrote font roles → {args.out}")

if __name__ == "__main__":
    main()
