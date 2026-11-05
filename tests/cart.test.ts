import { describe, expect, it } from "vitest";
import { bestWithLimit, optimizeCart, type CartLine, type Store } from "../backend/src/cart";
import type { PromoOffer } from "../backend/src/pricing";

const NOW = new Date("2026-11-05T12:00:00Z");

const promo = (over: Partial<PromoOffer>): PromoOffer => ({
  id: 1,
  description: "2 ב-10",
  minQty: 2,
  maxQty: null,
  discountedPrice: 10,
  promoUnitPrice: 5,
  computable: true,
  notComputableBecause: null,
  requiresClub: false,
  isCoupon: false,
  startsAt: null,
  endsAt: null,
  ...over,
});

function store(branchId: number, chainId: string, prices: Record<string, number | [number, PromoOffer[]]>): Store {
  const offers: Store["offers"] = {};
  for (const [id, value] of Object.entries(prices)) {
    offers[id] = Array.isArray(value) ? { regular: value[0], promos: value[1], usable: true } : { regular: value, promos: [], usable: true };
  }
  return { branchId, chainId, chainName: chainId, branchName: `b${branchId}`, offers };
}

const line = (productId: string, quantity = 1): CartLine => ({ productId, name: productId, quantity });

describe("optimizeCart", () => {
  const stores = [
    store(1, "a", { milk: 7, bread: 10, eggs: 20 }),
    store(2, "b", { milk: 6, bread: 12, eggs: 21 }),
    store(3, "c", { milk: 8, bread: 8, eggs: 25 }),
  ];
  const cart = [line("milk"), line("bread"), line("eggs")];

  it("computes the basket price in every chain and picks the cheapest full basket", () => {
    const result = optimizeCart(stores, cart, 2, NOW);
    expect(result.perChain.map((c) => [c.chainId, c.total])).toEqual([
      ["a", 37],
      ["b", 39],
      ["c", 41],
    ]);
    expect(result.bestSingle?.chainId).toBe("a");
    expect(result.savingVersusMostExpensive).toBe(4);
  });

  it("buys each item at its cheapest store when splitting", () => {
    const result = optimizeCart(stores, cart, 2, NOW);
    expect(result.optimalSplit?.total).toBe(6 + 8 + 20);
    expect(result.optimalSplit?.storeCount).toBe(3);
    expect(result.splitSaving).toBe(3);
  });

  it("finds the true optimum under a store limit", () => {
    const two = bestWithLimit(stores, cart, 2, NOW);
    expect(two?.storeCount).toBeLessThanOrEqual(2);
    // Stores 1 and 3: milk 7 + bread 8 + eggs 20 = 35. Stores 1 and 2 would be 36.
    expect(two?.total).toBe(35);
    const one = bestWithLimit(stores, cart, 1, NOW);
    expect(one?.total).toBe(37);
  });

  it("never lets a partial basket beat a full one on total alone", () => {
    const list = [store(1, "full", { milk: 10, bread: 10 }), store(2, "partial", { milk: 1 })];
    const result = optimizeCart(list, [line("milk"), line("bread")], 1, NOW);
    expect(result.bestSingle?.chainId).toBe("full");
    const partial = result.perChain.find((c) => c.chainId === "partial");
    expect(partial?.missing.map((m) => m.productId)).toEqual(["bread"]);
    expect(partial?.complete).toBe(false);
  });

  it("reports items that no store has, and does not claim a comparison it cannot make", () => {
    const result = optimizeCart([store(1, "a", { milk: 5 })], [line("milk"), line("unicorn")], 2, NOW);
    expect(result.optimalSplit?.missing.map((m) => m.productId)).toEqual(["unicorn"]);
    expect(result.savingVersusMostExpensive).toBeNull();
    expect(result.comparable).toBe(false);
  });

  it("applies a bundle promotion only when the quantity reaches it", () => {
    const deal = [store(1, "a", { soap: [8, [promo({})]] }), store(2, "b", { soap: 7 })];
    expect(optimizeCart(deal, [line("soap", 1)], 1, NOW).bestSingle?.chainId).toBe("b");
    const two = optimizeCart(deal, [line("soap", 2)], 1, NOW);
    expect(two.bestSingle?.chainId).toBe("a");
    expect(two.bestSingle?.total).toBe(10);
    // Three units: one complete pair at the deal, the third at regular price.
    expect(optimizeCart(deal, [line("soap", 3)], 1, NOW).bestSingle?.total).toBe(18);
  });

  it("ignores prices marked unusable", () => {
    const broken = store(1, "a", { milk: 1 });
    broken.offers.milk.usable = false;
    const result = optimizeCart([broken, store(2, "b", { milk: 6 })], [line("milk")], 1, NOW);
    expect(result.bestSingle?.chainId).toBe("b");
  });

  it("does not split across stores when the price is the same", () => {
    const tied = [store(1, "a", { milk: 5, bread: 5 }), store(2, "b", { milk: 5, bread: 6 })];
    expect(optimizeCart(tied, [line("milk"), line("bread")], 2, NOW).optimalSplit?.storeCount).toBe(1);
  });

  it("handles an empty cart", () => {
    expect(optimizeCart(stores, [], 2, NOW).bestSingle).toBeNull();
  });
});
