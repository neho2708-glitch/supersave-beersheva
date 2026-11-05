// Smart cart optimizer. Compares real shelf prices across stores.
import { lineCost, type PromoOffer } from "./pricing";

export interface StoreOffer {
  regular: number;
  promos: PromoOffer[];
  /** Prices that failed sanity checks or are stale never decide a recommendation. */
  usable: boolean;
}

export interface Store {
  branchId: number;
  chainId: string;
  chainName: string;
  branchName: string;
  offers: Record<string, StoreOffer>;
}

export interface CartLine {
  productId: string;
  name: string;
  quantity: number;
}

export interface LineResult {
  productId: string;
  name: string;
  quantity: number;
  branchId: number;
  chainId: string;
  chainName: string;
  branchName: string;
  total: number;
  regularTotal: number;
  promoDescription: string | null;
  unitsToPromo: number | null;
}

export interface BasketResult {
  stores: { branchId: number; chainId: string; chainName: string; branchName: string; subtotal: number }[];
  storeCount: number;
  total: number;
  lines: LineResult[];
  missing: { productId: string; name: string }[];
}

export interface ChainBasket extends BasketResult {
  chainId: string;
  chainName: string;
  complete: boolean;
}

export interface CartResult {
  perChain: ChainBasket[];
  /** The best single store. Full baskets beat partial ones, whatever the partial total is. */
  bestSingle: ChainBasket | null;
  optimalSplit: BasketResult | null;
  limitedSplit: BasketResult | null;
  maxStores: number;
  /** Saving against the most expensive complete single-chain basket, on the same items. */
  savingVersusMostExpensive: number | null;
  /** Extra saving of the split compared with the best single store, on the same items. */
  splitSaving: number | null;
  comparable: boolean;
}

function offerCost(store: Store, line: CartLine, now: Date) {
  const offer = store.offers[line.productId];
  if (!offer || !offer.usable) return null;
  return lineCost(offer.regular, line.quantity, offer.promos, now);
}

function buildBasket(stores: Store[], lines: CartLine[], now: Date): BasketResult {
  const results: LineResult[] = [];
  const missing: { productId: string; name: string }[] = [];

  // Every store tied at the lowest price for each line.
  const winners = new Map<CartLine, { store: Store; cost: ReturnType<typeof lineCost> }[]>();
  for (const line of lines) {
    let list: { store: Store; cost: ReturnType<typeof lineCost> }[] = [];
    for (const store of stores) {
      const cost = offerCost(store, line, now);
      if (!cost) continue;
      if (!list.length || cost.total < list[0].cost.total) list = [{ store, cost }];
      else if (cost.total === list[0].cost.total) list.push({ store, cost });
    }
    winners.set(line, list);
  }
  // On equal prices, send the shopper to as few stores as possible (greedy set cover).
  const assigned = new Map<CartLine, { store: Store; cost: ReturnType<typeof lineCost> }>();
  const open = new Set(lines.filter((l) => (winners.get(l) as unknown[]).length > 0));
  while (open.size > 0) {
    const coverage = new Map<number, number>();
    for (const line of open) {
      for (const w of winners.get(line) ?? []) coverage.set(w.store.branchId, (coverage.get(w.store.branchId) ?? 0) + 1);
    }
    const top = [...coverage.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    for (const line of [...open]) {
      const hit = (winners.get(line) ?? []).find((w) => w.store.branchId === top);
      if (hit) {
        assigned.set(line, hit);
        open.delete(line);
      }
    }
  }

  for (const line of lines) {
    const chosen = assigned.get(line);
    if (!chosen) {
      missing.push({ productId: line.productId, name: line.name });
      continue;
    }
    results.push({
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      branchId: chosen.store.branchId,
      chainId: chosen.store.chainId,
      chainName: chosen.store.chainName,
      branchName: chosen.store.branchName,
      total: chosen.cost.total,
      regularTotal: chosen.cost.regularTotal,
      promoDescription: chosen.cost.promoApplied?.description ?? null,
      unitsToPromo: chosen.cost.unitsToPromo,
    });
  }
  const subtotals = new Map<number, BasketResult["stores"][number]>();
  for (const r of results) {
    const entry = subtotals.get(r.branchId) ?? {
      branchId: r.branchId,
      chainId: r.chainId,
      chainName: r.chainName,
      branchName: r.branchName,
      subtotal: 0,
    };
    entry.subtotal = round(entry.subtotal + r.total);
    subtotals.set(r.branchId, entry);
  }
  const used = [...subtotals.values()].sort((a, b) => b.subtotal - a.subtotal);
  return {
    stores: used,
    storeCount: used.length,
    total: round(results.reduce((sum, r) => sum + r.total, 0)),
    lines: results,
    missing,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** More items first, then lower total, then fewer stores. */
function better(a: BasketResult, b: BasketResult): boolean {
  if (a.missing.length !== b.missing.length) return a.missing.length < b.missing.length;
  if (a.total !== b.total) return a.total < b.total;
  return a.storeCount < b.storeCount;
}

/** Keep only stores that can help, then the cheapest per chain, so enumeration stays exact but small. */
function candidateStores(stores: Store[], lines: CartLine[], now: Date, limit = 18): Store[] {
  const scored = stores
    .map((store) => {
      const basket = buildBasket([store], lines, now);
      return { store, basket };
    })
    .filter((s) => s.basket.lines.length > 0);
  scored.sort((a, b) => (better(a.basket, b.basket) ? -1 : 1));
  // Stores that are strictly cheapest for at least one item must stay in the search.
  const essential = new Set<number>(buildBasket(stores, lines, now).stores.map((s) => s.branchId));
  const kept = scored.filter((s) => essential.has(s.store.branchId));
  for (const s of scored) {
    if (kept.length >= limit) break;
    if (!kept.includes(s)) kept.push(s);
  }
  return kept.map((s) => s.store);
}

function* combinations<T>(items: T[], size: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === size) {
    yield prefix;
    return;
  }
  for (let i = start; i <= items.length - (size - prefix.length); i++) {
    yield* combinations(items, size, i + 1, [...prefix, items[i]]);
  }
}

/** The best basket using at most `maxStores` stores, by exact search over combinations. */
export function bestWithLimit(stores: Store[], lines: CartLine[], maxStores: number, now: Date = new Date()): BasketResult | null {
  const candidates = candidateStores(stores, lines, now);
  if (candidates.length === 0) return null;
  let best: BasketResult | null = null;
  const cap = Math.min(maxStores, candidates.length);
  for (let size = 1; size <= cap; size++) {
    for (const combo of combinations(candidates, size)) {
      const basket = buildBasket(combo, lines, now);
      if (!best || better(basket, best)) best = basket;
    }
  }
  return best;
}

export function optimizeCart(stores: Store[], lines: CartLine[], maxStores = 2, now: Date = new Date()): CartResult {
  const empty: CartResult = {
    perChain: [],
    bestSingle: null,
    optimalSplit: null,
    limitedSplit: null,
    maxStores,
    savingVersusMostExpensive: null,
    splitSaving: null,
    comparable: false,
  };
  if (lines.length === 0 || stores.length === 0) return empty;

  const chains = new Map<string, Store[]>();
  for (const store of stores) chains.set(store.chainId, [...(chains.get(store.chainId) ?? []), store]);

  const perChain: ChainBasket[] = [];
  for (const [chainId, chainStores] of chains) {
    let best: BasketResult | null = null;
    for (const store of chainStores) {
      const basket = buildBasket([store], lines, now);
      if (!best || better(basket, best)) best = basket;
    }
    if (best) {
      perChain.push({
        ...best,
        chainId,
        chainName: chainStores[0].chainName,
        complete: best.missing.length === 0,
      });
    }
  }
  perChain.sort((a, b) => (better(a, b) ? -1 : 1));

  const optimalSplit = buildBasket(stores, lines, now);
  const limitedSplit = bestWithLimit(stores, lines, maxStores, now);
  const bestSingle = perChain.find((c) => c.lines.length > 0) ?? null;

  const complete = perChain.filter((c) => c.complete);
  const comparable = complete.length >= 2;
  const savingVersusMostExpensive =
    comparable && bestSingle?.complete ? round(Math.max(...complete.map((c) => c.total)) - bestSingle.total) : null;
  const splitSaving =
    bestSingle && optimalSplit.missing.length === bestSingle.missing.length
      ? round(bestSingle.total - optimalSplit.total)
      : null;

  return {
    perChain,
    bestSingle,
    optimalSplit,
    limitedSplit,
    maxStores,
    savingVersusMostExpensive,
    splitSaving,
    comparable,
  };
}
