"""Print real counts from the database, for reports. Usage: py data-engine/tools/stats.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from supersave_engine import db  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
with db.connect() as conn:
    one = lambda sql: conn.execute(sql).fetchone()["n"]  # noqa: E731
    out = {
        "products": one('SELECT count(*) n FROM "Products" WHERE active'),
        "productsWithRealPrice": one(
            """SELECT count(DISTINCT "productId") n FROM "ProductPrices"
               WHERE "verificationStatus"='VERIFIED' AND NOT suspect"""
        ),
        "productsWithoutPrice": one(
            """SELECT count(*) n FROM "Products" p WHERE active
               AND NOT EXISTS (SELECT 1 FROM "ProductPrices" x WHERE x."productId"=p.id)"""
        ),
        "demoPrices": one("""SELECT count(*) n FROM "ProductPrices" WHERE "verificationStatus"='DEMO'"""),
        "stalePrices": one("""SELECT count(*) n FROM "ProductPrices" WHERE "verificationStatus"='STALE'"""),
        "verifiedPrices": one("""SELECT count(*) n FROM "ProductPrices" WHERE "verificationStatus"='VERIFIED' AND NOT suspect"""),
        "suspectPrices": one('SELECT count(*) n FROM "ProductPrices" WHERE suspect'),
        "branches": one('SELECT count(*) n FROM "Branches" WHERE active'),
        "promotions": one('SELECT count(*) n FROM "Promotions"'),
        "computablePromoItems": one('SELECT count(*) n FROM "PromotionItems" WHERE computable'),
        "reviewQueue": one("""SELECT count(*) n FROM "ChainItems" WHERE "matchStatus"='REVIEW'"""),
        "historyRows": one('SELECT count(*) n FROM "PriceHistory"'),
        "images": one('SELECT count(*) n FROM "ProductImages"'),
        "sourceFiles": one('SELECT count(*) n FROM "SourceFiles"'),
    }
    per_chain = conn.execute(
        """SELECT c.id, c."nameHe", count(DISTINCT b.id) AS branches,
             (SELECT count(DISTINCT "productId") FROM "ProductPrices" x WHERE x."chainId"=c.id AND NOT suspect) AS products,
             (SELECT count(*) FROM "ProductPrices" x WHERE x."chainId"=c.id AND NOT suspect) AS prices,
             (SELECT status::text FROM "ConnectorChecks" k WHERE k."chainId"=c.id ORDER BY "checkedAt" DESC LIMIT 1) AS status
           FROM "SupermarketChains" c LEFT JOIN "Branches" b ON b."chainId"=c.id AND b.active
           GROUP BY c.id ORDER BY c."sortOrder" """
    ).fetchall()
    branches = conn.execute(
        """SELECT "chainId", "nameHe", address FROM "Branches" WHERE active ORDER BY "chainId", "nameHe" """
    ).fetchall()
print(json.dumps(out, ensure_ascii=False))
for row in per_chain:
    print(row)
for row in branches:
    print(row["chainId"], "|", row["nameHe"], "|", row["address"])
