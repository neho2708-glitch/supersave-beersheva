"use client";

import { formatPrice } from "@backend/pricing";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminActions({ chains }: { chains: { id: string; name: string }[] }) {
  const [chain, setChain] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (body: object, label: string) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      setMessage(data.started ? `${label} התחיל ברקע. רעננו בעוד כמה דקות.` : data.error);
    } catch {
      setMessage("ההפעלה נכשלה.");
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="field w-auto" aria-label="רשת לייבוא" value={chain} onChange={(e) => setChain(e.target.value)}>
        <option value="">כל הרשתות</option>
        {chains.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button disabled={busy} className="btn btn-primary" onClick={() => run({ chain }, "הייבוא")}>
        הפעלת ייבוא ידני
      </button>
      <button disabled={busy} className="btn btn-ghost" onClick={() => run({ action: "verify" }, "האימות")}>
        הרצת אימות Connectors
      </button>
      {message && (
        <span role="status" className="text-sm text-forest-700">
          {message}
        </span>
      )}
    </div>
  );
}

interface ReviewItem {
  id: number;
  chain: string;
  name: string;
  code: string;
  candidate: string;
  score: number;
  reason: string;
  price: number | null;
}

export function ReviewQueue({ items, total }: { items: ReviewItem[]; total: number }) {
  const router = useRouter();
  const [resolved, setResolved] = useState<Set<number>>(new Set());

  const decide = async (id: number, decision: "approve" | "reject") => {
    const response = await fetch("/api/admin/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision }) });
    if (response.ok) {
      setResolved(new Set(resolved).add(id));
      router.refresh();
    }
  };

  return (
    <section className="card overflow-x-auto p-4">
      <h2 className="font-bold">מוצרים שלא זוהו בוודאות ({total})</h2>
      <p className="text-sm text-mist-500">פריט לא מקבל מחיר באתר עד שמאשרים אותו. האישור נכנס לתוקף בייבוא הבא.</p>
      <table className="mt-2 w-full min-w-[820px] text-sm">
        <thead className="text-right text-xs text-mist-700">
          <tr>
            {["רשת", "שם ברשת", "קוד", "מחיר", "מוצר מועמד בקטלוג", "ציון", "סיבה", "החלטה"].map((h) => (
              <th key={h} scope="col" className="px-2 py-1 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-mist-100">
          {items
            .filter((item) => !resolved.has(item.id))
            .map((item) => (
              <tr key={item.id}>
                <td className="px-2 py-1.5">{item.chain}</td>
                <td className="px-2 py-1.5 font-medium">{item.name}</td>
                <td className="px-2 py-1.5 text-xs" dir="ltr">
                  {item.code}
                </td>
                <td className="px-2 py-1.5">
                  <span className="tabular">{formatPrice(item.price)}</span>
                </td>
                <td className="px-2 py-1.5">{item.candidate}</td>
                <td className="px-2 py-1.5">{Math.round(item.score)}</td>
                <td className="px-2 py-1.5 text-xs text-mist-700">{item.reason}</td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <button className="btn btn-soft px-2 py-1 text-xs" onClick={() => decide(item.id, "approve")}>
                    אישור
                  </button>{" "}
                  <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => decide(item.id, "reject")}>
                    דחייה
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}
