// Pure domain rules for prices. No I/O, so they run on the server, in the browser and in tests.

export type PriceStatus = "VERIFIED" | "STALE" | "DEMO";

export interface PromoOffer {
  id: number;
  description: string;
  minQty: number;
  maxQty: number | null;
  /** Total price for minQty units, as published. */
  discountedPrice: number | null;
  /** Effective price per unit at minQty. Null if the terms could not be computed safely. */
  promoUnitPrice: number | null;
  computable: boolean;
  notComputableBecause: string | null;
  requiresClub: boolean;
  isCoupon: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export const DEFAULT_STALE_HOURS = 48;

/** A source file older than the limit is STALE no matter what was stored at import time. */
export function resolveStatus(
  stored: PriceStatus,
  publishedAt: string | Date,
  now: Date = new Date(),
  staleAfterHours: number = DEFAULT_STALE_HOURS,
): PriceStatus {
  if (stored === "DEMO") return "DEMO";
  const published = new Date(publishedAt).getTime();
  if (Number.isNaN(published)) return "STALE";
  const ageHours = (now.getTime() - published) / 3_600_000;
  return ageHours > staleAfterHours ? "STALE" : stored;
}

export function isPromoActive(promo: PromoOffer, now: Date = new Date()): boolean {
  if (promo.startsAt && new Date(promo.startsAt) > now) return false;
  if (promo.endsAt && new Date(promo.endsAt) < now) return false;
  return true;
}

/** Promotions that may change a computed price: active, open to everyone, and understood. */
export function usablePromos(promos: PromoOffer[], now: Date = new Date()): PromoOffer[] {
  return promos.filter(
    (p) => p.computable && !p.requiresClub && !p.isCoupon && p.promoUnitPrice !== null && isPromoActive(p, now),
  );
}

export function bestPromo(promos: PromoOffer[], now: Date = new Date()): PromoOffer | null {
  const usable = usablePromos(promos, now);
  if (usable.length === 0) return null;
  return usable.reduce((best, p) => ((p.promoUnitPrice as number) < (best.promoUnitPrice as number) ? p : best));
}

const round = (value: number) => Math.round(value * 100) / 100;

export interface LineCost {
  total: number;
  /** What the same quantity costs with no promotion. */
  regularTotal: number;
  promoApplied: PromoOffer | null;
  /** More units would unlock a promotion that this quantity does not reach. */
  unitsToPromo: number | null;
}

/**
 * Cost of `quantity` units. A "2 for 20" deal only applies to complete sets, up to maxQty;
 * leftover units cost the regular price. The cheapest usable promotion for this exact
 * quantity wins, so a deal the quantity does not reach is not applied.
 */
export function lineCost(
  regular: number,
  quantity: number,
  promos: PromoOffer[] = [],
  now: Date = new Date(),
): LineCost {
  const regularTotal = round(regular * quantity);
  let best: LineCost = { total: regularTotal, regularTotal, promoApplied: null, unitsToPromo: null };
  let closest: number | null = null;
  for (const promo of usablePromos(promos, now)) {
    const unit = promo.promoUnitPrice as number;
    const setSize = promo.minQty > 0 ? promo.minQty : 1;
    if (quantity < setSize) {
      const missing = setSize - quantity;
      closest = closest === null ? missing : Math.min(closest, missing);
      continue;
    }
    const cap = promo.maxQty && promo.maxQty > 0 ? Math.min(quantity, promo.maxQty) : quantity;
    const sets = Math.floor(cap / setSize + 1e-9);
    const discounted = sets * setSize;
    const total = round(discounted * unit + (quantity - discounted) * regular);
    if (total < best.total) best = { total, regularTotal, promoApplied: promo, unitsToPromo: null };
  }
  if (!best.promoApplied) best.unitsToPromo = closest;
  return best;
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return `₪${value.toFixed(2)}`;
}

/** Display text for a package size. */
export function formatSize(amount: number | null, unit: string | null, soldByWeight = false): string {
  if (soldByWeight) return 'לפי משקל (ק"ג)';
  if (!amount || !unit) return "";
  if (unit === "g") return amount >= 1000 ? `${trim(amount / 1000)} ק"ג` : `${trim(amount)} גרם`;
  if (unit === "ml") return amount >= 1000 ? `${trim(amount / 1000)} ליטר` : `${trim(amount)} מ"ל`;
  return amount > 1 ? `${trim(amount)} יחידות` : "יחידה";
}

const trim = (n: number) => String(Math.round(n * 100) / 100);
