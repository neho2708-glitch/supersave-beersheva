import { describe, expect, it } from "vitest";
import { compareChains, filterProducts, normalizeSearch, summarize } from "../frontend/src/lib/compare";
import type { Branch, Chain, PriceRow, Product } from "../frontend/src/lib/types";

const NOW = new Date("2026-11-05T12:00:00Z");
const chains: Chain[] = [
  { id: "a", nameHe: "א", nameEn: "A", color: "#000", website: null },
  { id: "b", nameHe: "ב", nameEn: "B", color: "#000", website: null },
  { id: "c", nameHe: "ג", nameEn: "C", color: "#000", website: null },
];
const branches: Branch[] = [
  { id: 1, chainId: "a", storeCode: "1", nameHe: "a1", address: null, city: "באר שבע", subchainName: null },
  { id: 2, chainId: "a", storeCode: "2", nameHe: "a2", address: null, city: "באר שבע", subchainName: null },
  { id: 3, chainId: "b", storeCode: "3", nameHe: "b1", address: null, city: "באר שבע", subchainName: null },
];
const row = (over: Partial<PriceRow>): PriceRow => ({
  productId: "p",
  branchId: 1,
  chainId: "a",
  regular: 10,
  unitPrice: null,
  unitLabel: null,
  status: "VERIFIED",
  suspect: false,
  suspectReason: null,
  publishedAt: "2026-11-05T06:00:00Z",
  collectedAt: "2026-11-05T07:00:00Z",
  sourceName: "src",
  sourceUrl: "https://example.test",
  fileName: "f.gz",
  fileUrl: "https://example.test/f.gz",
  previousPrice: null,
  promos: [],
  ...over,
});
const product: Product = {
  id: "p",
  barcode: "7290000000001",
  nameHe: "קוטג' 5%",
  nameEn: null,
  brand: "תנובה",
  categoryId: "dairy",
  sizeAmount: 250,
  sizeUnit: "g",
  soldByWeight: false,
  image: null,
};

describe("compareChains", () => {
  it("shows a chain with no data as having no price, never an invented one", () => {
    const lines = compareChains([row({})], chains, branches, null, 48, NOW);
    const c = lines.find((l) => l.chain.id === "c");
    expect(c?.row).toBeNull();
    expect(c?.state).toBe("NONE");
    expect(c?.isCheapest).toBe(false);
  });

  it("uses the cheapest branch within a chain", () => {
    const lines = compareChains([row({ branchId: 1, regular: 12 }), row({ branchId: 2, regular: 9 })], chains, branches, null, 48, NOW);
    const a = lines.find((l) => l.chain.id === "a");
    expect(a?.branch?.id).toBe(2);
    expect(a?.bestUnit).toBe(9);
  });

  it("respects the user's branch selection", () => {
    const lines = compareChains([row({ branchId: 1, regular: 12 }), row({ branchId: 2, regular: 9 })], chains, branches, new Set([1]), 48, NOW);
    expect(lines.find((l) => l.chain.id === "a")?.bestUnit).toBe(12);
  });

  it("never marks a stale or suspect price as the cheapest", () => {
    const lines = compareChains(
      [
        row({ branchId: 1, regular: 1, publishedAt: "2026-10-01T00:00:00Z" }),
        row({ branchId: 3, chainId: "b", regular: 10 }),
      ],
      chains,
      branches,
      null,
      48,
      NOW,
    );
    expect(lines.find((l) => l.chain.id === "a")?.state).toBe("STALE");
    expect(lines.find((l) => l.chain.id === "a")?.isCheapest).toBe(false);
    expect(lines.find((l) => l.chain.id === "b")?.isCheapest).toBe(true);

    const suspect = compareChains([row({ regular: 1, suspect: true }), row({ branchId: 3, chainId: "b", regular: 10 })], chains, branches, null, 48, NOW);
    expect(suspect.find((l) => l.chain.id === "a")?.isCheapest).toBe(false);
  });

  it("has no cheapest at all when nothing is verified", () => {
    const lines = compareChains([row({ publishedAt: "2026-01-01T00:00:00Z" })], chains, branches, null, 48, NOW);
    expect(lines.some((l) => l.isCheapest)).toBe(false);
  });
});

describe("summarize and filter", () => {
  const rows = new Map([["p", [row({ regular: 8, previousPrice: 10 })]]]);
  const summary = summarize(product, rows.get("p") as PriceRow[], chains, branches, null, 48, NOW);

  it("reports a price drop", () => {
    expect(summary.priceDropped).toBe(true);
    expect(summary.cheapest?.price).toBe(8);
    expect(summary.chainsWithPrice).toBe(1);
  });

  it("searches by name without quote marks and by barcode", () => {
    expect(filterProducts([summary], rows, { search: "קוטג" })).toHaveLength(1);
    expect(filterProducts([summary], rows, { search: "7290000000001" })).toHaveLength(1);
    expect(filterProducts([summary], rows, { search: "במבה" })).toHaveLength(0);
    expect(normalizeSearch(`ק"ג  'א`)).toBe("קג א");
  });

  it("filters by chain, brand, category and flags", () => {
    expect(filterProducts([summary], rows, { chain: "a" })).toHaveLength(1);
    expect(filterProducts([summary], rows, { chain: "b" })).toHaveLength(0);
    expect(filterProducts([summary], rows, { brand: "תנובה" })).toHaveLength(1);
    expect(filterProducts([summary], rows, { category: "drinks" })).toHaveLength(0);
    expect(filterProducts([summary], rows, { promosOnly: true })).toHaveLength(0);
    expect(filterProducts([summary], rows, { droppedOnly: true })).toHaveLength(1);
  });
});
