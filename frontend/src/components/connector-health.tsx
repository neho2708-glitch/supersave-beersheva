import { prisma } from "@/lib/db";

const when = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(d) : "טרם בוצע";

const STATUS_STYLE: Record<string, string> = {
  VERIFIED: "bg-leaf-100 text-forest-800",
  STALE: "bg-warn-100 text-warn-700",
  FAILED: "bg-bad-100 text-bad-700",
  UNAVAILABLE: "bg-bad-100 text-bad-700",
  DEMO: "bg-demo-100 text-demo-700",
  "NOT CHECKED": "bg-mist-100 text-mist-700",
};

export interface ConnectorRow {
  chainId: string;
  chainName: string;
  sourceName: string;
  sourceUrl: string;
  connectionType: string;
  fileFormat: string;
  status: string;
  lastAttempt: Date | null;
  lastSuccess: Date | null;
  products: number;
  validPrices: number;
  errors: number;
  latestFile: string | null;
  sample: { name: string; price: string; itemCode: string; branch: string } | null;
}

/** Read straight from recorded runs, so the page can only show what really happened. */
export async function getConnectorHealth(): Promise<ConnectorRow[]> {
  const chains = await prisma.supermarketChain.findMany({ orderBy: { sortOrder: "asc" }, include: { dataSources: true } });
  return Promise.all(
    chains.map(async (chain) => {
      const [check, attempt, success, products, valid, errors] = await Promise.all([
        prisma.connectorCheck.findFirst({ where: { chainId: chain.id }, orderBy: { checkedAt: "desc" } }),
        prisma.importJob.findFirst({ where: { chainId: chain.id }, orderBy: { startedAt: "desc" } }),
        prisma.importJob.findFirst({ where: { chainId: chain.id, status: { in: ["SUCCESS", "PARTIAL"] } }, orderBy: { finishedAt: "desc" } }),
        prisma.productPrice.findMany({ where: { chainId: chain.id, suspect: false }, distinct: ["productId"], select: { productId: true } }),
        prisma.productPrice.count({ where: { chainId: chain.id, suspect: false } }),
        prisma.importJob.aggregate({ where: { chainId: chain.id, startedAt: { gt: new Date(Date.now() - 7 * 86400_000) } }, _sum: { errorCount: true } }),
      ]);
      const source = chain.dataSources[0];
      const details = (check?.details ?? {}) as { sample?: ConnectorRow["sample"] };
      return {
        chainId: chain.id,
        chainName: chain.nameHe,
        sourceName: source?.name ?? "",
        sourceUrl: source?.url ?? "",
        connectionType: source?.connectionType ?? "",
        fileFormat: source?.fileFormat ?? "",
        status: check?.status ?? "NOT CHECKED",
        lastAttempt: check?.checkedAt ?? attempt?.startedAt ?? null,
        lastSuccess: success?.finishedAt ?? null,
        products: products.length,
        validPrices: valid,
        errors: (errors._sum.errorCount ?? 0) + (check?.errorCount ?? 0),
        latestFile: check?.latestFile ?? null,
        sample: details.sample ?? null,
      };
    }),
  );
}

export function ConnectorTable({ rows }: { rows: ConnectorRow[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <caption className="p-4 text-right font-bold">Connector Health &amp; Verification</caption>
        <thead className="bg-leaf-50 text-right text-xs text-mist-700">
          <tr>
            {["רשת", "סטטוס", "מקור", "סוג חיבור", "ניסיון אחרון", "ייבוא מוצלח אחרון", "מוצרים", "מחירים תקינים", "שגיאות", "הוכחה: מוצר אמיתי מהקובץ"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-mist-100">
          {rows.map((r) => (
            <tr key={r.chainId} className="align-top">
              <th scope="row" className="px-3 py-3 text-right font-semibold">
                {r.chainName}
              </th>
              <td className="px-3 py-3">
                <span dir="ltr" className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status] ?? ""}`}>
                  {r.status}
                </span>
              </td>
              <td className="px-3 py-3">
                <a className="underline" href={r.sourceUrl} target="_blank" rel="noreferrer">
                  {r.sourceName}
                </a>
              </td>
              <td className="px-3 py-3 text-xs text-mist-700" dir="ltr">
                {r.connectionType}
                <br />
                {r.fileFormat}
              </td>
              <td className="px-3 py-3 text-xs">{when(r.lastAttempt)}</td>
              <td className="px-3 py-3 text-xs">{when(r.lastSuccess)}</td>
              <td className="px-3 py-3 font-semibold">{r.products}</td>
              <td className="px-3 py-3 font-semibold">{r.validPrices.toLocaleString("he-IL")}</td>
              <td className="px-3 py-3">{r.errors}</td>
              <td className="px-3 py-3 text-xs">
                {r.sample ? (
                  <>
                    <span className="font-medium">{r.sample.name}</span>: ₪{r.sample.price}
                    <br />
                    <span className="text-mist-500">
                      {r.sample.branch} · <span dir="ltr">{r.sample.itemCode}</span>
                    </span>
                  </>
                ) : (
                  "אין"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
