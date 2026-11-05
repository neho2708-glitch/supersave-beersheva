"use client";

import { formatPrice } from "@backend/pricing";
import { useMemo, useState } from "react";
import type { ProductDetail } from "@/lib/types";

// Validated categorical order (dataviz reference palette). Each chain keeps its slot in every chart.
const CHAIN_SERIES: Record<string, string> = {
  shufersal: "#2a78d6",
  "rami-levy": "#eb6834",
  carrefour: "#1baf7a",
  yochananof: "#eda100",
  victory: "#e87ba4",
  "osher-ad": "#008300",
  "mahsanei-hashuk": "#6250d6",
};

const WIDTH = 560;
const HEIGHT = 200;
const PAD = { top: 12, right: 48, bottom: 26, left: 12 };

/** Price history: one line per chain, the lowest Be'er Sheva shelf price on each day. */
export function PriceChart({ history }: { history: ProductDetail["history"] }) {
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const days = useMemo(() => [...new Set(history.flatMap((s) => s.points.map((p) => p.at)))].sort(), [history]);

  if (days.length < 2) {
    return (
      <p className="rounded-lg bg-mist-50 p-3 text-sm text-mist-500">
        היסטוריית המחירים נאספת החל מ-{days[0] ? new Date(days[0]).toLocaleDateString("he-IL") : "הייבוא הראשון"}. הגרף יוצג כשיהיו נתונים משני ימים לפחות.
      </p>
    );
  }

  const prices = history.flatMap((s) => s.points.map((p) => p.price));
  const low = Math.min(...prices) * 0.97;
  const high = Math.max(...prices) * 1.03;
  const x = (day: string) => PAD.left + (days.indexOf(day) / (days.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (price: number) => PAD.top + (1 - (price - low) / (high - low || 1)) * (HEIGHT - PAD.top - PAD.bottom);
  const ticks = [low, (low + high) / 2, high];

  return (
    <div dir="ltr">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="גרף היסטוריית מחירים לפי רשת"
        onMouseLeave={() => setHoverDay(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const position = ((event.clientX - rect.left) / rect.width) * WIDTH;
          const nearest = days.reduce((best, d) => (Math.abs(x(d) - position) < Math.abs(x(best) - position) ? d : best), days[0]);
          setHoverDay(nearest);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-mist-200)" strokeWidth={1} />
            <text x={WIDTH - PAD.right + 6} y={y(t) + 4} fontSize={11} fill="var(--color-mist-500)">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={HEIGHT - 8} fontSize={11} fill="var(--color-mist-500)">
          {new Date(days[0]).toLocaleDateString("he-IL")}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 8} fontSize={11} textAnchor="end" fill="var(--color-mist-500)">
          {new Date(days[days.length - 1]).toLocaleDateString("he-IL")}
        </text>
        {hoverDay && <line x1={x(hoverDay)} x2={x(hoverDay)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--color-mist-300)" />}
        {history.map((series) => {
          const color = CHAIN_SERIES[series.chainId] ?? "#6b736c";
          const path = series.points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
          return (
            <g key={series.chainId}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {series.points.map((p) =>
                p.at === hoverDay || series.points.length === 1 ? (
                  <circle key={p.at} cx={x(p.at)} cy={y(p.price)} r={4} fill={color} stroke="white" strokeWidth={2} />
                ) : null,
              )}
            </g>
          );
        })}
      </svg>
      <div dir="rtl" className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-mist-700">
        {history.map((series) => {
          const point = hoverDay ? series.points.find((p) => p.at === hoverDay) : series.points.at(-1);
          return (
            <span key={series.chainId} className="inline-flex items-center gap-1">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: CHAIN_SERIES[series.chainId] }} />
              {series.chainName}
              {point && <span className="tabular font-semibold">{formatPrice(point.price)}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
