// leyenda clicable para ocultar/mostrar series -- reemplaza el Legend por
// defecto de Recharts en gráficos con muchas series (Explorador, Mercado
// Competencia). El padre controla qué series están ocultas y se lo pasa a
// cada Bar/Line vía su prop `hide`.
export function InteractiveLegend({ items, hidden, onToggle }) {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2">
      {items.map((it) => {
        const isHidden = hidden.has(it.key);
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onToggle(it.key)}
            className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium transition-all hover:bg-slate-50 ${
              isHidden ? "opacity-40" : "opacity-100"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />
            <span className={isHidden ? "text-slate-400 line-through" : "text-slate-600"}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
