import { describe, expect, it } from "vitest";
import { bestPromo, formatSize, lineCost, resolveStatus, usablePromos, type PromoOffer } from "../backend/src/pricing";

const NOW = new Date("2026-11-05T12:00:00Z");
const offer = (over: Partial<PromoOffer> = {}): PromoOffer => ({
  id: 1,
  description: "",
  minQty: 1,
  maxQty: null,
  discountedPrice: 5,
  promoUnitPrice: 5,
  computable: true,
  notComputableBecause: null,
  requiresClub: false,
  isCoupon: false,
  startsAt: null,
  endsAt: null,
  ...over,
});

describe("resolveStatus", () => {
  it("keeps a recent file VERIFIED", () => {
    expect(resolveStatus("VERIFIED", "2026-11-05T01:00:00Z", NOW, 48)).toBe("VERIFIED");
  });
  it("turns an old file STALE, whatever was stored", () => {
    expect(resolveStatus("VERIFIED", "2026-11-01T01:00:00Z", NOW, 48)).toBe("STALE");
  });
  it("treats an unreadable date as STALE", () => {
    expect(resolveStatus("VERIFIED", "not a date", NOW, 48)).toBe("STALE");
  });
  it("never promotes DEMO", () => {
    expect(resolveStatus("DEMO", "2026-11-05T11:00:00Z", NOW, 48)).toBe("DEMO");
  });
});

describe("promotions", () => {
  it("excludes club, coupon, expired, future and non-computable offers", () => {
    const list = [
      offer({ requiresClub: true }),
      offer({ isCoupon: true }),
      offer({ endsAt: "2026-11-01T00:00:00Z" }),
      offer({ startsAt: "2026-12-01T00:00:00Z" }),
      offer({ computable: false, promoUnitPrice: null }),
    ];
    expect(usablePromos(list, NOW)).toEqual([]);
    expect(bestPromo(list, NOW)).toBeNull();
  });
  it("picks the lowest per-unit price", () => {
    const best = bestPromo([offer({ id: 1, promoUnitPrice: 5 }), offer({ id: 2, promoUnitPrice: 4 })], NOW);
    expect(best?.id).toBe(2);
  });
});

describe("lineCost", () => {
  it("respects maxQty", () => {
    const cost = lineCost(10, 5, [offer({ minQty: 1, maxQty: 2, promoUnitPrice: 5 })], NOW);
    expect(cost.total).toBe(2 * 5 + 3 * 10);
  });
  it("says how many more units unlock a deal", () => {
    const cost = lineCost(10, 1, [offer({ minQty: 3, promoUnitPrice: 8 })], NOW);
    expect(cost.total).toBe(10);
    expect(cost.unitsToPromo).toBe(2);
  });
  it("does not apply a promotion that costs more", () => {
    const cost = lineCost(4, 1, [offer({ minQty: 1, promoUnitPrice: 5 })], NOW);
    expect(cost.total).toBe(4);
    expect(cost.promoApplied).toBeNull();
  });
});

describe("formatSize", () => {
  it("formats common sizes in Hebrew", () => {
    expect(formatSize(1500, "ml")).toBe("1.5 ליטר");
    expect(formatSize(250, "g")).toBe("250 גרם");
    expect(formatSize(12, "unit")).toBe("12 יחידות");
    expect(formatSize(1000, "g", true)).toContain("משקל");
  });
});
