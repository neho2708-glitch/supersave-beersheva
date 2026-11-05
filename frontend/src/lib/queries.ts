import { compareChains, summarize, type Snapshot } from "./compare";
import { getCategories, getHistory, getSnapshot } from "./db";
import type { ProductDetail, ProductSummary } from "./types";

export function summaries(snapshot: Snapshot, allowed: Set<number> | null): ProductSummary[] {
  return snapshot.products.map((p) =>
    summarize(p, snapshot.prices.get(p.id) ?? [], snapshot.chains, snapshot.branches, allowed, snapshot.staleAfterHours),
  );
}

export async function productDetail(id: string, allowed: Set<number> | null): Promise<ProductDetail | null> {
  const snapshot = await getSnapshot();
  const product = snapshot.products.find((p) => p.id === id);
  if (!product) return null;
  const rows = snapshot.prices.get(id) ?? [];
  const [categories, historyRows] = await Promise.all([getCategories(), getHistory(id)]);

  // One daily minimum per chain gives a readable line even for chains with many branches.
  const byChain = new Map<string, Map<string, number>>();
  for (const h of historyRows) {
    const day = h.recordedAt.toISOString().slice(0, 10);
    const days = byChain.get(h.chainId) ?? new Map<string, number>();
    const price = Number(h.price);
    days.set(day, Math.min(days.get(day) ?? Infinity, price));
    byChain.set(h.chainId, days);
  }
  const history = snapshot.chains
    .filter((c) => byChain.has(c.id))
    .map((c) => ({
      chainId: c.id,
      chainName: c.nameHe,
      color: c.color,
      points: [...(byChain.get(c.id) as Map<string, number>)].map(([at, price]) => ({ at, price })),
    }));

  return {
    product: summarize(product, rows, snapshot.chains, snapshot.branches, allowed, snapshot.staleAfterHours),
    category: categories.find((c) => c.id === product.categoryId),
    chains: compareChains(rows, snapshot.chains, snapshot.branches, allowed, snapshot.staleAfterHours),
    history,
  };
}
