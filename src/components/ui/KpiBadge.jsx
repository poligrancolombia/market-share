import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

// micro-badge de porcentaje (+8.8%) -- verde/rojo semántico para crecimiento,
// no se fuerza a los colores de marca porque aquí el color SÍ tiene que
// comunicar signo (sería confuso pintar una caída en cian).
export function TrendBadge({ value, size = "sm" }) {
  if (value == null || Number.isNaN(value)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        <Minus size={11} /> s/d
      </span>
    );
  }
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const cls = up ? "bg-emerald-50 text-emerald-600 ring-emerald-100" : "bg-rose-50 text-rose-600 ring-rose-100";
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full ring-1 font-semibold ${cls} ${pad}`}>
      <Icon size={size === "sm" ? 12 : 14} strokeWidth={2.5} />
      {up ? "+" : ""}
      {(value * 100).toFixed(1)}%
    </span>
  );
}

export function KpiTile({ label, value, delta, icon: Icon, accent = false }) {
  return (
    <div
      className={`flex-1 min-w-[160px] rounded-xl border p-4 transition-colors ${
        accent ? "border-brand-cyan-200 bg-brand-cyan-50/60" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {Icon && <Icon size={14} className="text-slate-400" />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-brand-navy-900">{value}</span>
      </div>
      {delta !== undefined && (
        <div className="mt-1.5">
          <TrendBadge value={delta} />
        </div>
      )}
    </div>
  );
}
