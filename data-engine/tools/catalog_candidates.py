"""Find popular products: barcodes that appear in the most chains' real Be'er Sheva files.

Usage: py data-engine/tools/catalog_candidates.py <dir-of-downloaded-pricefull> <out.json>
Each input file is named <chain-slug>-pricefull.bin.
"""
from __future__ import annotations

import collections
import glob
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from supersave_engine import feed, normalize  # noqa: E402

source_dir, out_path = sys.argv[1], sys.argv[2]
recent = datetime(2026, 11, 5) - timedelta(days=45)
seen: dict[str, dict] = {}
weighted: dict[str, list] = collections.defaultdict(list)
for path in sorted(glob.glob(os.path.join(source_dir, "*-pricefull.bin"))):
    chain = os.path.basename(path).replace("-pricefull.bin", "")
    with open(path, "rb") as handle:
        _, items = feed.parse_prices(handle.read())
    for item in items:
        if item.price is None or item.price <= 0:
            continue
        if not normalize.is_global_barcode(item.item_code, item.item_type):
            if item.is_weighted:
                weighted[chain].append((item.item_code, item.name, str(item.price)))
            continue
        row = seen.setdefault(item.item_code, {"code": item.item_code, "chains": {}, "names": [], "brands": []})
        size = normalize.item_size(item)
        fresh = item.last_sale_at is not None and item.last_sale_at >= recent
        row["chains"][chain] = {
            "price": str(item.price),
            "fresh": fresh,
            "size": [str(size.amount), size.unit] if size else None,
            "weighted": item.is_weighted,
        }
        row["names"].append(item.name)
        if item.manufacturer and item.manufacturer not in ("לא ידוע", "unknown", "כללי"):
            row["brands"].append(item.manufacturer)

rows = []
for row in seen.values():
    row["n"] = len(row["chains"])
    row["n_fresh"] = sum(1 for c in row["chains"].values() if c["fresh"])
    rows.append(row)
rows.sort(key=lambda r: (-r["n_fresh"], -r["n"]))
with open(out_path, "w", encoding="utf-8") as out:
    json.dump({"barcoded": [r for r in rows if r["n"] >= 2], "weighted": weighted}, out, ensure_ascii=False)
hist = collections.Counter(r["n"] for r in rows)
print("barcodes", len(rows), "by chain count", sorted(hist.items()))
print("fresh>=5:", sum(1 for r in rows if r["n_fresh"] >= 5), "fresh>=4:", sum(1 for r in rows if r["n_fresh"] >= 4))
print({k: len(v) for k, v in weighted.items()})
