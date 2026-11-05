"use client";

import { formatPrice, formatSize, usablePromos } from "@backend/pricing";
import type { ChainPrice, ProductDetail } from "@/lib/types";
import { PriceChart } from "./price-chart";
import { useApp } from "./providers";
import { formatDateTime, Price, ProductThumb, TrustBadge } from "./ui";

function ChainRow({ line, isWeighted }: { line: ChainPrice; isWeighted: boolean }) {
  const row = line.row;
  if (!row) {
    return (
      <li className="flex items-center justify-between rounded-xl bg-mist-50 px-3 py-3 text-sm text-mist-500">
        <span className="font-semibold">{line.chain.nameHe}</span>
        <span>לא נמצא מחיר זמין</span>
      </li>
    );
  }
  const others = row.promos.filter((p) => !usablePromos([p]).length);
  return (
    <li className={`rounded-xl px-3 py-3 ${line.isCheapest ? "bg-leaf-100 ring-2 ring-forest-600" : "bg-mist-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {line.chain.nameHe}
            {line.isCheapest && <span className="mr-2 rounded-md bg-forest-700 px-2 py-0.5 text-xs font-bold text-white">הזול ביותר</span>}
          </p>
          <p className="text-xs text-mist-700">
            {line.branch?.nameHe}
            {line.branch?.address ? `, ${line.branch.address}` : ""}
            {line.branchCount > 1 ? ` · הזול מבין ${line.branchCount} סניפים` : ""}
          </p>
        </div>
        <div className="text-left">
          {line.promo ? (
            <>
              <Price value={line.promo.promoUnitPrice} className="text-xl text-deal-600" />
              <div className="text-xs text-mist-500 line-through">
                <span className="tabular">{formatPrice(row.regular)}</span>
              </div>
            </>
          ) : (
            <Price value={row.regular} className="text-xl text-forest-900" />
          )}
          {row.unitPrice !== null && !isWeighted && (
            <p className="text-xs text-mist-500">
              <span className="tabular">{formatPrice(row.unitPrice)}</span> ל-{row.unitLabel}
            </p>
          )}
          {isWeighted && <p className="text-xs text-mist-500">לק&quot;ג</p>}
        </div>
      </div>
      {line.promo && (
        <p className="mt-2 rounded-md bg-deal-100 px-2 py-1 text-xs font-semibold text-deal-600">
          מבצע: {line.promo.description}
          {line.promo.minQty > 1 ? ` (מחיר ליחידה בקניית ${line.promo.minQty})` : ""}
          {line.promo.endsAt ? ` · עד ${new Date(line.promo.endsAt).toLocaleDateString("he-IL")}` : ""}
        </p>
      )}
      {others.slice(0, 2).map((p) => (
        <p key={p.id} className="mt-1 text-xs text-mist-500">
          הטבה נוספת, לא מחושבת במחיר: {p.description}
          {p.requiresClub ? " (למועדון בלבד)" : p.notComputableBecause ? ` (${p.notComputableBecause})` : ""}
        </p>
      ))}
      {row.suspect && <p className="mt-1 text-xs font-semibold text-bad-700">מחיר חריג, דורש בדיקה: {row.suspectReason}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mist-500">
        <TrustBadge state={line.state} compact />
        <span>עודכן: {formatDateTime(row.publishedAt)}</span>
        <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="underline" title={row.fileName}>
          מקור: {row.sourceName}
        </a>
      </div>
    </li>
  );
}

export function ProductView({ detail }: { detail: ProductDetail }) {
  const { product, chains, history, category } = detail;
  const { cart, setQuantity } = useApp();
  const quantity = cart.find((c) => c.productId === product.id)?.quantity ?? 0;
  const size = formatSize(product.sizeAmount, product.sizeUnit, product.soldByWeight);
  const unpriced = chains.filter((c) => !c.row).length;

  return (
    <div className="grid gap-5 md:grid-cols-[260px_1fr]">
      <div>
        <ProductThumb product={product} className="mx-auto h-56 w-full" />
        <h2 className="mt-3 text-xl font-bold leading-snug">{product.nameHe}</h2>
        <dl className="mt-2 space-y-1 text-sm text-mist-700">
          {product.brand && (
            <div className="flex justify-between gap-2">
              <dt className="text-mist-500">מותג</dt>
              <dd className="font-medium">{product.brand}</dd>
            </div>
          )}
          {size && (
            <div className="flex justify-between gap-2">
              <dt className="text-mist-500">גודל</dt>
              <dd className="font-medium">{size}</dd>
            </div>
          )}
          {category && (
            <div className="flex justify-between gap-2">
              <dt className="text-mist-500">מחלקה</dt>
              <dd className="font-medium">{category.nameHe}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-mist-500">ברקוד</dt>
            <dd className="tabular font-medium">{product.barcode ?? "ללא ברקוד אחיד (נמכר במשקל)"}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-2">
          {quantity > 0 ? (
            <div className="flex w-full items-center justify-between rounded-xl bg-leaf-100 p-1">
              <button aria-label="עוד אחד" className="btn btn-primary h-9 w-9 p-0" onClick={() => setQuantity(product.id, quantity + 1)}>
                +
              </button>
              <span className="font-bold">{quantity} בעגלה</span>
              <button aria-label="אחד פחות" className="btn btn-ghost h-9 w-9 p-0" onClick={() => setQuantity(product.id, quantity - 1)}>
                −
              </button>
            </div>
          ) : (
            <button className="btn btn-primary w-full" onClick={() => setQuantity(product.id, 1)}>
              הוספה לעגלה
            </button>
          )}
        </div>
        {product.image && (
          <p className="mt-3 text-[0.7rem] leading-snug text-mist-500">
            תמונה:{" "}
            <a className="underline" href={product.image.sourceUrl ?? "#"} target="_blank" rel="noreferrer">
              {product.image.attribution}
            </a>
            , {product.image.license}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="mb-2 font-bold">מחיר בכל אחת מהרשתות בבאר שבע</h3>
        <ul className="space-y-2">
          {chains.map((line) => (
            <ChainRow key={line.chain.id} line={line} isWeighted={product.soldByWeight} />
          ))}
        </ul>
        {unpriced > 0 && (
          <p className="mt-2 text-xs text-mist-500">
            ב-{unpriced} רשתות לא נמצא מחיר למוצר הזה בקובצי הסניפים בבאר שבע. המוצר לא בהכרח חסר בחנות.
          </p>
        )}
        <h3 className="mb-2 mt-5 font-bold">היסטוריית מחירים</h3>
        <PriceChart history={history} />
      </div>
    </div>
  );
}
