export function Card({ title, subtitle, icon: Icon, action, className = "", children }) {
  return (
    <div
      className={`group rounded-2xl bg-white shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-navy-900 to-brand-navy-700 text-white shadow-[0_4px_10px_-2px_rgb(15_56_90_/_0.35)] transition-transform duration-300 group-hover:scale-105">
                <Icon size={16} strokeWidth={2.25} />
              </span>
            )}
            <div>
              {title && <h3 className="text-[14.5px] font-bold tracking-tight text-brand-navy-900">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-5 pt-4">{children}</div>
    </div>
  );
}
