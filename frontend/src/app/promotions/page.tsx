"use client";

import { useEffect, useState } from "react";
import { DealCard, type Deal } from "@/components/deal-card";
import { useApp } from "@/components/providers";
import { CATEGORY_STYLE, EmptyState } from "@/components/ui";
import type { Chain } from "@/lib/types";

const CATEGORIES: [string, string][] = [
  ["produce", "פירות וירקות"],
  ["dairy", "חלב וביצים"],
  ["meat", "בשר ודגים"],
  ["bread", "לחמים ומאפים"],
  ["drinks", "משקאות"],
  ["snacks", "חטיפים וממתקים"],
  ["cleaning", "ניקיון"],
  ["hygiene", "היגיינה"],
  ["dry", "יבשים ושימורים"],
  ["frozen", "קפואים"],
];

interface ClubOnly {
  key: string;
  productName: string;
  productId: string;
  chainName: string;
  description: string;
  note: string;
}

export default function PromotionsPage() {
  const { branchParam, openProduct } = useApp();
  const [chain, setChain] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<{ total: number; items: Deal[]; clubOnly: ClubOnly[]; chains: Chain[] } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ branches: branchParam });
    if (chain) q.set("chain", chain);
    if (category) q.set("category", category);
    fetch(`/api/promotions?${q}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [branchParam, chain, category]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold">מבצעים</h1>
      <p className="mt-1 text-sm text-mist-700">מבצעים פעילים מקובצי המבצעים הרשמיים, פתוחים לכל הלקוחות. כל כרטיס מציג את המקור ואת תאריך הקובץ.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <select className="field w-auto" aria-label="רשת" value={chain} onChange={(e) => setChain(e.target.value)}>
          <option value="">כל הרשתות</option>
          {data?.chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameHe}
            </option>
          ))}
        </select>
        <select className="field w-auto" aria-label="מחלקה" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">כל המחלקות</option>
          {CATEGORIES.map(([id, name]) => (
            <option key={id} value={id}>
              {CATEGORY_STYLE[id]?.icon} {name}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-mist-500" role="status">
          {data ? `${data.total} מבצעים` : "טוען…"}
        </span>
      </div>
      {data && data.items.length === 0 && (
        <div className="mt-4">
          <EmptyState title="אין כרגע מבצעים מאומתים בבחירה הזו" />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {data?.items.map((deal) => (
          <DealCard key={deal.key} deal={deal} />
        ))}
      </div>
      {data && data.clubOnly.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">מבצעים למועדון בלבד</h2>
          <p className="text-sm text-mist-500">מופיעים לידיעה בלבד ואינם נכללים בחישובי המחיר, כי הם דורשים חברות במועדון.</p>
          <ul className="card mt-3 divide-y divide-mist-100">
            {data.clubOnly.map((c) => (
              <li key={c.key}>
                <button onClick={() => openProduct(c.productId)} className="flex w-full flex-wrap justify-between gap-2 p-3 text-right text-sm hover:bg-mist-50">
                  <span className="font-medium">{c.productName}</span>
                  <span className="text-mist-700">
                    {c.chainName}: {c.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
