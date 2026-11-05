import { NextResponse } from "next/server";
import { parseBranchIds } from "@/lib/db";
import { productDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await productDetail(id, parseBranchIds(new URL(request.url).searchParams.get("branches")));
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}
