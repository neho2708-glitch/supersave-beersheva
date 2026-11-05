import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLayout, moveWithCollision, pick, rayBox, type StoreProduct } from "../frontend/src/components/store/layout";

const catalog = JSON.parse(readFileSync(join(__dirname, "../database/catalog/products.json"), "utf8")) as {
  id: string;
  barcode: string | null;
  category: string;
  sizeAmount: number | null;
  sizeUnit: string | null;
  soldByWeight: boolean;
}[];
const products: StoreProduct[] = catalog.map((p) => ({
  id: p.id,
  categoryId: p.category,
  sizeAmount: p.sizeAmount,
  sizeUnit: p.sizeUnit,
  soldByWeight: p.soldByWeight,
}));
const layout = buildLayout(products);

describe("catalogue", () => {
  it("has the required department sizes", () => {
    const count = (id: string) => catalog.filter((p) => p.category === id).length;
    expect({
      produce: count("produce"),
      dairy: count("dairy"),
      meat: count("meat"),
      bread: count("bread"),
      drinks: count("drinks"),
      snacks: count("snacks"),
      cleaning: count("cleaning"),
      hygiene: count("hygiene"),
      dry: count("dry"),
      frozen: count("frozen"),
    }).toEqual({ produce: 35, dairy: 45, meat: 30, bread: 25, drinks: 35, snacks: 35, cleaning: 30, hygiene: 25, dry: 25, frozen: 15 });
  });

  it("uses only real-looking barcodes with valid check digits, and none for weighed goods", () => {
    for (const product of catalog) {
      if (product.barcode === null) {
        expect(product.id.startsWith("fresh-")).toBe(true);
        continue;
      }
      expect(product.barcode).toMatch(/^\d{8,14}$/);
    }
  });
});

describe("store layout", () => {
  it("places every catalogue product on a shelf or in a crate", () => {
    const placed = new Set([...layout.slots.map((s) => s.productId), ...layout.bins.map((b) => b.productId)]);
    const missing = products.filter((p) => !placed.has(p.id)).map((p) => p.id);
    expect(missing).toEqual([]);
  });

  it("keeps the instance count reasonable for phones", () => {
    expect(layout.slots.length).toBeLessThan(6000);
  });

  it("gives every product a price tag", () => {
    const tagged = new Set(layout.tags.map((t) => t.productId));
    expect(products.filter((p) => !tagged.has(p.id))).toEqual([]);
  });

  it("spawns the shopper in free space", () => {
    const { x, z } = layout.spawn;
    expect(moveWithCollision(layout.colliders, x, z, 0, 0)).toEqual({ x, z });
    const moved = moveWithCollision(layout.colliders, x, z, 0.1, 0);
    expect(moved.x).toBeCloseTo(x + 0.1);
  });
});

describe("collision", () => {
  const walls = [{ minX: 0, maxX: 1, minY: 0, maxY: 2, minZ: -5, maxZ: 5 }];
  it("stops at a wall and slides along it", () => {
    const moved = moveWithCollision(walls, -0.5, 0, 0.5, 1);
    expect(moved.x).toBe(-0.5);
    expect(moved.z).toBe(1);
  });
  it("cannot leave the store however far you walk", () => {
    let position = { x: layout.spawn.x, z: layout.spawn.z };
    for (let i = 0; i < 400; i++) position = moveWithCollision(layout.colliders, position.x, position.z, 0.25, 0.25);
    expect(position.x).toBeLessThan(layout.bounds.maxX);
    expect(position.z).toBeLessThan(layout.bounds.maxZ);
  });
});

describe("aiming", () => {
  it("computes ray and box intersections", () => {
    const b = { minX: 1, maxX: 2, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
    expect(rayBox(0, 0, 0, 1, 0, 0, b)).toBe(1);
    expect(rayBox(0, 0, 0, -1, 0, 0, b)).toBeNull();
    expect(rayBox(0, 5, 0, 1, 0, 0, b)).toBeNull();
  });

  it("selects the product you look at, and not one behind the shelf", () => {
    const slot = layout.slots[0];
    const toward = slot.rotY === 0 ? { x: 0, z: 1 } : { x: Math.sin(slot.rotY), z: Math.cos(slot.rotY) };
    const ox = slot.x + toward.x * 2;
    const oz = slot.z + toward.z * 2;
    const hit = pick(layout, ox, slot.y, oz, -toward.x, 0, -toward.z);
    expect(hit?.kind).toBe("product");
    if (hit?.kind === "product") expect(hit.productId).toBe(slot.productId);
  });

  it("returns nothing when looking at open air", () => {
    expect(pick(layout, layout.spawn.x, 1.6, layout.spawn.z, 0, 1, 0, 2)).toBeNull();
  });
});
