"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ProductDetail } from "@/lib/types";
import { ProductView } from "./product-view";
import { useApp } from "./providers";

/** The product window. Opens from any page, including inside the virtual store. */
export function ProductPanel() {
  const { openProductId, closeProduct, branchParam } = useApp();
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!openProductId) return;
    let cancelled = false;
    setDetail(null);
    setFailed(false);
    fetch(`/api/products/${encodeURIComponent(openProductId)}?branches=${branchParam}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [openProductId, branchParam]);

  useEffect(() => {
    if (!openProductId) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeProduct();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openProductId, closeProduct]);

  return (
    <AnimatePresence>
      {openProductId && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/50 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeProduct}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="פרטי מוצר"
            className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={closeProduct}
              aria-label="סגירה"
              className="btn btn-ghost absolute left-3 top-3 z-10 h-9 w-9 p-0 text-lg"
            >
              ×
            </button>
            {failed && <p className="p-8 text-center text-bad-700">לא הצלחנו לטעון את פרטי המוצר. נסו שוב.</p>}
            {!failed && !detail && <p className="p-12 text-center text-mist-500">טוען מחירים…</p>}
            {detail && <ProductView detail={detail} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
