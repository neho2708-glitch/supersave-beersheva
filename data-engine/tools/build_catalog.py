"""Build the ~300 product catalogue from real chain data.

Barcodes are never typed by hand: each packaged product is a barcode seen in the
files of several chains and hand-picked in database/catalog/picks.json. Fresh produce has no shared barcode, so it is
a curated generic item matched by name rules (see fresh_rules.py), barcode = null.

Usage: py data-engine/tools/build_catalog.py <candidates.json> <out products.json> <picks.json>
"""
from __future__ import annotations

import collections
import json
import re
import sys

sys.path.insert(0, __file__.rsplit("tools", 1)[0])
from supersave_engine.fresh_rules import FRESH_PRODUCTS  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

def best_name(names: list[str]) -> str:
    # The longest name is the least truncated; chains cut names at various lengths.
    cleaned = {re.sub(r"\s+", " ", n).strip() for n in names}
    return max(cleaned, key=lambda n: (len(n) <= 44, len(n)))


def majority_size(row: dict) -> tuple[float, str] | None:
    sizes = [tuple(c["size"]) for c in row["chains"].values() if c["size"] and c["size"][1] != "unit"]
    if not sizes:
        sizes = [tuple(c["size"]) for c in row["chains"].values() if c["size"]]
    if not sizes:
        return None
    amount, unit = collections.Counter(sizes).most_common(1)[0][0]
    return float(amount), unit


def main() -> None:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    picks = json.load(open(sys.argv[3], encoding="utf-8"))
    rows = {r["code"]: r for r in data["barcoded"]}
    products: list[dict] = []
    for dept, codes in picks.items():
        for code in codes:
            row = rows[code]  # KeyError here means a pick is not in the real files
            size = majority_size(row)
            brand = collections.Counter(row["brands"]).most_common(1)
            weighted = sum(1 for c in row["chains"].values() if c["weighted"]) > row["n"] / 2
            products.append({
                "id": code,
                "barcode": code,
                "nameHe": best_name(row["names"]),
                "brand": brand[0][0] if brand else None,
                "category": dept,
                "sizeAmount": 1000 if weighted else (size[0] if size else None),
                "sizeUnit": "g" if weighted else (size[1] if size else None),
                "soldByWeight": weighted,
                "matchKind": "BARCODE",
                "chainsSeen": row["n"],
            })
    for fresh in FRESH_PRODUCTS:
        products.append({
            "id": fresh["id"],
            "barcode": None,
            "nameHe": fresh["name"],
            "brand": None,
            "category": fresh["category"],
            "sizeAmount": 1000,
            "sizeUnit": "g",
            "soldByWeight": True,
            "matchKind": "FRESH_RULE",
        })
    with open(sys.argv[2], "w", encoding="utf-8", newline="\n") as out:
        json.dump(products, out, ensure_ascii=False, indent=1)
    print(collections.Counter(p["category"] for p in products), len(products))


main()
