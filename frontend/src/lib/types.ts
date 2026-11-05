import type { PriceStatus, PromoOffer } from "@backend/pricing";

export interface ProductImageInfo {
  url: string;
  source: string;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
}

export interface Product {
  id: string;
  barcode: string | null;
  nameHe: string;
  nameEn: string | null;
  brand: string | null;
  categoryId: string;
  sizeAmount: number | null;
  sizeUnit: string | null;
  soldByWeight: boolean;
  image: ProductImageInfo | null;
}

export interface Category {
  id: string;
  nameHe: string;
  nameEn: string;
  color: string;
  icon: string;
}

export interface Chain {
  id: string;
  nameHe: string;
  nameEn: string;
  color: string;
  website: string | null;
}

export interface Branch {
  id: number;
  chainId: string;
  storeCode: string;
  nameHe: string;
  address: string | null;
  city: string;
  subchainName: string | null;
}

/** One product's price in one branch, with its full provenance. */
export interface PriceRow {
  productId: string;
  branchId: number;
  chainId: string;
  regular: number;
  unitPrice: number | null;
  unitLabel: string | null;
  status: PriceStatus;
  suspect: boolean;
  suspectReason: string | null;
  publishedAt: string;
  collectedAt: string;
  sourceName: string;
  sourceUrl: string;
  fileName: string;
  fileUrl: string;
  previousPrice: number | null;
  promos: PromoOffer[];
}

export type RowState = "VERIFIED" | "STALE" | "DEMO" | "NONE";

/** A chain's line in a comparison: its cheapest usable branch, or no price at all. */
export interface ChainPrice {
  chain: Chain;
  branch: Branch | null;
  row: PriceRow | null;
  branchCount: number;
  bestUnit: number | null;
  promo: PromoOffer | null;
  isCheapest: boolean;
  state: RowState;
}

export interface ProductSummary extends Product {
  cheapest: { price: number; chainId: string; chainName: string; viaPromo: boolean; minQty: number; status: PriceStatus } | null;
  chainsWithPrice: number;
  chainsTotal: number;
  hasPromo: boolean;
  priceDropped: boolean;
  publishedAt: string | null;
}

export interface ProductDetail {
  product: ProductSummary;
  category: Category | undefined;
  chains: ChainPrice[];
  history: { chainId: string; chainName: string; color: string; points: { at: string; price: number }[] }[];
}
