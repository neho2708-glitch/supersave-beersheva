import { NextResponse } from "next/server";
import { optimizeCart, type CartLine, type Store } from "@backend/cart";
import { resolveStatus } from "@backend/pricing";
import { getSnapshot, parseBranchIds } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Body {
  items?: { productId: string; quantity: number }[];
  maxStores?: number;
  branches?: string;
  includeChains?: string[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const snapshot = await getSnapshot();
  const now = new Date();
  const allowed = parseBranchIds(body.branches);
  const byId = new Map(snapshot.products.map((p) => [p.id, p]));
  const lines: CartLine[] = (body.items ?? [])
    .filter((i) => byId.has(i.productId) && i.quantity > 0)
    .map((i) => ({ productId: i.productId, name: (byId.get(i.productId) as { nameHe: string }).nameHe, quantity: i.quantity }));

  const chainName = new Map(snapshot.chains.map((c) => [c.id, c.nameHe]));
  const stores: Store[] = snapshot.branches
    .filter((b) => !allowed || allowed.has(b.id))
    .filter((b) => !body.includeChains || body.includeChains.includes(b.chainId))
    .map((b) => ({
      branchId: b.id,
      chainId: b.chainId,
      chainName: chainName.get(b.chainId) ?? b.chainId,
      branchName: b.nameHe,
      offers: {},
    }));
  const storeById = new Map(stores.map((s) => [s.branchId, s]));
  const staleItems = new Set<string>();
  for (const line of lines) {
    for (const row of snapshot.prices.get(line.productId) ?? []) {
      const store = storeById.get(row.branchId);
      if (!store) continue;
      const fresh = resolveStatus(row.status, row.publishedAt, now, snapshot.staleAfterHours) === "VERIFIED";
      if (!fresh) staleItems.add(line.productId);
      store.offers[line.productId] = { regular: row.regular, promos: row.promos, usable: fresh && !row.suspect };
    }
  }
  const maxStores = Math.min(Math.max(Number(body.maxStores) || 2, 1), 4);
  const result = optimizeCart(stores, lines, maxStores, now);
  return NextResponse.json({ ...result, chainCount: snapshot.chains.length, staleItems: [...staleItems] });
}
