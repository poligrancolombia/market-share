export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto scroll-thin border-b border-slate-200">
      {tabs.map((t) => {
        const isActive = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`group relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
              isActive ? "text-brand-navy-900" : "text-slate-500 hover:text-brand-navy-700"
            }`}
          >
            {Icon && <Icon size={15} strokeWidth={2.25} className={isActive ? "text-brand-cyan" : "text-slate-400 group-hover:text-brand-cyan"} />}
            {t.label}
            <span
              className={`absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-brand-cyan transition-transform duration-300 ${
                isActive ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

export function RadioGroup({ options, value, onChange }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-all ${
            value === o.value ? "bg-brand-navy-900 text-white shadow-sm" : "text-slate-500 hover:text-brand-navy-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
