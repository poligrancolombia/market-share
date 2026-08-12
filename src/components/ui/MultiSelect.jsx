import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

// mismo look de píldora que Select, pero permite marcar varios valores a la
// vez (antes cada filtro global solo aceptaba uno). Vacío = "Todos" -- ver
// sqlIn/sqlInNum en FiltersContext, que interpretan value=[] como "sin
// filtrar" y 1+ valores como IN (...), es decir OR entre ellos.
export function MultiSelect({ label, value, onChange, options, blankLabel = "Todos", className = "" }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const boxRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const opts = useMemo(() => options.map((o) => (typeof o === "object" && o !== null ? o : { value: o, label: String(o) })), [options]);
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? opts.filter((o) => o.label.toLowerCase().includes(t)) : opts;
  }, [opts, term]);

  function toggle(v) {
    const key = String(v);
    onChange(value.some((x) => String(x) === key) ? value.filter((x) => String(x) !== key) : [...value, v]);
  }

  const display =
    value.length === 0
      ? blankLabel
      : value.length === 1
        ? opts.find((o) => String(o.value) === String(value[0]))?.label ?? String(value[0])
        : `${value.length} seleccionados`;

  return (
    <div className={`relative flex flex-col gap-1.5 ${className}`} ref={boxRef}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] font-medium outline-none transition-all hover:border-slate-300 ${
          value.length ? "border-brand-cyan-200 bg-brand-cyan-50/70 text-brand-navy-900" : "border-slate-200 bg-slate-50/80 text-brand-navy-900"
        }`}
      >
        <span className="truncate">{display}</span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full z-20 mt-1 w-full min-w-[210px] max-w-[300px] rounded-xl border border-slate-200 bg-white shadow-xl">
          {opts.length > 8 && (
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-2">
              <Search size={12} className="shrink-0 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar…"
                className="w-full border-none bg-transparent text-[12.5px] text-brand-navy-900 outline-none placeholder:text-slate-400"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto scroll-thin py-1">
            {!filtered.length && <div className="px-3 py-2.5 text-[12.5px] text-slate-400">Sin coincidencias</div>}
            {filtered.map((o) => {
              const checked = value.some((v) => String(v) === String(o.value));
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-brand-cyan-50"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked ? "border-brand-cyan bg-brand-cyan" : "border-slate-300"
                    }`}
                  >
                    {checked && <Check size={11} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className={`truncate text-[13px] ${checked ? "font-medium text-brand-navy-900" : "text-slate-600"}`}>{o.label}</span>
                </button>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="border-t border-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50 hover:text-rose-500"
              >
                <X size={11} /> Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
