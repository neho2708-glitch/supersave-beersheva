"use client";

import type { BasketResult, CartResult } from "@backend/cart";
import { formatPrice } from "@backend/pricing";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers";
import { EmptyState, Price, ProductThumb } from "@/components/ui";
import type { ProductSummary } from "@/lib/types";

type Mode = "single" | "split" | "limited";
type Result = CartResult & { chainCount: number; staleItems: string[] };

function BasketDetails({ basket, title, note }: { basket: BasketResult; title: string; note?: string }) {
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <Price value={basket.total} className="text-3xl text-forest-800" />
      </div>
      <p className="text-sm text-mist-700">
        {basket.storeCount === 1 ? "ביקור בסניף אחד" : `ביקור ב-${basket.storeCount} סניפים`}
        {note ? ` · ${note}` : ""}
      </p>
      {basket.missing.length > 0 && (
        <p className="mt-2 rounded-lg bg-warn-100 px-3 py-2 text-sm font-medium text-warn-700">
          הסכום אינו כולל {basket.missing.length} מוצרים שלא נמצא להם מחיר: {basket.missing.map((m) => m.name).join(", ")}
        </p>
      )}
      <div className="mt-3 space-y-3">
        {basket.stores.map((store) => (
          <div key={store.branchId} className="rounded-xl bg-mist-50 p-3">
            <div className="flex justify-between gap-2 font-semibold">
              <span>
                {store.chainName} <span className="font-normal text-mist-700">· {store.branchName}</span>
              </span>
              <Price value={store.subtotal} />
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {basket.lines
                .filter((l) => l.branchId === store.branchId)
                .map((l) => (
                  <li key={l.productId} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      {l.name} × {l.quantity}
                      {l.promoDescription && <span className="mr-1 rounded bg-deal-100 px-1 text-xs font-semibold text-deal-600">מבצע: {l.promoDescription}</span>}
                      {l.unitsToPromo !== null && <span className="mr-1 text-xs text-deal-600">עוד {l.unitsToPromo} למבצע</span>}
                    </span>
                    <span className="tabular shrink-0">{formatPrice(l.total)}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CartPage() {
  const { cart, setQuantity, branchParam, openProduct } = useApp();
  const [products, setProducts] = useState<Map<string, ProductSummary>>(new Map());
  const [mode, setMode] = useState<Mode>("single");
  const [maxStores, setMaxStores] = useState(2);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch(`/api/products?limit=400&branches=${branchParam}`)
      .then((r) => r.json())
      .then((d) => setProducts(new Map(d.items.map((p: ProductSummary) => [p.id, p]))))
      .catch(() => undefined);
  }, [branchParam]);

  const payload = useMemo(() => JSON.stringify({ items: cart, maxStores, branches: branchParam }), [cart, maxStores, branchParam]);
  useEffect(() => {
    if (cart.length === 0) {
      setResult(null);
      return;
    }
    let cancelled = false;
    fetch("/api/cart/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: payload })
      .then((r) => r.json())
      .then((d) => !cancelled && setResult(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [payload, cart.length]);

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState title="העגלה ריקה">
          <p>הוסיפו מוצרים מהסופר הווירטואלי או מההשוואה, ונחשב איפה הכי משתלם לקנות.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/store" className="btn btn-primary">
              לסופר הווירטואלי
            </Link>
            <Link href="/compare" className="btn btn-ghost">
              להשוואת מחירים
            </Link>
          </div>
        </EmptyState>
      </div>
    );
  }

  const split = result?.optimalSplit;
  const single = result?.bestSingle;
  const limited = result?.limitedSplit;

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">העגלה החכמה</h1>
        {result && (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { id: "single" as Mode, title: "קנייה ברשת אחת", value: single?.total, sub: single ? `${single.chainName}, ${single.stores[0]?.branchName ?? ""}` : "" },
              { id: "split" as Mode, title: "פיצול לפי מחיר", value: split?.total, sub: split ? `${split.storeCount} סניפים` : "" },
              { id: "limited" as Mode, title: `פיצול עד ${maxStores} סניפים`, value: limited?.total, sub: limited ? `${limited.storeCount} סניפים` : "" },
            ].map((card) => (
              <button
                key={card.id}
                onClick={() => setMode(card.id)}
                aria-pressed={mode === card.id}
                className={`card p-4 text-right transition ${mode === card.id ? "ring-2 ring-forest-600" : "hover:bg-mist-50"}`}
              >
                <p className="text-sm font-semibold text-mist-700">{card.title}</p>
                <Price value={card.value} className="mt-1 text-2xl text-forest-800" />
                <p className="mt-0.5 truncate text-xs text-mist-500">{card.sub}</p>
              </button>
            ))}
          </div>
        )}
        {mode === "limited" && (
          <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="font-semibold">כמה סניפים מוכנים לבקר?</span>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} aria-pressed={maxStores === n} onClick={() => setMaxStores(n)} className={`btn h-9 w-9 p-0 ${maxStores === n ? "btn-primary" : "btn-ghost"}`}>
                {n}
              </button>
            ))}
          </div>
        )}
        {result && (result.splitSaving !== null || result.savingVersusMostExpensive !== null) && (
          <div className="card flex flex-wrap gap-x-6 gap-y-2 bg-leaf-50 p-4 text-sm">
            {result.savingVersusMostExpensive !== null && (
              <p>
                חיסכון מול הרשת היקרה ביותר: <Price value={result.savingVersusMostExpensive} className="text-lg text-forest-800" />
              </p>
            )}
            {result.splitSaving !== null && result.splitSaving > 0 && (
              <p>
                פיצול חוסך עוד: <Price value={result.splitSaving} className="text-lg text-deal-600" />
              </p>
            )}
          </div>
        )}
        {result && !result.comparable && (
          <p className="rounded-lg bg-warn-100 px-3 py-2 text-sm text-warn-700">
            פחות משתי רשתות מכסות את כל הסל, ולכן אי אפשר להציג השוואת חיסכון מדויקת בין סלים מלאים.
          </p>
        )}
        {result && result.staleItems.length > 0 && (
          <p className="rounded-lg bg-warn-100 px-3 py-2 text-sm text-warn-700">מחירים לא עדכניים לא נכללו בחישוב עבור {result.staleItems.length} מוצרים.</p>
        )}
        {mode === "single" && single && <BasketDetails basket={single} title={`הכי משתלם ברשת אחת: ${single.chainName}`} />}
        {mode === "split" && split && <BasketDetails basket={split} title="הסל הזול ביותר בפיצול" />}
        {mode === "limited" && limited && <BasketDetails basket={limited} title={`הסל הזול ביותר עד ${maxStores} סניפים`} />}

        {result && (
          <section className="card p-4">
            <h2 className="font-bold">מחיר הסל בכל רשת</h2>
            <ul className="mt-2 divide-y divide-mist-100">
              {result.perChain.map((c, index) => (
                <li key={c.chainId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">
                    {c.chainName}
                    {index === 0 && <span className="mr-2 rounded bg-forest-700 px-1.5 py-0.5 text-xs font-bold text-white">הכי משתלם</span>}
                    <span className="mr-2 text-xs text-mist-500">{c.stores[0]?.branchName}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {c.missing.length > 0 && <span className="rounded bg-warn-100 px-1.5 py-0.5 text-xs font-medium text-warn-700">חסרים {c.missing.length} מוצרים</span>}
                    {c.lines.length > 0 ? <Price value={c.total} /> : <span className="text-mist-500">לא נמצא מחיר זמין</span>}
                  </span>
                </li>
              ))}
            </ul>
            {result.perChain.length < result.chainCount && (
              <p className="mt-2 text-xs text-mist-500">רשתות שאינן ברשימה: אין להן סניף בבחירת הסניפים שלכם.</p>
            )}
          </section>
        )}
      </div>

      <aside className="card h-fit p-4 lg:sticky lg:top-20">
        <h2 className="font-bold">המוצרים בעגלה ({cart.length})</h2>
        <ul className="mt-3 divide-y divide-mist-100">
          {[...cart]
            .sort((a, b) => a.productId.localeCompare(b.productId))
            .map((entry) => {
              const product = products.get(entry.productId);
              return (
                <li key={entry.productId} className="flex items-center gap-3 py-2">
                  <button onClick={() => openProduct(entry.productId)} aria-label="פרטי מוצר" className="shrink-0">
                    {product && <ProductThumb product={product} className="h-12 w-12" />}
                  </button>
                  <span className="min-w-0 flex-1 text-sm font-medium">{product?.nameHe ?? "…"}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button aria-label="עוד אחד" className="btn btn-soft h-7 w-7 p-0" onClick={() => setQuantity(entry.productId, entry.quantity + 1)}>
                      +
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{entry.quantity}</span>
                    <button aria-label="אחד פחות" className="btn btn-ghost h-7 w-7 p-0" onClick={() => setQuantity(entry.productId, entry.quantity - 1)}>
                      −
                    </button>
                  </div>
                </li>
              );
            })}
        </ul>
      </aside>
    </div>
  );
}
