import { ChevronDown } from "lucide-react";

export function Select({ label, value, onChange, options, blankLabel, className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="peer w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-[13.5px] text-brand-navy-900 shadow-sm outline-none transition-colors hover:border-slate-300 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan-100"
        >
          {blankLabel !== undefined && <option value="">{blankLabel}</option>}
          {options.map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>
              {o.label ?? o}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 peer-focus:text-brand-cyan" />
      </span>
    </label>
  );
}
