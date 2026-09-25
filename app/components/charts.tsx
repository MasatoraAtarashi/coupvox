import type { TrendPoint } from "../../server/lib/dashboard";

/**
 * 結果画面のヒーロー。円の大きさ＝それぞれが感じている応答性、
 * 離れ具合＝ふたりの見え方のずれ。折れ線ではなくこれが主役。
 */
export function VennHero({
  me,
  partner,
  gap,
}: {
  me: number | null;
  partner: number | null;
  gap: number | null;
}) {
  const radius = (value: number | null) => (value === null ? 46 : 42 + (value / 100) * 30);
  const sep = gap === null ? 34 : 24 + (gap / 50) * 46;
  const meX = 160 - sep;
  const partnerX = 160 + sep;
  const pct = (x: number) => ((x / 320) * 100).toFixed(2);

  return (
    <div className="relative mt-1.5">
      <svg viewBox="0 0 320 180" className="block h-auto w-full">
        <circle cx={meX} cy="92" r={radius(me)} fill="#F2846B" fillOpacity="0.82" />
        <circle
          cx={partnerX}
          cy="92"
          r={radius(partner)}
          fill="#8C93DB"
          fillOpacity="0.72"
          style={{ mixBlendMode: "multiply" }}
        />
      </svg>
      {/* 数字は SVG の text ではなく HTML で重ねる（フォント指定と可読性のため） */}
      <div
        className="tnum pointer-events-none absolute text-[38px] font-bold text-[var(--color-ink)]"
        style={{ top: "51.1%", left: `${pct(meX)}%`, transform: "translate(-50%,-50%)" }}
      >
        {me === null ? "—" : me}
      </div>
      <div
        className="tnum pointer-events-none absolute text-[38px] font-bold text-[var(--color-ink)]"
        style={{ top: "51.1%", left: `${pct(partnerX)}%`, transform: "translate(-50%,-50%)" }}
      >
        {partner === null ? "—" : partner}
      </div>
    </div>
  );
}

const X = (index: number, total: number) => 22 + index * (360 / Math.max(total - 1, 1));
const Y = (value: number) => 120 - (value / 100) * 98;

function polyline(values: (number | null)[]): string {
  return values
    .map((value, index) =>
      value === null ? null : `${X(index, values.length).toFixed(1)},${Y(value).toFixed(1)}`,
    )
    .filter((point): point is string => point !== null)
    .join(" ");
}

function lastIndex(values: (number | null)[]): number {
  let found = -1;
  values.forEach((value, index) => {
    if (value !== null) found = index;
  });
  return found;
}

/** 8 週の推移。日付ラベルは SVG の外に HTML で置く */
export function TrendChart({ points, metric }: { points: TrendPoint[]; metric: "R" | "I" }) {
  const meSeries = points.map((point) =>
    metric === "R" ? point.meResponsive : point.meInsensitive,
  );
  const partnerSeries = points.map((point) =>
    metric === "R" ? point.partnerResponsive : point.partnerInsensitive,
  );
  const meLast = lastIndex(meSeries);
  const partnerLast = lastIndex(partnerSeries);

  return (
    <>
      <svg viewBox="0 0 400 150" className="mt-2.5 block h-[155px] w-full">
        <line
          x1="18"
          y1="22"
          x2="386"
          y2="22"
          stroke="#F4ECE3"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="18"
          y1="71"
          x2="386"
          y2="71"
          stroke="#F4ECE3"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="18"
          y1="120"
          x2="386"
          y2="120"
          stroke="#EDE3D8"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <polyline
          points={polyline(partnerSeries)}
          fill="none"
          stroke="#8C93DB"
          strokeWidth="3.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={polyline(meSeries)}
          fill="none"
          stroke="#F2846B"
          strokeWidth="3.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {partnerLast >= 0 && (
          <>
            <circle
              cx={X(partnerLast, partnerSeries.length)}
              cy={Y(partnerSeries[partnerLast] as number)}
              r="7"
              fill="#FFFFFF"
            />
            <circle
              cx={X(partnerLast, partnerSeries.length)}
              cy={Y(partnerSeries[partnerLast] as number)}
              r="5"
              fill="#8C93DB"
            />
          </>
        )}
        {meLast >= 0 && (
          <>
            <circle
              cx={X(meLast, meSeries.length)}
              cy={Y(meSeries[meLast] as number)}
              r="7"
              fill="#FFFFFF"
            />
            <circle
              cx={X(meLast, meSeries.length)}
              cy={Y(meSeries[meLast] as number)}
              r="5"
              fill="#F2846B"
            />
          </>
        )}
      </svg>
      <div className="flex justify-between px-3.5 pt-0.5 pb-1">
        {points
          .filter((_, index) => index % 2 === 0)
          .map((point, index) => (
            <span
              key={`${point.label}-${index}`}
              className="text-[11px] text-[var(--color-ink-sub)]"
            >
              {point.label}
            </span>
          ))}
      </div>
    </>
  );
}

export function Legend() {
  return (
    <div className="flex justify-center gap-[22px]">
      <div className="flex items-center gap-[7px] text-[12px] text-[var(--color-ink-muted)]">
        <span className="block size-2.5 rounded-full bg-[var(--color-coral)]" />
        あなたが感じた
      </div>
      <div className="flex items-center gap-[7px] text-[12px] text-[var(--color-ink-muted)]">
        <span className="block size-2.5 rounded-full bg-[var(--color-peri)]" />
        相手が感じた
      </div>
    </div>
  );
}
