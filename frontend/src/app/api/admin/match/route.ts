import { NextResponse } from "next/server";
import { clearSnapshot, prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** An administrator resolves a review item. The next import uses this decision for prices. */
export async function POST(request: Request) {
  const body = (await request.json()) as { id?: number; decision?: "approve" | "reject" };
  if (!body.id || !["approve", "reject"].includes(body.decision ?? "")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const item = await prisma.chainItem.findUnique({ where: { id: body.id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (body.decision === "approve") {
    if (!item.candidateProductId) return NextResponse.json({ error: "no candidate" }, { status: 400 });
    await prisma.chainItem.update({
      where: { id: item.id },
      data: { productId: item.candidateProductId, matchStatus: "MATCHED", matchMethod: "MANUAL" },
    });
  } else {
    await prisma.chainItem.update({ where: { id: item.id }, data: { productId: null, matchStatus: "REJECTED" } });
  }
  clearSnapshot();
  return NextResponse.json({ ok: true });
}
