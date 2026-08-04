export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto scroll-thin rounded-xl bg-slate-200/50 p-1">
      {tabs.map((t) => {
        const isActive = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-all duration-200 ${
              isActive
                ? "bg-brand-navy-900 text-white shadow-[0_4px_10px_-2px_rgb(15_56_90_/_0.4)]"
                : "text-slate-500 hover:bg-white/70 hover:text-brand-navy-900"
            }`}
          >
            {Icon && <Icon size={15} strokeWidth={2.25} className={isActive ? "text-brand-cyan" : "text-slate-400 group-hover:text-brand-cyan"} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function RadioGroup({ options, value, onChange }) {
  return (
    <div className="inline-flex gap-0.5 rounded-full bg-white/70 p-0.5 ring-1 ring-inset ring-slate-200/70">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-full px-3 py-1 text-[12.5px] font-semibold transition-all ${
            value === o.value ? "bg-brand-navy-900 text-white shadow-[0_2px_6px_-1px_rgb(15_56_90_/_0.35)]" : "text-slate-500 hover:text-brand-navy-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
