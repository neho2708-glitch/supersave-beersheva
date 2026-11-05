# Architecture

```
Official chain portals
        │  HTTPS (7 connectors over 4 portal families)
        ▼
data-engine (Python)
  connectors → feed parser → normalize → matching → pipeline
        │  raw files archived with SHA-256 in data-engine/raw/
        ▼
PostgreSQL (schema in database/schema.prisma)
        │
        ▼
frontend (Next.js + Prisma)
  API routes → pages, 3D store (React Three Fiber)
        │
backend/src (pure TypeScript: pricing and cart rules, shared by server, browser and tests)
```

## Folders

| Folder | Contents |
|---|---|
| `frontend/` | Next.js app: pages, API routes, components, the 3D store |
| `backend/src/` | Domain rules with no I/O: price status, promotion math, cart optimizer |
| `data-engine/` | Python Price Data Engine and its tests |
| `database/` | Prisma schema, migrations, product catalogue (`catalog/`) |
| `verification/` | Generated proof of connector health: results, report, registry, import logs |
| `tests/` | TypeScript unit tests |
| `scripts/` | Local PostgreSQL starter and Python runner |

## Trust rules, and where they are enforced

| Rule | Where |
|---|---|
| A price needs a source file | `ProductPrices.sourceFileId` is required; `apply_items` |
| A price older than 48 hours is never VERIFIED | `resolveStatus` runs on every read, and `refresh_staleness` runs after imports |
| Stale and outlier prices never win "cheapest" or the cart | `compareChains`, `api/cart/optimize` |
| ItemType 0 codes are never matched as barcodes | `is_global_barcode` |
| Different sizes are not merged; uncertain matches get no price | `matching.py` |
| A promotion only changes a price if it is understood | `promo_terms`: types 1 and 10 only; coupons, gifts, minimum-spend and implausible deals stay text-only |
| Club-only deals are not counted | `usablePromos` |
| Connector status comes from real runs | `verify.py` writes it; pages read `ConnectorChecks` |

## Decisions

- **Prices in memory:** with about 300 products and 30 branches, `getSnapshot` loads current prices
  for 60 seconds and filters in TypeScript. For a national catalogue this should become SQL.
- **Picking without three.js raycasting:** shelves are axis-aligned, so `layout.pick` does a simple
  ray/box test over the slots ten times a second. It is cheap, and it runs in unit tests.
- **One atlas for all packages:** a single canvas texture and instanced meshes keep thousands of
  packages in a few draw calls. The per-instance `aRect` attribute selects the product's cell.
- **PostgreSQL in development:** `scripts/dev-db.mjs` runs real PostgreSQL binaries from an npm
  package, so no Docker is needed. On deep Windows paths it copies them to `~/.supersave-pg`,
  because the tools fail past 260 characters.
- **Python and Node share one database:** Prisma owns the schema, and the engine writes plain SQL.
- **Local images:** files live in `frontend/public/products/`. To use Supabase Storage or S3, upload
  them and change the `url` values in `database/catalog/images.json`.
