"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useApp } from "./providers";

const NAV = [
  { href: "/store", label: "הסופר הווירטואלי" },
  { href: "/compare", label: "השוואת מחירים" },
  { href: "/promotions", label: "מבצעים" },
  { href: "/branches", label: "בחירת סניפים" },
  { href: "/status", label: "אמינות הנתונים" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { cartCount, selectedBranches } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-forest-900 text-white shadow-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-leaf-500 text-forest-950">
            ₪
          </span>
          SuperSave
          <span className="hidden text-xs font-medium text-leaf-200 sm:inline">באר שבע</span>
        </Link>
        <nav className="mr-4 hidden items-center gap-1 lg:flex" aria-label="ניווט ראשי">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-forest-700 ${
                pathname === item.href ? "bg-forest-700" : ""
              }`}
            >
              {item.label}
              {item.href === "/branches" && selectedBranches.length > 0 ? ` (${selectedBranches.length})` : ""}
            </Link>
          ))}
        </nav>
        <div className="mr-auto flex items-center gap-2">
          <Link href="/cart" className="relative flex h-10 items-center gap-2 rounded-lg bg-forest-700 px-3 text-sm font-semibold hover:bg-forest-600">
            <span aria-hidden>🛒</span>
            <span>עגלה</span>
            {cartCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-deal-500 px-1 text-xs font-bold">{cartCount}</span>
            )}
          </Link>
          <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-700 lg:hidden" aria-label="תפריט" aria-expanded={open} onClick={() => setOpen(!open)}>
            ☰
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-forest-700 px-4 py-2 lg:hidden" aria-label="ניווט ראשי">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-forest-700">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
