import { ChevronDown } from "lucide-react";

export function Select({ label, value, onChange, options, blankLabel, className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="peer w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50/80 py-1.5 pl-3 pr-7 text-[13px] font-medium text-brand-navy-900 shadow-[0_1px_2px_0_rgb(15_56_90_/_0.04)] outline-none transition-all hover:border-slate-300 hover:bg-white hover:shadow-[0_2px_6px_-1px_rgb(15_56_90_/_0.08)] focus:border-brand-cyan focus:bg-white focus:ring-[3px] focus:ring-brand-cyan-100"
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
