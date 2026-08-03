export function Card({ title, subtitle, icon: Icon, action, className = "", children }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-card-hover)] ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cyan-50 text-brand-cyan ring-1 ring-brand-cyan-100">
                <Icon size={16} strokeWidth={2.25} />
              </span>
            )}
            <div>
              {title && <h3 className="text-[13.5px] font-semibold tracking-tight text-brand-navy-900">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-5 pt-4">{children}</div>
    </div>
  );
}
