"""Command line: seed | import | verify | schedule."""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime

from . import db, pipeline, verify
from .connectors.portals import ALL_CONNECTORS


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="supersave_engine")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("seed", help="load chains, categories and the product catalogue")
    importer = sub.add_parser("import", help="import prices and promotions")
    importer.add_argument("--all", action="store_true")
    importer.add_argument("--chain", choices=[c.slug for c in ALL_CONNECTORS], action="append")
    importer.add_argument("--trigger", default="manual")
    checker = sub.add_parser("verify", help="run Connector Health & Verification")
    checker.add_argument(
        "--tolerate-network",
        action="store_true",
        help="exit 0 when sources are merely unreachable (for CI outside Israel); FAILED still fails",
    )
    checker.add_argument("--no-write", action="store_true", help="do not overwrite verification/ files")
    scheduler = sub.add_parser("schedule", help="long-running scheduler")
    scheduler.add_argument("--every-hours", type=float, default=6.0)
    args = parser.parse_args()

    if args.command == "seed":
        with db.connect() as conn:
            print(json.dumps(db.seed(conn)))
        return 0

    if args.command == "import":
        if not args.all and not args.chain:
            parser.error("use --all or --chain")
        results = pipeline.import_all(args.trigger, None if args.all else args.chain)
        for result in results:
            print(json.dumps(result, ensure_ascii=False))
        return 0 if all(r["status"] != "FAILED" for r in results) else 1

    if args.command == "verify":
        results = verify.run_verification(write_files=not args.no_write)
        for result in results:
            sample = result.get("sample") or {}
            print(f"{result['chain']:<16} {result['status']:<12} {sample.get('name', result.get('error', ''))} {sample.get('price', '')}")
        statuses = {r["status"] for r in results}
        if "FAILED" in statuses:
            return 1
        if "UNAVAILABLE" in statuses and not args.tolerate_network:
            return 1
        return 0

    if args.command == "schedule":
        while True:
            print(f"[{datetime.now().isoformat(timespec='seconds')}] scheduled import starting", flush=True)
            for result in pipeline.import_all("schedule"):
                print(result["chain"], result["status"], result["pricesValid"], flush=True)
            verify.run_verification()
            time.sleep(args.every_hours * 3600)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
