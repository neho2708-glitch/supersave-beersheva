import { NextResponse } from "next/server";
import { filterProducts, type ProductFilter } from "@/lib/compare";
import { getCategories, getSnapshot, parseBranchIds } from "@/lib/db";
import { summaries } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const snapshot = await getSnapshot();
  const all = summaries(snapshot, parseBranchIds(q.get("branches")));
  const filter: ProductFilter = {
    search: q.get("search") ?? undefined,
    category: q.get("category") ?? undefined,
    brand: q.get("brand") ?? undefined,
    chain: q.get("chain") ?? undefined,
    promosOnly: q.get("promos") === "1",
    droppedOnly: q.get("dropped") === "1",
    sort: (q.get("sort") as ProductFilter["sort"]) ?? "price-asc",
  };
  const filtered = filterProducts(all, snapshot.prices, filter);
  const limit = Math.min(Number(q.get("limit")) || 60, 400);
  const offset = Math.max(Number(q.get("offset")) || 0, 0);
  return NextResponse.json({
    total: filtered.length,
    items: filtered.slice(offset, offset + limit),
    brands: [...new Set(all.map((p) => p.brand).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string, "he")),
    categories: await getCategories(),
    chains: snapshot.chains,
  });
}
