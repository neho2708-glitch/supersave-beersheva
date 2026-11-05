"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers";
import { formatDateTime } from "@/components/ui";
import type { Branch, Chain } from "@/lib/types";

type BranchRow = Branch & { priceCount: number; lastPublished: string | null };

export default function BranchesPage() {
  const { selectedBranches, setSelectedBranches } = useApp();
  const [data, setData] = useState<{ chains: Chain[]; branches: BranchRow[] } | null>(null);

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const selected = new Set(selectedBranches);
  const everything = selected.size === 0;
  const toggle = (id: number) => {
    const next = new Set(everything ? data?.branches.map((b) => b.id) : selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const all = data?.branches.length ?? 0;
    setSelectedBranches(next.size === all ? [] : [...next]);
  };
  const toggleChain = (chainId: string, on: boolean) => {
    const ids = data?.branches.filter((b) => b.chainId === chainId).map((b) => b.id) ?? [];
    const next = new Set(everything ? data?.branches.map((b) => b.id) : selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    const all = data?.branches.length ?? 0;
    setSelectedBranches(next.size === all ? [] : [...next]);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold">בחירת סניפים</h1>
      <p className="mt-1 text-sm text-mist-700">
        המחירים משתנים בין סניפים של אותה רשת. בחרו את הסניפים שנוחים לכם, וההשוואה והעגלה יתחשבו רק בהם. הרשימה נלקחת מקובץ הסניפים הרשמי של כל רשת.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-ghost" onClick={() => setSelectedBranches([])}>
          כל הסניפים בבאר שבע
        </button>
        <span className="text-sm text-mist-500" role="status">
          {everything ? "נבחרו כל הסניפים" : `נבחרו ${selected.size} סניפים`}
        </span>
      </div>
      {!data && <p className="mt-6 text-mist-500">טוען…</p>}
      <div className="mt-4 space-y-4">
        {data?.chains.map((chain) => {
          const own = data.branches.filter((b) => b.chainId === chain.id);
          return (
            <section key={chain.id} className="card overflow-hidden">
              <header className="flex items-center justify-between bg-leaf-50 px-4 py-3">
                <h2 className="font-bold">
                  {chain.nameHe} <span className="text-sm font-normal text-mist-500">({own.length} סניפים)</span>
                </h2>
                {own.length > 1 && (
                  <div className="flex gap-2 text-sm">
                    <button className="font-semibold text-forest-700" onClick={() => toggleChain(chain.id, true)}>
                      כולם
                    </button>
                    <button className="font-semibold text-mist-500" onClick={() => toggleChain(chain.id, false)}>
                      אף אחד
                    </button>
                  </div>
                )}
              </header>
              {own.length === 0 && <p className="p-4 text-sm text-mist-500">לא נמצא סניף פעיל בבאר שבע בקובץ הסניפים של הרשת.</p>}
              <ul className="divide-y divide-mist-100">
                {own.map((b) => (
                  <li key={b.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-mist-50">
                      <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={everything || selected.has(b.id)} onChange={() => toggle(b.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{b.nameHe}</span>
                        <span className="block text-sm text-mist-500">
                          {[b.address, b.subchainName && !/^\d+$/.test(b.subchainName) ? b.subchainName : null].filter(Boolean).join(" · ") || "כתובת לא פורסמה בקובץ הרשת"}
                        </span>
                      </span>
                      <span className="hidden text-left text-xs text-mist-500 sm:block">
                        {b.priceCount} מחירים
                        <br />
                        {b.lastPublished ? formatDateTime(b.lastPublished) : "אין נתונים"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
