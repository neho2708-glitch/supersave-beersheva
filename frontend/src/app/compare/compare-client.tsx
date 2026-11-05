"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers";
import { EmptyState, ProductCard } from "@/components/ui";
import type { Category, Chain, ProductSummary } from "@/lib/types";

interface Data {
  total: number;
  items: ProductSummary[];
  brands: string[];
  categories: Category[];
  chains: Chain[];
}

const PAGE = 48;

export function CompareClient() {
  const params = useSearchParams();
  const { branchParam } = useApp();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [debounced, setDebounced] = useState(search);
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [brand, setBrand] = useState("");
  const [chain, setChain] = useState("");
  const [promos, setPromos] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [sort, setSort] = useState("price-asc");
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const q = new URLSearchParams({ search: debounced, sort, limit: String(limit), branches: branchParam });
    if (category) q.set("category", category);
    if (brand) q.set("brand", brand);
    if (chain) q.set("chain", chain);
    if (promos) q.set("promos", "1");
    if (dropped) q.set("dropped", "1");
    let cancelled = false;
    fetch(`/api/products?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(false);
        }
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [debounced, category, brand, chain, promos, dropped, sort, limit, branchParam]);

  const clear = () => {
    setSearch("");
    setCategory("");
    setBrand("");
    setChain("");
    setPromos(false);
    setDropped(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold">השוואת מחירים</h1>
      <div className="card mt-4 space-y-3 p-4">
        <input
          className="field text-base"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="חיפוש לפי שם מוצר, מותג או ברקוד"
          aria-label="חיפוש מוצר"
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select className="field" aria-label="מחלקה" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">כל המחלקות</option>
            {data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameHe}
              </option>
            ))}
          </select>
          <select className="field" aria-label="רשת" value={chain} onChange={(e) => setChain(e.target.value)}>
            <option value="">כל הרשתות</option>
            {data?.chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameHe}
              </option>
            ))}
          </select>
          <select className="field" aria-label="מותג" value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">כל המותגים</option>
            {data?.brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select className="field" aria-label="מיון" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="price-asc">מהזול ליקר</option>
            <option value="price-desc">מהיקר לזול</option>
            <option value="name">לפי שם</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-deal-500" checked={promos} onChange={(e) => setPromos(e.target.checked)} />
            מבצעים בלבד
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-forest-700" checked={dropped} onChange={(e) => setDropped(e.target.checked)} />
            מוצרים שמחירם ירד
          </label>
          <span className="mr-auto text-mist-500" role="status">
            {data ? `${data.total} מוצרים` : "טוען…"}
          </span>
        </div>
      </div>

      {error && <p className="mt-4 text-bad-700">לא הצלחנו לטעון את המוצרים. נסו שוב.</p>}
      {data && data.total === 0 && (
        <div className="mt-4">
          <EmptyState title="לא מצאנו מוצרים">
            {dropped ? "ירידות מחיר מופיעות אחרי שני ייבואים לפחות שבהם המחיר השתנה. " : "נסו לשנות את החיפוש או את הסינון. "}
            <button className="font-semibold text-forest-700 underline" onClick={clear}>
              ניקוי הכול
            </button>
          </EmptyState>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {data?.items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {data && data.items.length < data.total && (
        <div className="mt-6 text-center">
          <button className="btn btn-ghost" onClick={() => setLimit(limit + PAGE)}>
            עוד מוצרים
          </button>
        </div>
      )}
    </div>
  );
}
