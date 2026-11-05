import { prisma } from "@/lib/db";
import { ConnectorTable, getConnectorHealth } from "@/components/connector-health";

export const dynamic = "force-dynamic";
export const metadata = { title: "אמינות הנתונים | SuperSave" };

const LEGEND = [
  { code: "VERIFIED", text: "החיבור נבדק בפועל: הקובץ הורד, פוענח, אומת במבנה ונשלף ממנו מוצר עם מחיר." },
  { code: "STALE", text: "הנתונים קיימים אך לא עודכנו בתדירות שהוגדרה. לא מוצגים כמחיר עדכני." },
  { code: "FAILED", text: "החיבור נכשל, או שהנתונים לא ניתנים לעיבוד." },
  { code: "UNAVAILABLE", text: "המקור לא נגיש כעת." },
  { code: "DEMO", text: "נתון להמחשה בלבד. אין נתוני DEMO במערכת הזו כרגע." },
];

export default async function StatusPage() {
  const [health, demoCount] = await Promise.all([
    getConnectorHealth(),
    prisma.productPrice.count({ where: { verificationStatus: "DEMO" } }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold">על אילו נתונים אפשר לסמוך?</h1>
      <p className="mt-2 max-w-3xl text-mist-700">
        חוק קידום התחרות בענף המזון מחייב רשתות גדולות לפרסם קובצי מחירים ומבצעים לכל סניף. SuperSave מוריד את הקבצים האלה ישירות ושומר לכל מחיר את שם הקובץ, מועד הפרסום ומועד האיסוף. המחיר הקובע הוא המחיר בקופה.
      </p>
      <p className="mt-2 text-sm font-semibold text-forest-800">
        {demoCount === 0 ? "כל המחירים באתר מגיעים ממקורות רשמיים. אין באתר מחירי DEMO." : `${demoCount} מחירים מסומנים DEMO.`}
      </p>
      <div className="mt-5">
        <ConnectorTable rows={health} />
      </div>
      <section className="card mt-5 p-4">
        <h2 className="font-bold">מקרא סטטוסים</h2>
        <dl className="mt-2 space-y-1 text-sm">
          {LEGEND.map((l) => (
            <div key={l.code} className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold" dir="ltr">
                {l.code}
              </dt>
              <dd className="text-mist-700">{l.text}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="card mt-5 p-4 text-sm text-mist-700">
        <h2 className="font-bold text-ink">תמונות מוצרים</h2>
        <p className="mt-1">תמונות אמיתיות נלקחות ממיזמי Open Food Facts ו-Open Beauty Facts ברישיון CC BY-SA, עם ייחוס בחלון המוצר. למוצר ללא תמונה ברישיון פתוח מוצגת תמונת מילוי.</p>
      </section>
    </div>
  );
}
