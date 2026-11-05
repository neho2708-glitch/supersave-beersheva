"use client";

import dynamic from "next/dynamic";

// three.js only loads on this page, and never on the server.
const VirtualStore = dynamic(() => import("@/components/store/virtual-store").then((m) => m.VirtualStore), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center bg-mist-100" role="status">
      <p className="rounded-xl bg-white px-6 py-4 font-semibold shadow">פותחים את הסופר…</p>
    </div>
  ),
});

export function StoreLoader() {
  return <VirtualStore />;
}
