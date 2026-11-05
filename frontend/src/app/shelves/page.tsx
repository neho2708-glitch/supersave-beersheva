"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers";
import { ProductCard } from "@/components/ui";
import type { Category, ProductSummary } from "@/lib/types";

/** The fast 2D mode: same departments and data as the 3D store, with no WebGL. */
export default function ShelvesPage() {
  const { branchParam } = useApp();
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [active, setActive] = useState<string>("produce");

  useEffect(() => {
    fetch(`/api/products?limit=400&sort=name&branches=${branchParam}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items);
        setCategories(d.categories);
      })
      .catch(() => undefined);
  }, [branchParam]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">מדפים דו-ממדיים</h1>
        <Link href="/store" className="btn btn-ghost">
          מעבר לסיור תלת-ממדי
        </Link>
      </div>
      <div className="sticky top-14 z-20 -mx-4 mt-4 overflow-x-auto bg-mist-50 px-4 py-2">
        <div className="flex gap-2" role="tablist" aria-label="מחלקות">
          {categories.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={active === c.id}
              onClick={() => setActive(c.id)}
              className={`btn shrink-0 py-2 text-sm ${active === c.id ? "btn-primary" : "btn-ghost"}`}
            >
              <span aria-hidden>{c.icon}</span> {c.nameHe}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {items
          .filter((p) => p.categoryId === active)
          .map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
      </div>
    </div>
  );
}
