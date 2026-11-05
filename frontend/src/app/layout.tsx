import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata: Metadata = {
  title: "SuperSave | סופר וירטואלי והשוואת מחירים בבאר שבע",
  description: "מסתובבים בסופר תלת-ממדי ומשווים מחירים אמיתיים משבע רשתות בבאר שבע, ישירות מהקבצים הרשמיים של הרשתות.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b3d21" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="mt-10 border-t border-mist-200 bg-white text-sm text-mist-500">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5">
              <p>המחירים נלקחים מהקבצים שהרשתות מפרסמות לפי חוק שקיפות המחירים. המחיר בקופה הוא הקובע.</p>
              <div className="flex gap-4">
                <Link className="underline" href="/status">
                  אמינות הנתונים
                </Link>
                <Link className="underline" href="/admin">
                  ניהול
                </Link>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
