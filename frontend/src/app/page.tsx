import Link from "next/link";
import { resolveStatus } from "@backend/pricing";
import { getCategories, getSnapshot, prisma } from "@/lib/db";
import { summaries } from "@/lib/queries";
import { DealsStrip } from "./deals-strip";

export const dynamic = "force-dynamic";

const MODES = [
  { href: "/store", title: "סיור תלת-ממדי", icon: "🛒", text: "הולכים בין המדפים כמו במשחק, מכוונים למוצר ורואים איפה הוא הכי זול.", cta: "כניסה לסופר", primary: true },
  { href: "/shelves", title: "מדפים דו-ממדיים", icon: "🗂️", text: "אותן מחלקות ואותם מוצרים בתצוגה מהירה. מתאים גם לטלפון ישן.", cta: "למדפים", primary: false },
  { href: "/compare", title: "השוואת מחירים", icon: "⚖️", text: "חיפוש לפי שם או ברקוד, סינון לפי מותג, רשת ומחלקה.", cta: "להשוואה", primary: false },
];

export default async function Home() {
  const [snapshot, categories, lastCheck] = await Promise.all([
    getSnapshot(),
    getCategories(),
    prisma.connectorCheck.findMany({ orderBy: { checkedAt: "desc" }, take: 7, distinct: ["chainId"] }),
  ]);
  const items = summaries(snapshot, null);
  const now = new Date();
  const allRows = [...snapshot.prices.values()].flat();
  const verifiedRows = allRows.filter((r) => resolveStatus(r.status, r.publishedAt, now, snapshot.staleAfterHours) === "VERIFIED" && !r.suspect);
  const priced = items.filter((p) => p.cheapest).length;
  const chainsLive = new Set(verifiedRows.map((r) => r.chainId)).size;
  const latest = allRows.map((r) => r.publishedAt).sort().at(-1);
  const verifiedChecks = lastCheck.filter((c) => c.status === "VERIFIED").length;

  const stats = [
    { value: chainsLive, label: `רשתות עם מחירים מאומתים, מתוך ${snapshot.chains.length}` },
    { value: snapshot.branches.length, label: "סניפים פעילים בבאר שבע" },
    { value: priced, label: `מוצרים עם מחיר מאומת, מתוך ${items.length}` },
    { value: verifiedRows.length.toLocaleString("he-IL"), label: "מחירים מאומתים ממקור רשמי" },
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-bl from-forest-950 via-forest-900 to-forest-700 text-white">
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="inline-block rounded-full bg-leaf-500/20 px-3 py-1 text-sm font-semibold text-leaf-200">באר שבע · {snapshot.chains.length} רשתות</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight lg:text-5xl">
              הולכים בסופר אחד.
              <br />
              <span className="text-leaf-400">משלמים הכי זול משבעה.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-leaf-100">
              סופרמרקט תלת-ממדי שבו כל מוצר מראה לכם את המחיר האמיתי בכל רשת בעיר, ישירות מהקבצים הרשמיים שהרשתות מחויבות לפרסם.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/store" className="btn bg-deal-500 px-6 py-3 text-lg text-white hover:bg-deal-600">
                כניסה לסופר הווירטואלי
              </Link>
              <Link href="/compare" className="btn bg-white/10 px-6 py-3 text-lg text-white hover:bg-white/20">
                חיפוש מוצר
              </Link>
            </div>
            {latest && (
              <p className="mt-4 text-sm text-leaf-200">
                קובץ המחירים החדש ביותר פורסם ב-
                {new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(new Date(latest))}
              </p>
            )}
          </div>
          <dl className="grid grid-cols-2 content-center gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl bg-white/10 p-5 backdrop-blur">
                <dd className="text-4xl font-extrabold">{s.value}</dd>
                <dt className="mt-1 text-sm text-leaf-100">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <h2 className="text-2xl font-bold">איך נוח לכם לקנות היום?</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {MODES.map((mode) => (
            <Link key={mode.href} href={mode.href} className={`card block p-5 transition-transform hover:-translate-y-0.5 ${mode.primary ? "ring-2 ring-leaf-500" : ""}`}>
              <span aria-hidden className="text-3xl">
                {mode.icon}
              </span>
              <h3 className="mt-2 text-lg font-bold">{mode.title}</h3>
              <p className="mt-1 text-sm text-mist-700">{mode.text}</p>
              <span className="mt-3 inline-block font-semibold text-forest-700">{mode.cta} ←</span>
            </Link>
          ))}
        </div>
      </section>

      <DealsStrip />

      <section className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="text-2xl font-bold">מחלקות</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((c) => (
            <Link key={c.id} href={`/compare?category=${c.id}`} className="card flex items-center gap-3 p-4 hover:bg-leaf-50">
              <span aria-hidden className="text-2xl">
                {c.icon}
              </span>
              <span className="text-sm font-semibold">{c.nameHe}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="card flex flex-wrap items-center justify-between gap-4 bg-leaf-50 p-6">
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold">מה אפשר לדעת על המחירים שאתם רואים?</h2>
            <p className="mt-1 text-sm text-mist-700">
              ליד כל מחיר מוצג המקור ותאריך הקובץ. מה שלא נמצא בקובץ רשמי מסומן &quot;לא נמצא מחיר זמין&quot;, ולעולם לא מושלם בניחוש. בבדיקה האוטומטית האחרונה {verifiedChecks} מתוך {snapshot.chains.length} המקורות אומתו.
            </p>
          </div>
          <Link href="/status" className="btn btn-primary">
            מצב המקורות
          </Link>
        </div>
      </section>
    </>
  );
}
