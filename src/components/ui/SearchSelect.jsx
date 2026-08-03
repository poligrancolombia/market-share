import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

// selector de UN solo valor con buscador -- a diferencia de ChipSelect (multi,
// con fetch remoto por tecla), aquí las opciones ya viven completas en
// memoria (ej. ~290 instituciones), así que el filtro es puro cliente, sin
// debounce ni consultas.
export function SearchSelect({ label, value, onChange, options, placeholder = "Buscar…", className = "" }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    const list = t ? options.filter((o) => o.toLowerCase().includes(t)) : options;
    return list.slice(0, 50);
  }, [term, options]);

  return (
    <div className={`relative flex flex-col gap-1.5 ${className}`} ref={boxRef}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <div
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm focus-within:border-brand-cyan focus-within:ring-2 focus-within:ring-brand-cyan-100"
        onClick={() => setOpen(true)}
      >
        <Search size={13} className="shrink-0 text-slate-400" />
        <input
          type="text"
          value={open ? term : value || ""}
          placeholder={placeholder}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setTerm("");
          }}
          className="min-w-[120px] flex-1 border-none bg-transparent py-0.5 text-[13.5px] text-brand-navy-900 outline-none placeholder:text-slate-400"
        />
        {value && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setTerm("");
            }}
            className="shrink-0 text-slate-400 hover:text-rose-500"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full z-20 mt-1 max-h-72 w-full min-w-[260px] overflow-y-auto scroll-thin rounded-xl border border-slate-200 bg-white shadow-xl">
          {!filtered.length ? (
            <div className="px-3 py-2.5 text-[12.5px] text-slate-400">Sin coincidencias</div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o);
                  setTerm("");
                  setOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-[13px] hover:bg-brand-cyan-50 ${
                  o === value ? "bg-brand-cyan-50/60 font-medium text-brand-cyan" : "text-brand-navy-900"
                }`}
              >
                {o}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
