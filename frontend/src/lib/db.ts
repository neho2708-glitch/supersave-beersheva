import { PrismaClient } from "@prisma/client";
import type { PriceStatus, PromoOffer } from "@backend/pricing";
import type { Snapshot } from "./compare";
import type { Branch, Category, Chain, PriceRow, Product } from "./types";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; snapshot?: { at: number; data: Snapshot } };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const SNAPSHOT_TTL_MS = 60_000;

export const staleHours = () => Number(process.env.PRICE_STALE_AFTER_HOURS ?? 48) || 48;

export async function getCategories(): Promise<Category[]> {
  return prisma.productCategory.findMany({ orderBy: { sortOrder: "asc" } });
}

/**
 * All current prices, held in memory for a minute. With a catalogue of hundreds of products this
 * is simpler and faster than per-filter SQL. The store's status is re-derived on every read.
 */
export async function getSnapshot(): Promise<Snapshot> {
  const cached = globalForPrisma.snapshot;
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.data;

  const [productRows, chainRows, branchRows, priceRows, promoRows, previous] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { images: { where: { isPrimary: true }, take: 1 } },
      orderBy: { nameHe: "asc" },
    }),
    prisma.supermarketChain.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.branch.findMany({ where: { active: true }, orderBy: [{ chainId: "asc" }, { nameHe: "asc" }] }),
    prisma.productPrice.findMany({
      include: { file: { select: { fileName: true, url: true } }, source: { select: { name: true, url: true } } },
    }),
    prisma.promotionItem.findMany({ include: { promotion: true } }),
    prisma.$queryRaw<{ productId: string; branchId: number; price: unknown }[]>`
      SELECT "productId", "branchId", price FROM (
        SELECT "productId", "branchId", price,
               row_number() OVER (PARTITION BY "productId", "branchId" ORDER BY "recordedAt" DESC) AS rn
        FROM "PriceHistory"
      ) ranked WHERE rn = 2`,
  ]);

  const products: Product[] = productRows.map((p) => ({
    id: p.id,
    barcode: p.barcode,
    nameHe: p.nameHe,
    nameEn: p.nameEn,
    brand: p.brand,
    categoryId: p.categoryId,
    sizeAmount: num(p.sizeAmount),
    sizeUnit: p.sizeUnit,
    soldByWeight: p.soldByWeight,
    image: p.images[0]
      ? {
          url: p.images[0].url,
          source: p.images[0].source,
          sourceUrl: p.images[0].sourceUrl,
          license: p.images[0].license,
          attribution: p.images[0].attribution,
        }
      : null,
  }));
  const chains: Chain[] = chainRows.map((c) => ({ id: c.id, nameHe: c.nameHe, nameEn: c.nameEn, color: c.color, website: c.website }));
  const branches: Branch[] = branchRows.map((b) => ({
    id: b.id,
    chainId: b.chainId,
    storeCode: b.storeCode,
    nameHe: b.nameHe,
    address: b.address,
    city: b.city,
    subchainName: b.subchainName,
  }));

  const promoKey = (productId: string, branchId: number) => `${productId}|${branchId}`;
  const promos = new Map<string, PromoOffer[]>();
  for (const item of promoRows) {
    const key = promoKey(item.productId, item.promotion.branchId);
    const list = promos.get(key) ?? [];
    list.push({
      id: item.id,
      description: item.promotion.description,
      minQty: num(item.minQty) ?? 1,
      maxQty: num(item.maxQty),
      discountedPrice: num(item.discountedPrice),
      promoUnitPrice: num(item.promoUnitPrice),
      computable: item.computable,
      notComputableBecause: item.notComputableBecause,
      requiresClub: item.promotion.requiresClub,
      isCoupon: item.promotion.isCoupon,
      startsAt: item.promotion.startsAt?.toISOString() ?? null,
      endsAt: item.promotion.endsAt?.toISOString() ?? null,
    });
    promos.set(key, list);
  }
  const previousByKey = new Map(previous.map((r) => [promoKey(r.productId, r.branchId), Number(r.price)]));

  const prices = new Map<string, PriceRow[]>();
  for (const r of priceRows) {
    const rows = prices.get(r.productId) ?? [];
    rows.push({
      productId: r.productId,
      branchId: r.branchId,
      chainId: r.chainId,
      regular: Number(r.regularPrice),
      unitPrice: num(r.unitPrice),
      unitLabel: r.unitLabel,
      status: r.verificationStatus as PriceStatus,
      suspect: r.suspect,
      suspectReason: r.suspectReason,
      publishedAt: r.sourcePublishedAt.toISOString(),
      collectedAt: r.collectedAt.toISOString(),
      sourceName: r.source.name,
      sourceUrl: r.source.url,
      fileName: r.file.fileName,
      fileUrl: r.file.url,
      previousPrice: previousByKey.get(promoKey(r.productId, r.branchId)) ?? null,
      promos: promos.get(promoKey(r.productId, r.branchId)) ?? [],
    });
    prices.set(r.productId, rows);
  }

  const data: Snapshot = { products, chains, branches, prices, staleAfterHours: staleHours(), generatedAt: new Date().toISOString() };
  globalForPrisma.snapshot = { at: Date.now(), data };
  return data;
}

export function clearSnapshot() {
  globalForPrisma.snapshot = undefined;
}

export async function getHistory(productId: string) {
  return prisma.priceHistory.findMany({
    where: { productId },
    orderBy: { recordedAt: "asc" },
    select: { chainId: true, price: true, recordedAt: true },
  });
}

/** Parse "1,2,3" from a query string. An empty or invalid value means every branch. */
export function parseBranchIds(value: string | null | undefined): Set<number> | null {
  if (!value) return null;
  const ids = value.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? new Set(ids) : null;
}
