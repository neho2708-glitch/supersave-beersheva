"""Fetch real product photos from Open Food Facts / Open Beauty Facts by barcode.

These projects publish images under CC BY-SA, so attribution is recorded in
database/catalog/images.json and shown on the site. Products with no openly licensed
photo get the generated placeholder in the UI; nothing is scraped from chain websites.

Usage: py data-engine/tools/fetch_images.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
PRODUCTS = ROOT / "database" / "catalog" / "products.json"
MANIFEST = ROOT / "database" / "catalog" / "images.json"
OUT_DIR = ROOT / "frontend" / "public" / "products"
SOURCES = [
    ("Open Food Facts", "https://world.openfoodfacts.org"),
    ("Open Beauty Facts", "https://world.openbeautyfacts.org"),
    ("Open Products Facts", "https://world.openproductsfacts.org"),
]
FIELDS = "image_front_small_url,image_front_url,image_url,product_name,product_name_en"
HEADERS = {"User-Agent": "SuperSave/1.0 (grocery price comparison; open data)"}


def lookup(session: requests.Session, barcode: str) -> tuple[str, str, str] | None:
    for name, base in SOURCES:
        try:
            response = session.get(f"{base}/api/v2/product/{barcode}.json", params={"fields": FIELDS}, timeout=25)
        except requests.RequestException:
            continue
        if response.status_code != 200:
            continue
        product = response.json().get("product") or {}
        url = product.get("image_front_url") or product.get("image_url") or product.get("image_front_small_url")
        if url:
            return name, f"{base}/product/{barcode}", url
    return None


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else []
    done = {row["productId"] for row in manifest}
    session = requests.Session()
    session.headers.update(HEADERS)
    misses = 0
    for product in products:
        barcode = product.get("barcode")
        if not barcode or barcode in done:
            continue
        found = lookup(session, barcode)
        time.sleep(0.7)  # stay well inside the project's published rate limits
        if not found:
            misses += 1
            continue
        source, page, url = found
        # Prefer the 400px rendition, which is enough for shelves and the product panel.
        sized = url.replace(".full.jpg", ".400.jpg")
        try:
            image = session.get(sized, timeout=30)
            if image.status_code != 200:
                image = session.get(url, timeout=30)
            image.raise_for_status()
        except requests.RequestException:
            misses += 1
            continue
        if not image.headers.get("content-type", "").startswith("image/") or len(image.content) < 1500:
            misses += 1
            continue
        (OUT_DIR / f"{barcode}.jpg").write_bytes(image.content)
        manifest.append({
            "productId": barcode,
            "url": f"/products/{barcode}.jpg",
            "sourceUrl": page,
            "source": source,
            "license": "CC BY-SA 3.0",
            "attribution": f"{source} contributors",
        })
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding="utf-8", newline="\n")
    print(f"images: {len(manifest)}, no openly licensed image: {misses}")


main()
