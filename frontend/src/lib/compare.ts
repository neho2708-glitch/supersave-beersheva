// Turning raw rows into comparisons. Pure, so the rules that decide what the user sees are testable.
import { bestPromo, resolveStatus, type PriceStatus } from "@backend/pricing";
import type { Branch, Chain, ChainPrice, PriceRow, Product, ProductSummary, RowState } from "./types";

export interface Snapshot {
  products: Product[];
  chains: Chain[];
  branches: Branch[];
  /** Keyed by product id. */
  prices: Map<string, PriceRow[]>;
  staleAfterHours: number;
  generatedAt: string;
}

const effective = (row: PriceRow, now: Date) => {
  const promo = bestPromo(row.promos, now);
  return { promo, unit: promo ? (promo.promoUnitPrice as number) : row.regular };
};

function liveStatus(row: PriceRow, now: Date, hours: number): PriceStatus {
  return resolveStatus(row.status, row.publishedAt, now, hours);
}

/**
 * One line per chain. Within a chain the cheapest usable branch is shown. A verified price
 * always beats a stale one; suspect prices appear only if nothing else exists, and never win.
 */
export function compareChains(
  rows: PriceRow[],
  chains: Chain[],
  branches: Branch[],
  allowedBranches: Set<number> | null,
  staleAfterHours: number,
  now: Date = new Date(),
): ChainPrice[] {
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const lines: ChainPrice[] = chains.map((chain) => {
    const own = rows.filter(
      (r) => r.chainId === chain.id && branchById.has(r.branchId) && (!allowedBranches || allowedBranches.has(r.branchId)),
    );
    if (own.length === 0) {
      return { chain, branch: null, row: null, branchCount: 0, bestUnit: null, promo: null, isCheapest: false, state: "NONE" as RowState };
    }
    const scored = own
      .map((row) => {
        const status = liveStatus(row, now, staleAfterHours);
        const { promo, unit } = effective(row, now);
        return { row, status, promo, unit };
      })
      .sort((a, b) => {
        const rank = (s: typeof a) => (s.row.suspect ? 2 : s.status === "VERIFIED" ? 0 : 1);
        return rank(a) - rank(b) || a.unit - b.unit;
      });
    const best = scored[0];
    return {
      chain,
      branch: branchById.get(best.row.branchId) ?? null,
      row: { ...best.row, status: best.status },
      branchCount: own.length,
      bestUnit: best.unit,
      promo: best.promo,
      isCheapest: false,
      state: best.status as RowState,
    };
  });

  const contenders = lines.filter((l) => l.row && !l.row.suspect && l.state === "VERIFIED");
  if (contenders.length > 0) {
    const min = Math.min(...contenders.map((l) => l.bestUnit as number));
    for (const line of contenders) if (line.bestUnit === min) line.isCheapest = true;
  }
  return lines.sort((a, b) => {
    if (!a.row !== !b.row) return a.row ? -1 : 1;
    return (a.bestUnit ?? 0) - (b.bestUnit ?? 0);
  });
}

export function summarize(
  product: Product,
  rows: PriceRow[],
  chains: Chain[],
  branches: Branch[],
  allowedBranches: Set<number> | null,
  staleAfterHours: number,
  now: Date = new Date(),
): ProductSummary {
  const lines = compareChains(rows, chains, branches, allowedBranches, staleAfterHours, now);
  const priced = lines.filter((l) => l.row);
  const winner = lines.find((l) => l.isCheapest) ?? null;
  const relevant = priced.map((l) => l.row as PriceRow);
  return {
    ...product,
    cheapest:
      winner && winner.row
        ? {
            price: winner.bestUnit as number,
            chainId: winner.chain.id,
            chainName: winner.chain.nameHe,
            viaPromo: Boolean(winner.promo),
            minQty: winner.promo?.minQty ?? 1,
            status: winner.state === "NONE" ? "VERIFIED" : (winner.state as PriceStatus),
          }
        : null,
    chainsWithPrice: priced.length,
    chainsTotal: chains.length,
    hasPromo: priced.some((l) => l.promo),
    priceDropped: relevant.some((r) => r.previousPrice !== null && !r.suspect && r.regular < r.previousPrice),
    publishedAt: relevant.map((r) => r.publishedAt).sort().at(-1) ?? null,
  };
}

export interface ProductFilter {
  search?: string;
  category?: string;
  brand?: string;
  chain?: string;
  promosOnly?: boolean;
  droppedOnly?: boolean;
  sort?: "price-asc" | "price-desc" | "name";
}

/** Letters only, so "קוטג" finds "קוטג'" and quotes never block a match. */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/["'׳״`]/g, "").replace(/\s+/g, " ").trim();
}

export function filterProducts(items: ProductSummary[], rowsByProduct: Map<string, PriceRow[]>, filter: ProductFilter): ProductSummary[] {
  const terms = normalizeSearch(filter.search ?? "").split(" ").filter(Boolean);
  const result = items.filter((p) => {
    if (filter.category && p.categoryId !== filter.category) return false;
    if (filter.brand && p.brand !== filter.brand) return false;
    if (filter.chain && !(rowsByProduct.get(p.id) ?? []).some((r) => r.chainId === filter.chain)) return false;
    if (filter.promosOnly && !p.hasPromo) return false;
    if (filter.droppedOnly && !p.priceDropped) return false;
    if (terms.length) {
      const haystack = normalizeSearch(`${p.nameHe} ${p.nameEn ?? ""} ${p.brand ?? ""} ${p.barcode ?? ""}`);
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
  const price = (p: ProductSummary) => p.cheapest?.price ?? Number.POSITIVE_INFINITY;
  if (filter.sort === "price-desc") result.sort((a, b) => (b.cheapest?.price ?? -1) - (a.cheapest?.price ?? -1));
  else if (filter.sort === "name") result.sort((a, b) => a.nameHe.localeCompare(b.nameHe, "he"));
  else if (filter.sort === "price-asc") result.sort((a, b) => price(a) - price(b));
  return result;
}
