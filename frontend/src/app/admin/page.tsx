import { ConnectorTable, getConnectorHealth } from "@/components/connector-health";
import { getSnapshot, prisma } from "@/lib/db";
import { AdminActions, ReviewQueue } from "./admin-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "ניהול | SuperSave", robots: { index: false } };

const when = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Jerusalem" }).format(d) : "";

export default async function AdminPage() {
  const [health, jobs, review, snapshot, products] = await Promise.all([
    getConnectorHealth(),
    prisma.importJob.findMany({ orderBy: { startedAt: "desc" }, take: 21 }),
    prisma.chainItem.findMany({
      where: { matchStatus: "REVIEW" },
      orderBy: [{ matchScore: "desc" }, { chainId: "asc" }],
      take: 100,
    }),
    getSnapshot(),
    prisma.product.findMany({ where: { active: true }, select: { id: true, nameHe: true, categoryId: true } }),
  ]);
  const reviewTotal = await prisma.chainItem.count({ where: { matchStatus: "REVIEW" } });
  const names = new Map(products.map((p) => [p.id, p.nameHe]));
  const chainNames = new Map(snapshot.chains.map((c) => [c.id, c.nameHe]));

  const missing = snapshot.chains.map((c) => {
    const lacking = products.filter((p) => !(snapshot.prices.get(p.id) ?? []).some((r) => r.chainId === c.id));
    return { chain: c.nameHe, count: lacking.length, examples: lacking.slice(0, 6).map((p) => p.nameHe) };
  });
  const noPriceAnywhere = products.filter((p) => (snapshot.prices.get(p.id) ?? []).length === 0);
  const suspects = [...snapshot.prices.values()].flat().filter((r) => r.suspect);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">לוח ניהול</h1>
        <AdminActions chains={snapshot.chains.map((c) => ({ id: c.id, name: c.nameHe }))} />
      </div>

      <ConnectorTable rows={health} />

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "מוצרים בקטלוג", value: products.length },
          { label: "מוצרים ללא מחיר בשום רשת", value: noPriceAnywhere.length },
          { label: "מוצרים לבדיקה ידנית", value: reviewTotal },
          { label: "מחירים חריגים", value: suspects.length },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-3xl font-extrabold">{s.value}</p>
            <p className="text-sm text-mist-700">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="card p-4">
        <h2 className="font-bold">מחירים חסרים לפי רשת</h2>
        <ul className="mt-2 divide-y divide-mist-100 text-sm">
          {missing.map((m) => (
            <li key={m.chain} className="py-2">
              <span className="font-semibold">{m.chain}:</span> {m.count} מוצרים ללא מחיר
              {m.examples.length > 0 && <span className="text-mist-500"> ({m.examples.join(", ")}…)</span>}
            </li>
          ))}
        </ul>
        {noPriceAnywhere.length > 0 && <p className="mt-2 text-sm text-mist-700">ללא מחיר בכלל: {noPriceAnywhere.map((p) => p.nameHe).join(", ")}</p>}
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="font-bold">ייבואים אחרונים</h2>
        <table className="mt-2 w-full min-w-[820px] text-sm">
          <thead className="text-right text-xs text-mist-700">
            <tr>
              {["התחלה", "רשת", "מפעיל", "סטטוס", "סניפים", "קבצים", "רשומות", "מחירים", "שינויים", "מבצעים", "לבדיקה", "שגיאות"].map((h) => (
                <th key={h} scope="col" className="px-2 py-1 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist-100">
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="px-2 py-1.5 text-xs">{when(j.startedAt)}</td>
                <td className="px-2 py-1.5">{chainNames.get(j.chainId)}</td>
                <td className="px-2 py-1.5 text-xs">{j.trigger}</td>
                <td className="px-2 py-1.5 font-semibold" dir="ltr">
                  {j.status}
                </td>
                <td className="px-2 py-1.5">{j.branchesProcessed}</td>
                <td className="px-2 py-1.5">{j.filesDownloaded}</td>
                <td className="px-2 py-1.5">{j.itemsParsed.toLocaleString("he-IL")}</td>
                <td className="px-2 py-1.5">{j.pricesValid.toLocaleString("he-IL")}</td>
                <td className="px-2 py-1.5">{j.pricesChanged}</td>
                <td className="px-2 py-1.5">{j.promotionsLoaded}</td>
                <td className="px-2 py-1.5">{j.reviewItems}</td>
                <td className={`px-2 py-1.5 ${j.errorCount ? "font-semibold text-bad-700" : ""}`} title={j.errorCount ? JSON.stringify(j.errors).slice(0, 400) : ""}>
                  {j.errorCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ReviewQueue
        total={reviewTotal}
        items={review.map((r) => ({
          id: r.id,
          chain: chainNames.get(r.chainId) ?? r.chainId,
          name: r.name,
          code: r.itemCode,
          candidate: names.get(r.candidateProductId ?? "") ?? "",
          score: r.matchScore ?? 0,
          reason: r.matchReason ?? "",
          price: r.samplePrice ? Number(r.samplePrice) : null,
        }))}
      />
    </div>
  );
}
