import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
const COOKIE = "supersave_cart";

async function readCart(id: string | undefined) {
  if (!id) return null;
  return prisma.shoppingCart.findUnique({ where: { id }, include: { items: true } });
}

const shape = (cart: Awaited<ReturnType<typeof readCart>>) =>
  (cart?.items ?? []).map((i) => ({ productId: i.productId, quantity: Number(i.quantity) }));

export async function GET() {
  const jar = await cookies();
  return NextResponse.json({ items: shape(await readCart(jar.get(COOKIE)?.value)) });
}

/** Sets the quantity of one product. Quantity 0 removes it. */
export async function POST(request: Request) {
  const body = (await request.json()) as { productId?: string; quantity?: number };
  const quantity = Number(body.quantity);
  if (!body.productId || !Number.isFinite(quantity) || quantity < 0 || quantity > 999) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const product = await prisma.product.findUnique({ where: { id: body.productId } });
  if (!product) return NextResponse.json({ error: "unknown product" }, { status: 404 });

  const jar = await cookies();
  const existing = await readCart(jar.get(COOKIE)?.value);
  const cart = existing ?? (await prisma.shoppingCart.create({ data: {}, include: { items: true } }));
  if (quantity === 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId: body.productId } });
  } else {
    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: body.productId } },
      create: { cartId: cart.id, productId: body.productId, quantity },
      update: { quantity },
    });
  }
  const response = NextResponse.json({ items: shape(await readCart(cart.id)) });
  response.cookies.set(COOKIE, cart.id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90, path: "/" });
  return response;
}
