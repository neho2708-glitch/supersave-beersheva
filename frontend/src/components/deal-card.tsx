"use client";

import { formatPrice } from "@backend/pricing";
import type { Branch, Chain, Product } from "@/lib/types";
import { useApp } from "./providers";
import { formatDateTime, Price, ProductThumb } from "./ui";

export interface Deal {
  key: string;
  product: Product;
  chain: Chain;
  branch: Branch;
  regular: number;
  unit: number;
  minQty: number;
  bundlePrice: number | null;
  description: string;
  endsAt: string | null;
  savingPercent: number;
  sourceName: string;
  fileName: string;
  publishedAt: string;
}

export function DealCard({ deal }: { deal: Deal }) {
  const { openProduct } = useApp();
  return (
    <button onClick={() => openProduct(deal.product.id)} className="card relative flex flex-col p-3 text-right transition-shadow hover:shadow-lg">
      <span className="absolute right-2 top-2 z-10 rounded-md bg-deal-500 px-2 py-0.5 text-sm font-bold text-white">
        <span dir="ltr">-{deal.savingPercent}%</span>
      </span>
      <ProductThumb product={deal.product} className="h-28 w-full" />
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold">{deal.product.nameHe}</h3>
      <p className="mt-0.5 text-xs font-semibold text-forest-700">{deal.chain.nameHe}</p>
      <div className="mt-auto flex items-baseline gap-2 pt-2">
        <Price value={deal.unit} className="text-lg text-deal-600" />
        <span className="tabular text-xs text-mist-500 line-through">{formatPrice(deal.regular)}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-mist-700">{deal.description}</p>
      {deal.minQty > 1 && <p className="text-xs text-mist-500">מחיר ליחידה בקניית {deal.minQty}</p>}
      <p className="mt-1 text-[0.7rem] text-mist-500" title={deal.fileName}>
        מקור: {deal.sourceName} · {formatDateTime(deal.publishedAt)}
      </p>
    </button>
  );
}
