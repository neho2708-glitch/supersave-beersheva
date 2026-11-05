"use client";

import { formatPrice, formatSize } from "@backend/pricing";
import { useState } from "react";
import type { ProductSummary, RowState } from "@/lib/types";
import { useApp } from "./providers";

export const CATEGORY_STYLE: Record<string, { color: string; icon: string }> = {
  produce: { color: "#4d7c0f", icon: "🥦" },
  dairy: { color: "#0284c7", icon: "🥛" },
  meat: { color: "#b91c1c", icon: "🥩" },
  bread: { color: "#b45309", icon: "🥖" },
  drinks: { color: "#7c3aed", icon: "🥤" },
  snacks: { color: "#db2777", icon: "🍫" },
  cleaning: { color: "#0891b2", icon: "🧽" },
  hygiene: { color: "#9333ea", icon: "🧴" },
  dry: { color: "#a16207", icon: "🥫" },
  frozen: { color: "#2563eb", icon: "🧊" },
};

const TRUST: Record<RowState, { label: string; className: string; icon: string }> = {
  VERIFIED: { label: "מחיר מאומת ממקור רשמי", className: "bg-leaf-100 text-forest-800", icon: "✓" },
  STALE: { label: "לא עדכני, ייתכן שהמחיר השתנה", className: "bg-warn-100 text-warn-700", icon: "!" },
  DEMO: { label: "נתון DEMO להמחשה בלבד", className: "bg-demo-100 text-demo-700", icon: "◇" },
  NONE: { label: "לא נמצא מחיר זמין", className: "bg-mist-100 text-mist-500", icon: "–" },
};

export function TrustBadge({ state, compact = false }: { state: RowState; compact?: boolean }) {
  const t = TRUST[state];
  return (
    <span title={t.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${t.className}`}>
      <span aria-hidden>{t.icon}</span>
      {compact ? { VERIFIED: "מאומת", STALE: "לא עדכני", DEMO: "DEMO", NONE: "אין מחיר" }[state] : t.label}
    </span>
  );
}

export function Price({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  return <span className={`tabular font-bold ${className}`}>{formatPrice(value)}</span>;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(new Date(iso));
}

/** The real product photo, or a designed placeholder when no openly licensed photo exists. */
export function ProductThumb({
  product,
  className = "",
}: {
  product: Pick<ProductSummary, "image" | "categoryId" | "nameHe">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = CATEGORY_STYLE[product.categoryId] ?? { color: "#166534", icon: "🛒" };
  if (product.image && !failed) {
    return (
      <img
        src={product.image.url}
        alt={product.nameHe}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-contain ${className}`}
      />
    );
  }
  return (
    <div
      aria-label={`${product.nameHe}, אין תמונה זמינה`}
      className={`flex flex-col items-center justify-center overflow-hidden rounded-lg text-center ${className}`}
      style={{ background: `linear-gradient(160deg, ${style.color}1f, ${style.color}0a)` }}
    >
      <span aria-hidden className="text-3xl">
        {style.icon}
      </span>
      <span className="mt-1 line-clamp-2 px-1 text-[0.65rem] font-semibold leading-tight" style={{ color: style.color }}>
        {product.nameHe}
      </span>
    </div>
  );
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const { openProduct, addToCart, cart } = useApp();
  const inCart = cart.find((c) => c.productId === product.id)?.quantity ?? 0;
  const size = formatSize(product.sizeAmount, product.sizeUnit, product.soldByWeight);
  return (
    <article className="card flex flex-col p-3 transition-shadow hover:shadow-lg">
      <button onClick={() => openProduct(product.id)} className="flex flex-1 flex-col text-right" aria-label={`פרטים והשוואה: ${product.nameHe}`}>
        <div className="relative">
          <ProductThumb product={product} className="h-32 w-full" />
          {product.hasPromo && (
            <span className="absolute right-0 top-0 rounded-md bg-deal-500 px-2 py-0.5 text-xs font-bold text-white">מבצע</span>
          )}
          {product.priceDropped && (
            <span className="absolute left-0 top-0 rounded-md bg-forest-700 px-2 py-0.5 text-xs font-bold text-white">↓ ירד</span>
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{product.nameHe}</h3>
        <p className="mt-0.5 truncate text-xs text-mist-500">{[product.brand, size].filter(Boolean).join(" · ")}</p>
        <div className="mt-auto pt-2">
          {product.cheapest ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <Price value={product.cheapest.price} className={`text-lg ${product.cheapest.viaPromo ? "text-deal-600" : "text-forest-800"}`} />
                {product.soldByWeight && <span className="text-xs text-mist-500">לק&quot;ג</span>}
              </div>
              <p className="text-xs text-mist-500">
                הזול ב{product.cheapest.chainName}
                {product.cheapest.minQty > 1 ? `, בקניית ${product.cheapest.minQty}` : ""}
              </p>
              <p className="mt-1 text-[0.7rem] text-mist-500">
                {product.chainsWithPrice} מתוך {product.chainsTotal} רשתות
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-mist-500">לא נמצא מחיר זמין</p>
          )}
        </div>
      </button>
      <button
        onClick={() => addToCart(product.id)}
        className={`btn mt-2 w-full py-1.5 text-sm ${inCart ? "btn-soft" : "btn-ghost"}`}
        aria-label={`הוספה לעגלה: ${product.nameHe}`}
      >
        {inCart ? `בעגלה (${inCart}) · עוד אחד` : "הוספה לעגלה"}
      </button>
    </article>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <h2 className="text-lg font-bold">{title}</h2>
      {children && <div className="mt-2 text-mist-500">{children}</div>}
    </div>
  );
}
