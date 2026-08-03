import { fmt } from "../../lib/format";

// tooltip redondeado con blur, reemplaza el tooltip por defecto de Recharts
// en todos los gráficos -- look consistente en toda la herramienta.
export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-xl border border-slate-200/70 bg-white/85 p-3 shadow-xl shadow-brand-navy-900/10 backdrop-blur-md">
      {label != null && (
        <div className="mb-1.5 text-xs font-semibold text-slate-500">{labelFormatter ? labelFormatter(label) : label}</div>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-[13px]">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums text-brand-navy-900">
              {formatter ? formatter(p.value, p.name, p) : fmt(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
