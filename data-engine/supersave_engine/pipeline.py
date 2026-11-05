"""Import pipeline: portal -> raw archive -> parse -> normalize -> match -> database."""
from __future__ import annotations

import hashlib
import json
import os
import re
import statistics
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from psycopg import Connection
from psycopg.types.json import Jsonb

from . import db, feed
from .connectors.base import Connector, RemoteFile
from .connectors.portals import ALL_CONNECTORS, get_connector
from .matching import Matcher, MatchResult, build_product
from .normalize import item_size, price_per_unit
from .pricing import is_beer_sheva, promo_terms, to_israel

RAW_DIR = db.ROOT / "data-engine" / "raw"
LOG_DIR = db.ROOT / "verification" / "import-logs"
MAX_REASONABLE_PRICE = Decimal(5000)
LOGS_KEPT_PER_CHAIN = 5


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def public_url(url: str) -> str:
    """Drop signed query strings before storing or logging a URL."""
    return url.split("?")[0]


@dataclass
class Stats:
    branches: int = 0
    files_found: int = 0
    files_downloaded: int = 0
    items_parsed: int = 0
    products: set[str] = field(default_factory=set)
    prices_valid: int = 0
    prices_changed: int = 0
    promotions: int = 0
    review: int = 0
    errors: list[dict] = field(default_factory=list)


def archive_raw(slug: str, remote: RemoteFile, payload: bytes) -> str:
    folder = RAW_DIR / slug / (remote.published_at.strftime("%Y%m%d") if remote.published_at else "undated")
    target = folder / remote.name
    # Windows refuses paths over 260 characters unless they use the extended form.
    extended = (lambda p: Path("\\\\?\\" + str(p.resolve()))) if os.name == "nt" else (lambda p: p)
    extended(folder).mkdir(parents=True, exist_ok=True)
    extended(target).write_bytes(payload)
    return str(target.relative_to(db.ROOT)).replace("\\", "/")


def record_file(conn: Connection, source_id: int, job_id: int, remote: RemoteFile, payload: bytes, slug: str) -> tuple[int, bool]:
    """Store the audit record for a downloaded file. Returns (id, already_processed)."""
    digest = hashlib.sha256(payload).hexdigest()
    existing = conn.execute(
        """SELECT id, "itemCount" FROM "SourceFiles"
           WHERE "dataSourceId"=%s AND "fileName"=%s AND sha256=%s""",
        (source_id, remote.name, digest),
    ).fetchone()
    if existing:
        return existing["id"], existing["itemCount"] is not None
    row = conn.execute(
        """INSERT INTO "SourceFiles" ("dataSourceId", "importJobId", "fileName", url, kind, "storeCode",
               "publishedAt", "downloadedAt", sha256, "sizeBytes", "storedPath")
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (
            source_id,
            job_id,
            remote.name,
            public_url(remote.url),
            remote.kind,
            remote.store_code,
            to_israel(remote.published_at),
            utcnow(),
            digest,
            len(payload),
            archive_raw(slug, remote, payload),
        ),
    ).fetchone()
    return row["id"], False


def clean_address(address: str) -> str | None:
    """Some chains leave stray links or 'unknown' in the address field."""
    cleaned = " ".join(re.sub(r"https?:\S*", "", address).split())
    return None if cleaned in ("", "unknown") else cleaned


def upsert_branches(conn: Connection, connector: Connector, stores: list[feed.StoreRecord]) -> dict[str, int]:
    now = utcnow()
    result: dict[str, int] = {}
    for store in stores:
        if not is_beer_sheva(store):
            continue
        code = store.store_id.lstrip("0") or "0"
        row = conn.execute(
            """INSERT INTO "Branches" ("chainId", "storeCode", "subchainCode", "subchainName", "nameHe", address,
                   city, active, "lastSeenAt")
               VALUES (%s,%s,%s,%s,%s,%s,%s,true,%s)
               ON CONFLICT ("chainId", "storeCode") DO UPDATE SET "subchainCode"=EXCLUDED."subchainCode",
                 "subchainName"=EXCLUDED."subchainName", "nameHe"=EXCLUDED."nameHe", address=EXCLUDED.address,
                 active=true, "lastSeenAt"=EXCLUDED."lastSeenAt"
               RETURNING id""",
            (
                connector.slug,
                code,
                store.subchain_id or None,
                store.subchain_name or None,
                store.name.strip(),
                clean_address(store.address),
                "באר שבע",
                now,
            ),
        ).fetchone()
        result[code] = row["id"]
    # A branch the chain no longer lists stops being offered, but its history is kept.
    conn.execute(
        """UPDATE "Branches" SET active=false WHERE "chainId"=%s AND NOT ("storeCode" = ANY(%s))""",
        (connector.slug, list(result)),
    )
    return result


def load_matcher(conn: Connection) -> tuple[Matcher, dict]:
    rows = conn.execute(
        """SELECT id, barcode, "nameHe", brand, "sizeAmount", "sizeUnit", "soldByWeight"
           FROM "Products" WHERE active"""
    ).fetchall()
    products = [build_product(r) for r in rows]
    return Matcher(products), {p.id: p for p in products}


def upsert_chain_item(conn: Connection, slug: str, item: feed.ItemRecord, match: MatchResult, now: datetime) -> None:
    size = item_size(item)
    product_id = match.product_id if match.status == "MATCHED" else None
    candidate = match.product_id if match.status == "REVIEW" else None
    # A human decision (MANUAL or REJECTED) is never overwritten by the automatic matcher.
    conn.execute(
        """INSERT INTO "ChainItems" ("chainId", "itemCode", "itemType", name, manufacturer, "sizeAmount", "sizeUnit",
               "isWeighted", "productId", "candidateProductId", "matchMethod", "matchStatus", "matchScore",
               "matchReason", "samplePrice", "lastSeenAt")
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT ("chainId", "itemCode") DO UPDATE SET name=EXCLUDED.name, manufacturer=EXCLUDED.manufacturer,
             "sizeAmount"=EXCLUDED."sizeAmount", "sizeUnit"=EXCLUDED."sizeUnit", "isWeighted"=EXCLUDED."isWeighted",
             "samplePrice"=EXCLUDED."samplePrice", "lastSeenAt"=EXCLUDED."lastSeenAt",
             "productId"=CASE WHEN "ChainItems"."matchMethod"='MANUAL' OR "ChainItems"."matchStatus"='REJECTED'
                  THEN "ChainItems"."productId" ELSE EXCLUDED."productId" END,
             "candidateProductId"=CASE WHEN "ChainItems"."matchMethod"='MANUAL' OR "ChainItems"."matchStatus"='REJECTED'
                  THEN "ChainItems"."candidateProductId" ELSE EXCLUDED."candidateProductId" END,
             "matchStatus"=CASE WHEN "ChainItems"."matchMethod"='MANUAL' OR "ChainItems"."matchStatus"='REJECTED'
                  THEN "ChainItems"."matchStatus" ELSE EXCLUDED."matchStatus" END,
             "matchMethod"=CASE WHEN "ChainItems"."matchMethod"='MANUAL' OR "ChainItems"."matchStatus"='REJECTED'
                  THEN "ChainItems"."matchMethod" ELSE EXCLUDED."matchMethod" END,
             "matchScore"=EXCLUDED."matchScore", "matchReason"=EXCLUDED."matchReason" """,
        (
            slug,
            item.item_code,
            item.item_type,
            item.name,
            item.manufacturer,
            size.amount if size else None,
            size.unit if size else None,
            item.is_weighted,
            product_id,
            candidate,
            match.method,
            match.status,
            match.score,
            match.reason,
            item.price,
            now,
        ),
    )


def apply_items(
    conn: Connection,
    slug: str,
    branch_id: int,
    source_id: int,
    file_id: int,
    remote: RemoteFile,
    items: list[feed.ItemRecord],
    matcher: Matcher,
    products: dict,
    stats: Stats,
) -> dict[str, Decimal]:
    """Apply a price file to one branch. Returns item code -> price, for promotions."""
    now = utcnow()
    published = to_israel(remote.published_at) or now
    approved = {
        r["itemCode"]: r
        for r in conn.execute(
            """SELECT "itemCode", "productId", "matchStatus" FROM "ChainItems"
               WHERE "chainId"=%s AND ("matchMethod"='MANUAL' OR "matchStatus"='REJECTED')""",
            (slug,),
        ).fetchall()
    }
    # When a fresh rule matches several items in one store (for example two tomato SKUs),
    # the one sold most recently represents the shelf price.
    chosen: dict[str, tuple[feed.ItemRecord, MatchResult]] = {}
    prices_by_code: dict[str, Decimal] = {}
    for item in items:
        if item.price is None or item.price <= 0 or item.price > MAX_REASONABLE_PRICE:
            continue
        prices_by_code[item.item_code] = item.price
        decision = approved.get(item.item_code)
        if decision and decision["matchStatus"] == "REJECTED":
            continue
        if decision and decision["productId"]:
            match = MatchResult("MATCHED", "MANUAL", decision["productId"], 100.0, "approved by an administrator")
        else:
            match = matcher.match(item)
        if match is None:
            continue
        upsert_chain_item(conn, slug, item, match, now)
        if match.status == "REVIEW":
            stats.review += 1
            continue
        current = chosen.get(match.product_id)
        if current is None or _preferred(item, current[0]):
            chosen[match.product_id] = (item, match)

    for product_id, (item, _match) in chosen.items():
        product = products.get(product_id)
        if product is None:
            continue
        if product.sold_by_weight:
            unit_price, unit_label = item.price, 'ק"ג'
        else:
            per_unit = price_per_unit(item.price, product.size)
            unit_price, unit_label = per_unit if per_unit else (None, None)
        previous = conn.execute(
            """SELECT "regularPrice" FROM "ProductPrices" WHERE "productId"=%s AND "branchId"=%s""",
            (product_id, branch_id),
        ).fetchone()
        conn.execute(
            """INSERT INTO "ProductPrices" ("productId", "branchId", "chainId", "itemCode", "regularPrice", "unitPrice",
                   "unitLabel", "dataSourceId", "sourceFileId", "collectedAt", "sourcePublishedAt", "priceChangedAt",
                   "lastSaleAt", "verificationStatus", raw)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'VERIFIED',%s)
               ON CONFLICT ("productId", "branchId") DO UPDATE SET "itemCode"=EXCLUDED."itemCode",
                 "regularPrice"=EXCLUDED."regularPrice", "unitPrice"=EXCLUDED."unitPrice",
                 "unitLabel"=EXCLUDED."unitLabel", "dataSourceId"=EXCLUDED."dataSourceId",
                 "sourceFileId"=EXCLUDED."sourceFileId", "collectedAt"=EXCLUDED."collectedAt",
                 "sourcePublishedAt"=EXCLUDED."sourcePublishedAt", "priceChangedAt"=EXCLUDED."priceChangedAt",
                 "lastSaleAt"=EXCLUDED."lastSaleAt", "verificationStatus"='VERIFIED', raw=EXCLUDED.raw""",
            (
                product_id,
                branch_id,
                slug,
                item.item_code,
                item.price,
                unit_price,
                unit_label,
                source_id,
                file_id,
                now,
                published,
                to_israel(item.price_updated_at),
                to_israel(item.last_sale_at),
                Jsonb(item.raw),
            ),
        )
        if previous is None or previous["regularPrice"] != item.price:
            conn.execute(
                """INSERT INTO "PriceHistory" ("productId", "branchId", "chainId", price, "recordedAt",
                       "sourcePublishedAt", "sourceFileId")
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (product_id, branch_id, slug, item.price, now, published, file_id),
            )
            if previous is not None:
                stats.prices_changed += 1
        stats.products.add(product_id)
    return prices_by_code


def _preferred(candidate: feed.ItemRecord, current: feed.ItemRecord) -> bool:
    return (candidate.last_sale_at or datetime.min) > (current.last_sale_at or datetime.min)


def apply_promotions(
    conn: Connection,
    slug: str,
    branch_id: int,
    file_id: int,
    promotions: list[feed.PromotionRecord],
    stats: Stats,
) -> None:
    """Replace a branch's promotions with the content of its latest full file."""
    now = utcnow()
    rows = conn.execute(
        """SELECT pp."itemCode", pp."productId", pp."regularPrice" FROM "ProductPrices" pp WHERE pp."branchId"=%s""",
        (branch_id,),
    ).fetchall()
    by_code = {r["itemCode"]: r for r in rows}
    conn.execute('DELETE FROM "Promotions" WHERE "branchId"=%s', (branch_id,))
    for promo in promotions:
        relevant = [item for item in promo.items if item.item_code in by_code]
        if not relevant:
            continue
        if promo.ends_at and to_israel(promo.ends_at) < now:
            continue
        row = conn.execute(
            """INSERT INTO "Promotions" ("chainId", "branchId", "promotionCode", description, "startsAt", "endsAt",
                   "sourceUpdated", "clubId", "requiresClub", "isCoupon", remarks, "sourceFileId", "collectedAt", raw)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT ("branchId", "promotionCode") DO NOTHING RETURNING id""",
            (
                slug,
                branch_id,
                promo.promotion_id,
                promo.description,
                to_israel(promo.starts_at),
                to_israel(promo.ends_at),
                to_israel(promo.updated_at),
                promo.club_id,
                promo.requires_club,
                promo.is_coupon,
                promo.remarks or None,
                file_id,
                now,
                Jsonb(promo.raw),
            ),
        ).fetchone()
        if not row:
            continue
        for item in relevant:
            target = by_code[item.item_code]
            terms = promo_terms(promo, item, target["regularPrice"])
            conn.execute(
                """INSERT INTO "PromotionItems" ("promotionId", "productId", "rewardType", "minQty", "maxQty",
                       "discountedPrice", "discountRate", "promoUnitPrice", computable, "notComputableBecause")
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT ("promotionId", "productId") DO NOTHING""",
                (
                    row["id"],
                    target["productId"],
                    item.reward_type,
                    item.min_qty,
                    item.max_qty,
                    item.discounted_price,
                    item.discount_rate,
                    terms.unit_price,
                    terms.computable,
                    terms.reason,
                ),
            )
        stats.promotions += 1


def import_branch(
    conn: Connection,
    connector: Connector,
    source_id: int,
    job_id: int,
    store_code: str,
    branch_id: int,
    matcher: Matcher,
    products: dict,
    stats: Stats,
) -> None:
    slug = connector.slug
    files = connector.list_for_store(store_code)
    stats.files_found += len(files)
    full = connector.latest(files, "pricefull", store_code)
    if not full:
        raise RuntimeError(f"no PriceFull file listed for store {store_code}")

    # Apply the latest full file, then any newer partial price files, oldest first.
    to_apply = [full] + sorted(
        (f for f in files if f.kind == "price" and f.published_at and full.published_at and f.published_at > full.published_at),
        key=lambda f: f.published_at,
    )
    for remote in to_apply:
        payload = connector.download(remote)
        stats.files_downloaded += 1
        file_id, processed = record_file(conn, source_id, job_id, remote, payload, slug)
        header, items = feed.parse_prices(payload)
        if remote.kind == "pricefull" and len(items) < 50:
            raise feed.FeedError(f"{remote.name} has only {len(items)} items")
        stats.items_parsed += len(items)
        if processed:
            # Re-applying an old full file would briefly undo newer partial updates and
            # write false changes into the price history.
            continue
        apply_items(conn, slug, branch_id, source_id, file_id, remote, items, matcher, products, stats)
        conn.execute('UPDATE "SourceFiles" SET "itemCount"=%s WHERE id=%s', (len(items), file_id))
        if remote.kind == "pricefull" and remote.published_at:
            # A product missing from a newer full file is no longer offered by this branch.
            conn.execute(
                """DELETE FROM "ProductPrices" WHERE "branchId"=%s AND "sourcePublishedAt" < %s""",
                (branch_id, to_israel(remote.published_at)),
            )
    conn.execute('UPDATE "ProductPrices" SET "collectedAt"=%s WHERE "branchId"=%s', (utcnow(), branch_id))
    # Counted from the table once per branch: a price updated by several files is still one price.
    stats.prices_valid += conn.execute(
        'SELECT count(*) AS n FROM "ProductPrices" WHERE "branchId"=%s', (branch_id,)
    ).fetchone()["n"]

    promo_full = connector.latest(files, "promofull", store_code)
    if promo_full:
        payload = connector.download(promo_full)
        stats.files_downloaded += 1
        file_id, _ = record_file(conn, source_id, job_id, promo_full, payload, slug)
        _, promotions = feed.parse_promotions(payload)
        stats.items_parsed += len(promotions)
        apply_promotions(conn, slug, branch_id, file_id, promotions, stats)
        conn.execute('UPDATE "SourceFiles" SET "itemCount"=%s WHERE id=%s', (len(promotions), file_id))
    stats.branches += 1


def import_chain(conn: Connection, slug: str, trigger: str = "manual") -> dict:
    connector = get_connector(slug)
    source_id = db.upsert_data_source(conn, connector)
    job_id = conn.execute(
        """INSERT INTO "ImportJobs" ("chainId", "dataSourceId", trigger, status, "startedAt")
           VALUES (%s,%s,%s,'RUNNING',%s) RETURNING id""",
        (slug, source_id, trigger, utcnow()),
    ).fetchone()["id"]
    conn.commit()
    stats = Stats()
    fatal = None
    try:
        listing = connector.list_files()
        stores_file = connector.latest(listing, "stores")
        if not stores_file:
            raise RuntimeError("portal listed no Stores file")
        payload = connector.download(stores_file)
        stats.files_downloaded += 1
        file_id, _ = record_file(conn, source_id, job_id, stores_file, payload, slug)
        stores = feed.parse_stores(payload)
        conn.execute('UPDATE "SourceFiles" SET "itemCount"=%s WHERE id=%s', (len(stores), file_id))
        branches = upsert_branches(conn, connector, stores)
        conn.commit()
        if not branches:
            raise RuntimeError("no Be'er Sheva branch in the chain's Stores file")
        matcher, products = load_matcher(conn)
        for code, branch_id in branches.items():
            try:
                import_branch(conn, connector, source_id, job_id, code, branch_id, matcher, products, stats)
                conn.commit()
            except Exception as exc:  # one failing branch must not lose the others
                conn.rollback()
                stats.errors.append({"branch": code, "error": repr(exc)[:500]})
    except Exception as exc:
        conn.rollback()
        fatal = repr(exc)[:500]
        stats.errors.append({"error": fatal, "trace": traceback.format_exc()[-1500:]})

    status = "FAILED" if fatal or stats.branches == 0 else ("PARTIAL" if stats.errors else "SUCCESS")
    conn.execute(
        """UPDATE "ImportJobs" SET status=%s, "finishedAt"=%s, "branchesProcessed"=%s, "filesFound"=%s,
             "filesDownloaded"=%s, "itemsParsed"=%s, "productsMatched"=%s, "pricesValid"=%s, "pricesChanged"=%s,
             "promotionsLoaded"=%s, "reviewItems"=%s, "errorCount"=%s, errors=%s WHERE id=%s""",
        (
            status,
            utcnow(),
            stats.branches,
            stats.files_found,
            stats.files_downloaded,
            stats.items_parsed,
            len(stats.products),
            stats.prices_valid,
            stats.prices_changed,
            stats.promotions,
            stats.review,
            len(stats.errors),
            Jsonb(stats.errors),
            job_id,
        ),
    )
    conn.commit()
    summary = {
        "jobId": job_id,
        "chain": slug,
        "trigger": trigger,
        "status": status,
        "finishedAt": utcnow().isoformat(),
        "branches": stats.branches,
        "filesFound": stats.files_found,
        "filesDownloaded": stats.files_downloaded,
        "itemsParsed": stats.items_parsed,
        "productsMatched": len(stats.products),
        "pricesValid": stats.prices_valid,
        "pricesChanged": stats.prices_changed,
        "promotions": stats.promotions,
        "reviewItems": stats.review,
        "errors": [{k: v for k, v in e.items() if k != "trace"} for e in stats.errors],
    }
    write_log(slug, summary)
    return summary


def write_log(slug: str, summary: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = utcnow().strftime("%Y%m%dT%H%M%SZ")
    (LOG_DIR / f"{slug}-{stamp}.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )
    logs = sorted(LOG_DIR.glob(f"{slug}-*.json"))
    for old in logs[:-LOGS_KEPT_PER_CHAIN]:
        old.unlink()


def flag_outliers(conn: Connection) -> int:
    """Mark prices far from the product's cross-chain median. Likely wrong data, such as a
    per-unit price on a multipack. Suspect prices are shown with a warning and never win."""
    rows = conn.execute(
        """SELECT "productId", id, "regularPrice", "suspect" FROM "ProductPrices" ORDER BY "productId" """
    ).fetchall()
    flagged = 0
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["productId"], []).append(row)
    for group in grouped.values():
        prices = [float(r["regularPrice"]) for r in group]
        if len(prices) < 3:
            for r in group:
                conn.execute('UPDATE "ProductPrices" SET suspect=false, "suspectReason"=NULL WHERE id=%s', (r["id"],))
            continue
        median = statistics.median(prices)
        for r in group:
            value = float(r["regularPrice"])
            bad = value > median * 2.5 or value < median / 2.5
            conn.execute(
                'UPDATE "ProductPrices" SET suspect=%s, "suspectReason"=%s WHERE id=%s',
                (bad, f"רחוק מאוד מהחציון ({median:.2f} ש\"ח)" if bad else None, r["id"]),
            )
            flagged += int(bad)
    conn.commit()
    return flagged


def refresh_staleness(conn: Connection, hours: int = 48) -> int:
    """Downgrade prices whose source file is too old. Never the other way around."""
    result = conn.execute(
        """UPDATE "ProductPrices" SET "verificationStatus"='STALE'
           WHERE "verificationStatus"='VERIFIED' AND "sourcePublishedAt" < now() - make_interval(hours => %s)""",
        (hours,),
    )
    conn.commit()
    return result.rowcount


def import_all(trigger: str = "manual", chains: list[str] | None = None) -> list[dict]:
    with db.connect() as conn:
        results = [import_chain(conn, cls.slug, trigger) for cls in ALL_CONNECTORS if not chains or cls.slug in chains]
        flag_outliers(conn)
        refresh_staleness(conn)
    return results
