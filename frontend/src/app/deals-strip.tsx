"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers";
import { DealCard, type Deal } from "@/components/deal-card";

export function DealsStrip() {
  const { branchParam } = useApp();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  useEffect(() => {
    fetch(`/api/promotions?branches=${branchParam}`)
      .then((r) => r.json())
      .then((d) => setDeals(d.items.slice(0, 4)))
      .catch(() => setDeals([]));
  }, [branchParam]);
  if (!deals || deals.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-bold">המבצעים החזקים עכשיו</h2>
        <Link href="/promotions" className="font-semibold text-forest-700">
          כל המבצעים ←
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {deals.map((deal) => (
          <DealCard key={deal.key} deal={deal} />
        ))}
      </div>
    </section>
  );
}
