// The store's floor plan, shelf packing and picking. Plain data with no three.js,
// so collision and aiming can be unit-tested.

export interface StoreProduct {
  id: string;
  categoryId: string;
  sizeAmount: number | null;
  sizeUnit: string | null;
  soldByWeight: boolean;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export type Shape = "box" | "bottle" | "can";

export interface Slot {
  productId: string;
  shape: Shape;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rotY: number;
  box: AABB;
}

export interface Tag {
  productId: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface Part {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface Sign {
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
}

export interface Zone {
  id: string;
  label: string;
  color: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Bin {
  productId: string;
  x: number;
  z: number;
  box: AABB;
}

/** A surface the aim ray can land on. Hitting one with no product means "look at this shelf". */
export interface ShelfFace {
  box: AABB;
  normalX: number;
  normalZ: number;
  zoneId: string;
}

export interface Cabinet {
  x: number;
  z: number;
  width: number;
  rotY: number;
  frozen: boolean;
}

export interface StoreLayout {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: { x: number; z: number; yaw: number };
  slots: Slot[];
  tags: Tag[];
  planks: Part[];
  frames: Part[];
  colliders: AABB[];
  signs: Sign[];
  zones: Zone[];
  bins: Bin[];
  faces: ShelfFace[];
  cabinets: Cabinet[];
  checkouts: Part[];
}

export const CEILING_HEIGHT = 4.2;
export const EYE_HEIGHT = 1.62;
const GONDOLA_LEVELS = [0.14, 0.54, 0.94, 1.34, 1.74];
const FRIDGE_LEVELS = [0.26, 0.66, 1.06, 1.46, 1.86];

export const DEPARTMENTS: Record<string, { label: string; color: string }> = {
  produce: { label: "פירות וירקות", color: "#4d7c0f" },
  dairy: { label: "מוצרי חלב וביצים", color: "#0284c7" },
  meat: { label: "בשר ודגים", color: "#b91c1c" },
  bread: { label: "לחמים ומאפים", color: "#b45309" },
  drinks: { label: "משקאות", color: "#7c3aed" },
  snacks: { label: "חטיפים וממתקים", color: "#db2777" },
  cleaning: { label: "מוצרי ניקיון", color: "#0891b2" },
  hygiene: { label: "היגיינה וטיפוח", color: "#9333ea" },
  dry: { label: "יבשים ושימורים", color: "#a16207" },
  frozen: { label: "קפואים", color: "#2563eb" },
};

export function packageDimensions(product: StoreProduct): { shape: Shape; w: number; h: number; d: number } {
  const amount = product.sizeAmount ?? 0;
  const liquid = product.sizeUnit === "ml";
  if (liquid && amount >= 700) return { shape: "bottle", w: 0.11, h: 0.33, d: 0.11 };
  if (liquid && amount >= 400) return { shape: "bottle", w: 0.085, h: 0.25, d: 0.085 };
  if (liquid) return { shape: "can", w: 0.075, h: 0.14, d: 0.075 };
  if (product.sizeUnit === "g" && amount <= 120) return { shape: "box", w: 0.13, h: 0.17, d: 0.05 };
  if (product.sizeUnit === "g" && amount <= 500) return { shape: "box", w: 0.17, h: 0.24, d: 0.08 };
  return { shape: "box", w: 0.22, h: 0.3, d: 0.1 };
}

interface SideSpec {
  zoneId: string;
  products: StoreProduct[];
  startX: number;
  startZ: number;
  dirX: number;
  dirZ: number;
  normalX: number;
  normalZ: number;
  length: number;
  levels: number[];
  /** Distance from the side's center line to the front of the shelf. */
  front: number;
}

function packSide(spec: SideSpec, slots: Slot[], tags: Tag[]) {
  const dims = spec.products.map(packageDimensions);
  const gap = 0.012;
  const capacity = spec.length * spec.levels.length;
  const sum = dims.reduce((total, d) => total + d.w + gap, 0);
  const facings = Math.max(1, Math.floor(capacity / Math.max(sum, 0.01)));
  const rotY = Math.atan2(spec.normalX, spec.normalZ);
  let level = 0;
  let along = 0.03;
  for (let i = 0; i < spec.products.length; i++) {
    const product = spec.products[i];
    const dim = dims[i];
    for (let f = 0; f < facings; f++) {
      if (along + dim.w > spec.length - 0.03) {
        level += 1;
        along = 0.03;
      }
      if (level >= spec.levels.length) return;
      const baseX = spec.startX + spec.dirX * (along + dim.w / 2);
      const baseZ = spec.startZ + spec.dirZ * (along + dim.w / 2);
      const offset = spec.front - dim.d / 2 - 0.01;
      const x = baseX + spec.normalX * offset;
      const z = baseZ + spec.normalZ * offset;
      const y = spec.levels[level] + 0.018 + dim.h / 2;
      const halfX = Math.abs(spec.normalX) > 0.5 ? dim.d / 2 : dim.w / 2;
      const halfZ = Math.abs(spec.normalX) > 0.5 ? dim.w / 2 : dim.d / 2;
      slots.push({
        productId: product.id,
        shape: dim.shape,
        x,
        y,
        z,
        w: dim.w,
        h: dim.h,
        d: dim.d,
        rotY,
        box: {
          minX: x - halfX,
          maxX: x + halfX,
          minY: y - dim.h / 2,
          maxY: y + dim.h / 2,
          minZ: z - halfZ,
          maxZ: z + halfZ,
        },
      });
      if (f === 0) {
        tags.push({
          productId: product.id,
          x: baseX + spec.normalX * (spec.front + 0.022),
          y: spec.levels[level] - 0.012,
          z: baseZ + spec.normalZ * (spec.front + 0.022),
          rotY,
        });
      }
      along += dim.w + gap;
    }
  }
}

const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number): Part => ({ x, y, z, sx, sy, sz });

const aabb = (minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 2.4): AABB => ({ minX, maxX, minY, maxY, minZ, maxZ });

export function buildLayout(products: StoreProduct[]): StoreLayout {
  const slots: Slot[] = [];
  const tags: Tag[] = [];
  const planks: Part[] = [];
  const frames: Part[] = [];
  const colliders: AABB[] = [];
  const signs: Sign[] = [];
  const zones: Zone[] = [];
  const bins: Bin[] = [];
  const faces: ShelfFace[] = [];
  const cabinets: Cabinet[] = [];
  const checkouts: Part[] = [];

  const bounds = { minX: -24, maxX: 15, minZ: -15.5, maxZ: 12 };
  const of = (id: string) => products.filter((p) => p.categoryId === id);

  // Gondolas: free-standing double-sided shelves with wide aisles between them.
  const GZ0 = -7;
  const GLEN = 10;
  const half = (list: StoreProduct[], part: 0 | 1) => {
    const mid = Math.ceil(list.length / 2);
    return part === 0 ? list.slice(0, mid) : list.slice(mid);
  };
  const gondolas: { x: number; west: [string, StoreProduct[]]; east: [string, StoreProduct[]] }[] = [
    { x: -9, west: ["bread", of("bread")], east: ["dry", of("dry")] },
    { x: -4, west: ["drinks", half(of("drinks"), 0)], east: ["drinks", half(of("drinks"), 1)] },
    { x: 1, west: ["snacks", half(of("snacks"), 0)], east: ["snacks", half(of("snacks"), 1)] },
    { x: 6, west: ["cleaning", of("cleaning")], east: ["hygiene", of("hygiene")] },
  ];
  for (const g of gondolas) {
    colliders.push(aabb(g.x - 0.55, g.x + 0.55, GZ0 - 0.1, GZ0 + GLEN + 0.1));
    frames.push(box(g.x, 1.05, GZ0 + GLEN / 2, 0.06, 2.1, GLEN)); // back panel
    frames.push(box(g.x, 0.06, GZ0 + GLEN / 2, 1.04, 0.12, GLEN)); // kick plate
    for (const end of [GZ0, GZ0 + GLEN]) frames.push(box(g.x, 1.05, end, 1.04, 2.1, 0.05));
    for (const level of GONDOLA_LEVELS) {
      planks.push(box(g.x - 0.26, level, GZ0 + GLEN / 2, 0.5, 0.03, GLEN));
      planks.push(box(g.x + 0.26, level, GZ0 + GLEN / 2, 0.5, 0.03, GLEN));
    }
    for (const [sign, side] of [[-1, g.west], [1, g.east]] as const) {
      const [zoneId, list] = side;
      packSide(
        {
          zoneId,
          products: list,
          startX: g.x,
          startZ: sign < 0 ? GZ0 : GZ0 + GLEN,
          dirX: 0,
          dirZ: sign < 0 ? 1 : -1,
          normalX: sign,
          normalZ: 0,
          length: GLEN,
          levels: GONDOLA_LEVELS,
          front: 0.5,
        },
        slots,
        tags,
      );
      faces.push({
        box: aabb(sign < 0 ? g.x - 0.5 : g.x, sign < 0 ? g.x : g.x + 0.5, GZ0, GZ0 + GLEN, 0, 2.1),
        normalX: sign,
        normalZ: 0,
        zoneId,
      });
      const dept = DEPARTMENTS[zoneId];
      signs.push({ label: dept.label, color: dept.color, x: g.x + sign * 0.04, y: 2.32, z: GZ0 + GLEN / 2, rotY: Math.atan2(sign, 0), width: 3.2 });
      zones.push({
        id: zoneId,
        label: dept.label,
        color: dept.color,
        minX: sign < 0 ? g.x - 2 : g.x,
        maxX: sign < 0 ? g.x : g.x + 2,
        minZ: GZ0,
        maxZ: GZ0 + GLEN,
      });
    }
  }

  // Refrigerators along the back wall and freezers along the east wall.
  const cabinet = (
    zoneId: string,
    list: StoreProduct[],
    centerA: number,
    width: number,
    wall: "north" | "east",
    frozen: boolean,
  ) => {
    const dept = DEPARTMENTS[zoneId];
    const cz = wall === "north" ? -14.9 : centerA;
    const cx = wall === "north" ? centerA : 14.4;
    const normalX = wall === "east" ? -1 : 0;
    const normalZ = wall === "north" ? 1 : 0;
    const depth = 0.9;
    colliders.push(
      wall === "north"
        ? aabb(cx - width / 2, cx + width / 2, cz - depth / 2 - 0.2, cz + depth / 2 + 0.08)
        : aabb(cx - depth / 2 - 0.08, cx + depth / 2 + 0.2, cz - width / 2, cz + width / 2),
    );
    cabinets.push({ x: cx, z: cz, width, rotY: Math.atan2(normalX, normalZ), frozen });
    for (const level of FRIDGE_LEVELS) {
      planks.push(wall === "north" ? box(cx, level, cz, width - 0.1, 0.03, depth - 0.2) : box(cx, level, cz, depth - 0.2, 0.03, width - 0.1));
    }
    packSide(
      {
        zoneId,
        products: list,
        startX: wall === "north" ? cx - width / 2 + 0.05 : cx,
        startZ: wall === "north" ? cz : cz + width / 2 - 0.05,
        dirX: wall === "north" ? 1 : 0,
        dirZ: wall === "north" ? 0 : -1,
        normalX,
        normalZ,
        length: width - 0.1,
        levels: FRIDGE_LEVELS,
        front: depth / 2 - 0.1,
      },
      slots,
      tags,
    );
    faces.push({
      box:
        wall === "north"
          ? aabb(cx - width / 2, cx + width / 2, cz - depth / 2, cz + depth / 2, 0, 2.3)
          : aabb(cx - depth / 2, cx + depth / 2, cz - width / 2, cz + width / 2, 0, 2.3),
      normalX,
      normalZ,
      zoneId,
    });
    signs.push({
      label: dept.label,
      color: dept.color,
      x: wall === "north" ? cx : 13.6,
      y: 3.1,
      z: wall === "north" ? cz + 0.6 : cz,
      rotY: Math.atan2(normalX, normalZ),
      width: 5,
    });
    zones.push(
      wall === "north"
        ? { id: zoneId, label: dept.label, color: dept.color, minX: cx - width / 2, maxX: cx + width / 2, minZ: -15.5, maxZ: -13 }
        : { id: zoneId, label: dept.label, color: dept.color, minX: 12.5, maxX: 15, minZ: cz - width / 2, maxZ: cz + width / 2 },
    );
  };
  cabinet("dairy", of("dairy"), -4.5, 14, "north", false);
  cabinet("meat", of("meat"), 8.2, 11, "north", false);
  cabinet("frozen", of("frozen"), -2, 7, "east", true);

  // Fresh produce: open crates, one per product.
  const produce = of("produce");
  const COLUMNS = 5;
  const BIN_W = 1.3;
  const BIN_D = 1.05;
  const ROW_GAP = 2.05;
  const startX = -22.1;
  const startZ = -9.5;
  const rows = Math.ceil(produce.length / COLUMNS);
  produce.forEach((product, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const x = startX + col * 1.85;
    const z = startZ + row * ROW_GAP;
    const crate = aabb(x - BIN_W / 2, x + BIN_W / 2, z - BIN_D / 2, z + BIN_D / 2, 0, 1.1);
    bins.push({ productId: product.id, x, z, box: crate });
    colliders.push(aabb(x - BIN_W / 2, x + BIN_W / 2, z - BIN_D / 2, z + BIN_D / 2));
    tags.push({ productId: product.id, x, y: 0.72, z: z + BIN_D / 2 + 0.02, rotY: 0 });
  });
  if (produce.length) {
    const dept = DEPARTMENTS.produce;
    const endX = startX + (COLUMNS - 1) * 1.85;
    signs.push({ label: dept.label, color: dept.color, x: (startX + endX) / 2, y: 3.3, z: startZ - 1.5, rotY: 0, width: 6 });
    zones.push({
      id: "produce",
      label: dept.label,
      color: dept.color,
      minX: startX - 1,
      maxX: endX + 1,
      minZ: startZ - 1,
      maxZ: startZ + rows * ROW_GAP,
    });
  }

  // Checkout lanes near the entrance.
  for (const x of [-11, -7, 2, 6]) {
    checkouts.push(box(x, 0.45, 7.8, 0.8, 0.9, 2.4));
    colliders.push(aabb(x - 0.45, x + 0.45, 6.55, 9.05));
  }

  // Outer walls.
  colliders.push(aabb(bounds.minX - 1, bounds.minX, bounds.minZ - 1, bounds.maxZ + 1, 0, 4));
  colliders.push(aabb(bounds.maxX, bounds.maxX + 1, bounds.minZ - 1, bounds.maxZ + 1, 0, 4));
  colliders.push(aabb(bounds.minX - 1, bounds.maxX + 1, bounds.minZ - 1, bounds.minZ, 0, 4));
  colliders.push(aabb(bounds.minX - 1, bounds.maxX + 1, bounds.maxZ, bounds.maxZ + 1, 0, 4));

  return {
    bounds,
    spawn: { x: -2.5, z: 10.4, yaw: 0 },
    slots,
    tags,
    planks,
    frames,
    colliders,
    signs,
    zones,
    bins,
    faces,
    cabinets,
    checkouts,
  };
}

/** Slab test. Returns the entry distance along the ray, or null on a miss. */
export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: AABB,
): number | null {
  let tMin = 0;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, min, max] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < min || o > max) return null;
      continue;
    }
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

export type Pick =
  | { kind: "product"; productId: string; slot: Slot | null; bin: Bin | null; distance: number }
  | { kind: "shelf"; face: ShelfFace; distance: number; x: number; y: number; z: number }
  | null;

/** The nearest thing the ray hits. Products are pickable only within reach. */
export function pick(
  layout: StoreLayout,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  reach = 9,
): Pick {
  let best: Pick = null;
  let bestT = reach;
  for (const slot of layout.slots) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, slot.box);
    if (t !== null && t < bestT) {
      bestT = t;
      best = { kind: "product", productId: slot.productId, slot, bin: null, distance: t };
    }
  }
  for (const bin of layout.bins) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, bin.box);
    if (t !== null && t < bestT) {
      bestT = t;
      best = { kind: "product", productId: bin.productId, slot: null, bin, distance: t };
    }
  }
  for (const face of layout.faces) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, face.box);
    if (t !== null && t < bestT - 0.02) {
      bestT = t;
      best = { kind: "shelf", face, distance: t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t };
    }
  }
  return best;
}

const PLAYER_RADIUS = 0.32;

function blocked(colliders: AABB[], x: number, z: number): boolean {
  for (const c of colliders) {
    if (x > c.minX - PLAYER_RADIUS && x < c.maxX + PLAYER_RADIUS && z > c.minZ - PLAYER_RADIUS && z < c.maxZ + PLAYER_RADIUS) return true;
  }
  return false;
}

/** Moves with sliding: each axis is tried on its own, so walls don't stop you dead. */
export function moveWithCollision(colliders: AABB[], x: number, z: number, dx: number, dz: number): { x: number; z: number } {
  let nx = x;
  let nz = z;
  if (!blocked(colliders, x + dx, nz)) nx = x + dx;
  if (!blocked(colliders, nx, z + dz)) nz = z + dz;
  return { x: nx, z: nz };
}
