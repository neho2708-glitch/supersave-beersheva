import { NextResponse } from "next/server";
import { bestPromo, isPromoActive, resolveStatus } from "@backend/pricing";
import { getSnapshot, parseBranchIds } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Only promotions that are in an official file and active now. Each carries its source file. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const allowed = parseBranchIds(q.get("branches"));
  const chainFilter = q.get("chain");
  const categoryFilter = q.get("category");
  const snapshot = await getSnapshot();
  const now = new Date();
  const branches = new Map(snapshot.branches.map((b) => [b.id, b]));
  const chains = new Map(snapshot.chains.map((c) => [c.id, c]));

  const deals = new Map<string, Record<string, unknown>>();
  const textOnly: Record<string, unknown>[] = [];
  for (const product of snapshot.products) {
    if (categoryFilter && product.categoryId !== categoryFilter) continue;
    for (const row of snapshot.prices.get(product.id) ?? []) {
      if (!branches.has(row.branchId) || (allowed && !allowed.has(row.branchId))) continue;
      if (chainFilter && row.chainId !== chainFilter) continue;
      if (row.suspect || resolveStatus(row.status, row.publishedAt, now, snapshot.staleAfterHours) !== "VERIFIED") continue;
      const promo = bestPromo(row.promos, now);
      if (promo) {
        const unit = promo.promoUnitPrice as number;
        const key = `${product.id}|${row.chainId}`;
        const current = deals.get(key);
        if (!current || unit < (current.unit as number)) {
          deals.set(key, {
            key,
            product,
            chain: chains.get(row.chainId),
            branch: branches.get(row.branchId),
            regular: row.regular,
            unit,
            minQty: promo.minQty,
            bundlePrice: promo.discountedPrice,
            description: promo.description,
            endsAt: promo.endsAt,
            savingPercent: Math.round((1 - unit / row.regular) * 100),
            sourceName: row.sourceName,
            fileName: row.fileName,
            publishedAt: row.publishedAt,
          });
        }
      } else if (textOnly.length < 40) {
        const other = row.promos.find((p) => isPromoActive(p, now) && p.requiresClub);
        if (other) {
          textOnly.push({
            key: `${product.id}|${row.branchId}|${other.id}`,
            productName: product.nameHe,
            productId: product.id,
            chainName: chains.get(row.chainId)?.nameHe,
            description: other.description,
            note: "למחזיקי מועדון בלבד",
          });
        }
      }
    }
  }
  const items = [...deals.values()].sort((a, b) => (b.savingPercent as number) - (a.savingPercent as number));
  return NextResponse.json({ total: items.length, items: items.slice(0, 120), clubOnly: textOnly, chains: snapshot.chains });
}
