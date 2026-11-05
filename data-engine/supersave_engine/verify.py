"""Connector Health & Verification.

Runs real requests against each chain's official source and proves the data is usable:
listing -> stores file -> Be'er Sheva branch -> price file -> parsed product with a price
-> structure validation -> promotions -> freshness. An HTTP 200 alone proves nothing.

Status is derived from what happened in this run and is never typed in by hand.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from psycopg.types.json import Jsonb

from . import db, feed
from .connectors.base import Connector
from .connectors.portals import ALL_CONNECTORS
from .normalize import is_global_barcode
from .pipeline import public_url, utcnow
from .pricing import is_beer_sheva, to_israel

OUT_DIR = db.ROOT / "verification"
FRESHNESS_GRACE_HOURS = 24
MIN_ITEMS = 100
MIN_VALID_SHARE = 0.9


class Unavailable(Exception):
    """The source could not be reached or offers no files."""


def _step(steps: list, name: str, ok: bool, detail: str) -> None:
    steps.append({"step": name, "ok": ok, "detail": detail})


def validate_items(items: list[feed.ItemRecord]) -> dict:
    """Structural validation of a parsed price file."""
    valid = [i for i in items if i.price is not None and 0 < i.price < 5000 and i.item_code and i.name]
    barcoded = [i for i in valid if is_global_barcode(i.item_code, i.item_type)]
    share = len(valid) / len(items) if items else 0.0
    return {
        "items": len(items),
        "validPrices": len(valid),
        "validShare": round(share, 4),
        "globalBarcodes": len(barcoded),
        "ok": len(items) >= MIN_ITEMS and share >= MIN_VALID_SHARE,
    }


def check_connector(connector: Connector) -> dict:
    started = time.monotonic()
    steps: list[dict] = []
    result: dict = {
        "chain": connector.slug,
        "chainName": connector.chain_name_he,
        "sourceName": connector.source_name,
        "sourceUrl": connector.source_url,
        "connectionType": connector.connection_type,
        "fileFormat": connector.file_format,
        "checkedAt": utcnow().isoformat(),
        "steps": steps,
    }
    try:
        try:
            listing = connector.list_files()
        except (requests.RequestException, OSError) as exc:
            _step(steps, "list_files", False, repr(exc)[:300])
            raise Unavailable("source could not be reached") from exc
        _step(steps, "list_files", bool(listing), f"{len(listing)} files listed")
        stores_file = connector.latest(listing, "stores")
        if not stores_file:
            raise Unavailable("no Stores file listed")

        try:
            payload = connector.download(stores_file)
        except (requests.RequestException, OSError) as exc:
            _step(steps, "download_stores", False, repr(exc)[:300])
            raise Unavailable("stores file could not be downloaded") from exc
        _step(steps, "download_stores", len(payload) > 0, f"{stores_file.name}, {len(payload)} bytes")
        stores = feed.parse_stores(payload)
        local = [s for s in stores if is_beer_sheva(s)]
        _step(steps, "parse_stores", bool(local), f"{len(stores)} stores, {len(local)} in Be'er Sheva")
        result["storesTotal"] = len(stores)
        result["beerShevaBranches"] = [
            {"code": s.store_id, "name": s.name.strip(), "address": s.address.strip(), "format": s.subchain_name}
            for s in local
        ]
        if not local:
            raise feed.FeedError("no Be'er Sheva branch in the stores file")

        # Try branches until one offers a price file. Some list none at a given moment.
        chosen = None
        for store in local[:6]:
            code = store.store_id.lstrip("0") or "0"
            files = connector.list_for_store(code)
            full = connector.latest(files, "pricefull", code)
            if full:
                chosen = (store, code, files, full)
                break
        if not chosen:
            raise Unavailable("no PriceFull file listed for any Be'er Sheva branch")
        store, code, files, full = chosen

        price_bytes = connector.download(full)
        _step(steps, "download_prices", len(price_bytes) > 0, f"{full.name}, {len(price_bytes)} bytes")
        header, items = feed.parse_prices(price_bytes)
        validation = validate_items(items)
        _step(steps, "parse_and_validate_prices", validation["ok"], json.dumps(validation))
        if not validation["ok"]:
            raise feed.FeedError(f"price file failed validation: {validation}")

        sample = next(
            (i for i in items if is_global_barcode(i.item_code, i.item_type) and i.price and i.price > 0), None
        )
        if sample is None:
            sample = next(i for i in items if i.price and i.price > 0)
        result["sample"] = {
            "itemCode": sample.item_code,
            "name": sample.name,
            "price": str(sample.price),
            "branch": store.name.strip(),
            "file": full.name,
            "fileUrl": public_url(full.url),
        }
        _step(steps, "extract_real_product", True, f"{sample.name} = {sample.price} ILS")
        result["itemsParsed"] = validation["items"]
        result["validPrices"] = validation["validPrices"]
        result["latestFile"] = full.name
        published = to_israel(full.published_at)
        result["latestFileAt"] = published.isoformat() if published else None

        promo = connector.latest(files, "promofull", code)
        if promo:
            promo_bytes = connector.download(promo)
            _, promotions = feed.parse_promotions(promo_bytes)
            with_items = sum(1 for p in promotions if p.items)
            _step(steps, "parse_promotions", True, f"{promo.name}: {len(promotions)} promotions, {with_items} with items")
            result["promotionsParsed"] = len(promotions)
        else:
            _step(steps, "parse_promotions", False, "no PromoFull file listed for this branch")

        age_hours = (utcnow() - published).total_seconds() / 3600 if published else None
        limit = connector.update_frequency_hours + FRESHNESS_GRACE_HOURS
        fresh = age_hours is not None and age_hours <= limit
        _step(steps, "freshness", fresh, f"file age {age_hours:.1f}h, limit {limit}h" if age_hours is not None else "no date")
        result["status"] = "VERIFIED" if fresh else "STALE"
    except Unavailable as exc:
        result["status"] = "UNAVAILABLE"
        result["error"] = str(exc)
    except (requests.RequestException, OSError) as exc:
        result["status"] = "UNAVAILABLE"
        result["error"] = repr(exc)[:300]
    except Exception as exc:  # unparseable or invalid data
        result["status"] = "FAILED"
        result["error"] = repr(exc)[:300]
    result["durationMs"] = int((time.monotonic() - started) * 1000)
    result["errorCount"] = sum(1 for s in steps if not s["ok"]) + (1 if result.get("error") else 0)
    return result


def _db_metrics(conn, slug: str) -> dict:
    last_try = conn.execute(
        """SELECT "startedAt" FROM "ImportJobs" WHERE "chainId"=%s ORDER BY "startedAt" DESC LIMIT 1""", (slug,)
    ).fetchone()
    last_ok = conn.execute(
        """SELECT "finishedAt", "itemsParsed" FROM "ImportJobs" WHERE "chainId"=%s AND status IN ('SUCCESS','PARTIAL')
           ORDER BY "finishedAt" DESC LIMIT 1""",
        (slug,),
    ).fetchone()
    counts = conn.execute(
        """SELECT count(DISTINCT "productId") AS products, count(*) AS prices FROM "ProductPrices"
           WHERE "chainId"=%s AND NOT suspect""",
        (slug,),
    ).fetchone()
    errors = conn.execute(
        """SELECT coalesce(sum("errorCount"),0) AS n FROM "ImportJobs" WHERE "chainId"=%s
           AND "startedAt" > now() - interval '7 days'""",
        (slug,),
    ).fetchone()
    return {
        "lastImportAttempt": last_try["startedAt"].isoformat() if last_try else None,
        "lastSuccessfulImport": last_ok["finishedAt"].isoformat() if last_ok else None,
        "productsImported": counts["products"],
        "validPricesInDatabase": counts["prices"],
        "importErrorsLast7Days": int(errors["n"]),
    }


def run_verification(write_files: bool = True) -> list[dict]:
    results = [check_connector(cls()) for cls in ALL_CONNECTORS]
    conn = None
    try:
        conn = db.connect()
    except Exception as exc:
        print(f"note: database unavailable, verifying sources only ({type(exc).__name__})")
    if conn:
        with conn:
            for cls, result in zip(ALL_CONNECTORS, results):
                try:
                    result["database"] = _db_metrics(conn, cls.slug)
                    source_id = db.upsert_data_source(conn, cls())
                    conn.execute(
                        """INSERT INTO "ConnectorChecks" ("chainId", "dataSourceId", "checkedAt", status, "durationMs",
                               "latestFile", "latestFileAt", "itemsParsed", "validPrices", "errorCount", details)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (
                            cls.slug,
                            source_id,
                            result["checkedAt"],
                            result["status"],
                            result["durationMs"],
                            result.get("latestFile"),
                            result.get("latestFileAt"),
                            result.get("itemsParsed"),
                            result.get("validPrices"),
                            result["errorCount"],
                            Jsonb(result),
                        ),
                    )
                except Exception as exc:
                    # The tables may not exist yet in a sources-only environment such as CI.
                    conn.rollback()
                    print(f"note: could not record check for {cls.slug}: {type(exc).__name__}")
    if write_files:
        write_outputs(results)
    return results


def write_outputs(results: list[dict]) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    generated = datetime.now(timezone.utc).isoformat()
    payload = {"generatedAt": generated, "generatedBy": "supersave_engine.verify (live run)", "results": results}
    (OUT_DIR / "connector-test-results.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )
    registry = [
        {
            "chain": cls.slug,
            "chainNameHe": cls.chain_name_he,
            "chainNameEn": cls.chain_name_en,
            "chainCodes": list(cls.chain_codes),
            "sourceName": cls.source_name,
            "sourceUrl": cls.source_url,
            "connectionType": cls.connection_type,
            "fileFormat": cls.file_format,
            "updateFrequencyHours": cls.update_frequency_hours,
            "terms": cls.terms_note,
            "portalUsername": getattr(cls, "portal_username", None),
        }
        for cls in ALL_CONNECTORS
    ]
    (OUT_DIR / "data-source-registry.json").write_text(
        json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )
    lines = [
        "# Connector test report",
        "",
        f"Generated automatically by a live run at `{generated}`. Do not edit by hand.",
        "",
        "| Chain | Status | Source | Connection | Be'er Sheva branches | Items parsed | Valid prices | Sample real product | Latest file |",
        "|---|---|---|---|---:|---:|---:|---|---|",
    ]
    for r in results:
        sample = r.get("sample")
        sample_text = f"{sample['name']} ({sample['itemCode']}): {sample['price']} ILS at {sample['branch']}" if sample else "-"
        lines.append(
            f"| {r['chainName']} | **{r['status']}** | {r['sourceUrl']} | {r['connectionType']} | "
            f"{len(r.get('beerShevaBranches', []))} | {r.get('itemsParsed', '-')} | {r.get('validPrices', '-')} | "
            f"{sample_text} | {r.get('latestFile', '-')} |"
        )
    lines += ["", "## Step detail", ""]
    for r in results:
        lines += [f"### {r['chainName']} ({r['chain']}): {r['status']}", ""]
        if r.get("error"):
            lines.append(f"Error: `{r['error']}`")
        for step in r["steps"]:
            mark = "pass" if step["ok"] else "FAIL"
            lines.append(f"- {mark}: `{step['step']}`: {step['detail']}")
        database = r.get("database")
        if database:
            lines.append(
                f"- Database: {database['productsImported']} products, {database['validPricesInDatabase']} valid prices, "
                f"last successful import {database['lastSuccessfulImport']}"
            )
        lines.append("")
    (OUT_DIR / "connector-test-report.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
