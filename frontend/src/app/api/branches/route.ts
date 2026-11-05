import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getSnapshot();
  const counts = new Map<number, { count: number; latest: string }>();
  for (const rows of snapshot.prices.values()) {
    for (const r of rows) {
      const entry = counts.get(r.branchId) ?? { count: 0, latest: r.publishedAt };
      entry.count += 1;
      if (r.publishedAt > entry.latest) entry.latest = r.publishedAt;
      counts.set(r.branchId, entry);
    }
  }
  return NextResponse.json({
    chains: snapshot.chains,
    branches: snapshot.branches.map((b) => ({
      ...b,
      priceCount: counts.get(b.id)?.count ?? 0,
      lastPublished: counts.get(b.id)?.latest ?? null,
    })),
  });
}
