import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductView } from "@/components/product-view";
import { productDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await productDetail(decodeURIComponent(id), null);
  if (!detail) notFound();
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/compare" className="text-sm font-semibold text-forest-700">
        → חזרה להשוואת מחירים
      </Link>
      <div className="card mt-3 p-5">
        <ProductView detail={detail} />
      </div>
    </div>
  );
}
