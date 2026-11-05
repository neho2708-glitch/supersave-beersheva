"""Database access. The schema is owned by database/schema.prisma."""
from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from .connectors.base import Connector
from .connectors.portals import ALL_CONNECTORS

ROOT = Path(__file__).resolve().parents[2]

CHAIN_COLORS = {
    "shufersal": "#d32027",
    "rami-levy": "#0a58a6",
    "carrefour": "#00498f",
    "yochananof": "#c8102e",
    "victory": "#e4002b",
    "osher-ad": "#f7941d",
    "mahsanei-hashuk": "#00853e",
}

CHAIN_SITES = {
    "shufersal": "https://www.shufersal.co.il",
    "rami-levy": "https://www.rami-levy.co.il",
    "carrefour": "https://www.carrefour.co.il",
    "yochananof": "https://yochananof.co.il",
    "victory": "https://www.victoryonline.co.il",
    "osher-ad": "https://osherad.co.il",
    "mahsanei-hashuk": "https://www.mck.co.il",
}

CATEGORIES = [
    ("produce", "פירות וירקות", "Fruit & Vegetables", "#4d7c0f", "🥦"),
    ("dairy", "מוצרי חלב וביצים", "Dairy & Eggs", "#0284c7", "🥛"),
    ("meat", "בשר ודגים", "Meat & Fish", "#b91c1c", "🥩"),
    ("bread", "לחמים ומאפים", "Bread & Bakery", "#b45309", "🥖"),
    ("drinks", "משקאות", "Drinks", "#7c3aed", "🥤"),
    ("snacks", "חטיפים וממתקים", "Snacks & Sweets", "#db2777", "🍫"),
    ("cleaning", "מוצרי ניקיון", "Cleaning", "#0891b2", "🧽"),
    ("hygiene", "היגיינה וטיפוח", "Hygiene & Care", "#9333ea", "🧴"),
    ("dry", "מוצרים יבשים ושימורים", "Pantry & Canned", "#a16207", "🥫"),
    ("frozen", "קפואים", "Frozen", "#2563eb", "🧊"),
]


def load_env() -> None:
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


def connect() -> psycopg.Connection:
    load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(url, row_factory=dict_row)


def upsert_data_source(conn: psycopg.Connection, connector: Connector) -> int:
    row = conn.execute(
        """INSERT INTO "DataSources" ("chainId", name, url, "connectionType", "fileFormat",
               "updateFrequencyHours", "termsNote")
           VALUES (%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT ("chainId", url) DO UPDATE SET name=EXCLUDED.name,
               "connectionType"=EXCLUDED."connectionType", "fileFormat"=EXCLUDED."fileFormat",
               "updateFrequencyHours"=EXCLUDED."updateFrequencyHours", "termsNote"=EXCLUDED."termsNote"
           RETURNING id""",
        (
            connector.slug,
            connector.source_name,
            connector.source_url,
            connector.connection_type,
            connector.file_format,
            connector.update_frequency_hours,
            connector.terms_note,
        ),
    ).fetchone()
    return row["id"]


def seed(conn: psycopg.Connection) -> dict:
    """Load chains, categories, data sources and the product catalogue. Prices are not seeded."""
    for order, cls in enumerate(ALL_CONNECTORS):
        conn.execute(
            """INSERT INTO "SupermarketChains" (id, "nameHe", "nameEn", "chainCodes", color, website, "sortOrder")
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (id) DO UPDATE SET "nameHe"=EXCLUDED."nameHe", "nameEn"=EXCLUDED."nameEn",
                 "chainCodes"=EXCLUDED."chainCodes", color=EXCLUDED.color, website=EXCLUDED.website,
                 "sortOrder"=EXCLUDED."sortOrder" """,
            (
                cls.slug,
                cls.chain_name_he,
                cls.chain_name_en,
                list(cls.chain_codes),
                CHAIN_COLORS[cls.slug],
                CHAIN_SITES[cls.slug],
                order,
            ),
        )
        upsert_data_source(conn, cls())
    for order, (cid, he, en, color, icon) in enumerate(CATEGORIES):
        conn.execute(
            """INSERT INTO "ProductCategories" (id, "nameHe", "nameEn", "sortOrder", color, icon)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (id) DO UPDATE SET "nameHe"=EXCLUDED."nameHe", "nameEn"=EXCLUDED."nameEn",
                 "sortOrder"=EXCLUDED."sortOrder", color=EXCLUDED.color, icon=EXCLUDED.icon""",
            (cid, he, en, order, color, icon),
        )
    products = json.loads((ROOT / "database" / "catalog" / "products.json").read_text(encoding="utf-8"))
    for product in products:
        conn.execute(
            """INSERT INTO "Products" (id, barcode, "nameHe", "nameEn", brand, "categoryId", "sizeAmount",
                   "sizeUnit", "soldByWeight", "matchKind")
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (id) DO UPDATE SET "nameHe"=EXCLUDED."nameHe", "nameEn"=EXCLUDED."nameEn",
                 brand=EXCLUDED.brand, "categoryId"=EXCLUDED."categoryId", "sizeAmount"=EXCLUDED."sizeAmount",
                 "sizeUnit"=EXCLUDED."sizeUnit", "soldByWeight"=EXCLUDED."soldByWeight",
                 "matchKind"=EXCLUDED."matchKind", active=true""",
            (
                product["id"],
                product.get("barcode"),
                product["nameHe"],
                product.get("nameEn"),
                product.get("brand"),
                product["category"],
                product.get("sizeAmount"),
                product.get("sizeUnit"),
                product.get("soldByWeight", False),
                product.get("matchKind", "BARCODE"),
            ),
        )
    ids = [p["id"] for p in products]
    conn.execute('UPDATE "Products" SET active=false WHERE NOT (id = ANY(%s))', (ids,))

    images_path = ROOT / "database" / "catalog" / "images.json"
    images = 0
    if images_path.exists():
        conn.execute('DELETE FROM "ProductImages"')
        for row in json.loads(images_path.read_text(encoding="utf-8")):
            if row["productId"] in ids:
                conn.execute(
                    """INSERT INTO "ProductImages" ("productId", url, "sourceUrl", source, license, attribution)
                       VALUES (%s,%s,%s,%s,%s,%s)""",
                    (row["productId"], row["url"], row.get("sourceUrl"), row["source"], row.get("license"), row.get("attribution")),
                )
                images += 1
    conn.commit()
    return {"products": len(products), "images": images}
