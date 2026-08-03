import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

// selector tipo Excel (buscar + marcar varios): el texto que se escribe solo
// filtra las sugerencias; lo que realmente filtra los datos son los chips
// ya seleccionados.
export function ChipSelect({ label, placeholder, selected, onChange, fetchOptions }) {
  const [term, setTerm] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);
  // la consulta de Programa (y a veces la de Institución) es cara -- une
  // toda la tabla de hechos, no un catálogo pequeño. Si el usuario escribe
  // rápido en una caja, o en las dos a la vez, cada tecla puede encolar una
  // consulta más sin esperar a que la anterior termine, y eso es lo que
  // trababa la página (no ya el motor, sino la cantidad de trabajo
  // pendiente). fetchingRef fuerza "una a la vez, con lo último gana": si ya
  // hay una en curso, solo se recuerda el término más reciente y se
  // descartan los intermedios; al terminar la actual, se dispara ese único
  // pendiente.
  const fetchingRef = useRef(false);
  const pendingTermRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function refreshCandidates(nextTerm) {
    if (fetchingRef.current) {
      pendingTermRef.current = nextTerm;
      return;
    }
    fetchingRef.current = true;
    const requestId = ++requestIdRef.current;
    try {
      const opts = await fetchOptions(nextTerm);
      // si el usuario ya escribió algo más nuevo mientras esta consulta
      // corría, se descarta esta respuesta -- una consulta vieja y lenta no
      // debe pisar el resultado de una más reciente.
      if (requestId === requestIdRef.current) {
        setCandidates(opts.filter((o) => !selected.some((s) => s.key === o.key)));
      }
    } finally {
      fetchingRef.current = false;
      if (pendingTermRef.current !== null) {
        const next = pendingTermRef.current;
        pendingTermRef.current = null;
        refreshCandidates(next);
      }
    }
  }

  function handleInput(v) {
    setTerm(v);
    clearTimeout(debounceRef.current);
    // con 1 solo carácter, el ILIKE '%x%' casi no filtra nada y termina
    // escaneando prácticamente toda la tabla -- se espera a un mínimo de 2
    // para que la búsqueda sea barata.
    if (v.length === 1) return;
    debounceRef.current = setTimeout(() => refreshCandidates(v), 250);
  }

  function addChip(opt) {
    onChange([...selected, opt]);
    setTerm("");
    // sin llamar de nuevo a la base: un término vacío dispara la consulta
    // MÁS cara posible (GROUP BY / DISTINCT sin ningún ILIKE que filtre,
    // sobre toda la tabla) -- exactamente lo que había que evitar. Al
    // limpiar localmente, el usuario simplemente vuelve a escribir si quiere
    // seguir buscando.
    setCandidates((c) => c.filter((o) => o.key !== opt.key));
  }

  function removeChip(key) {
    onChange(selected.filter((s) => s.key !== key));
  }

  return (
    <div className="relative flex flex-col gap-1.5" ref={boxRef}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <div className="flex min-w-[220px] max-w-[360px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm focus-within:border-brand-cyan focus-within:ring-2 focus-within:ring-brand-cyan-100">
        {selected.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 rounded-full bg-brand-cyan-50 px-2.5 py-1 text-[12.5px] font-medium text-brand-navy-900 ring-1 ring-brand-cyan-100">
            {s.label}
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => removeChip(s.key)} className="text-brand-navy-700/60 hover:text-rose-500">
              <X size={11} strokeWidth={3} />
            </button>
          </span>
        ))}
        <div className="flex flex-1 items-center gap-1.5">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input
            type="text"
            value={term}
            placeholder={placeholder}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => {
              setOpen(true);
              // igual que al escribir: con la caja vacía no se dispara nada
              // contra la base (sería la consulta sin filtro, la más cara) --
              // solo se refresca si ya había algo escrito de antes.
              if (term.length >= 2) refreshCandidates(term);
            }}
            className="min-w-[80px] flex-1 border-none bg-transparent py-0.5 text-[13.5px] text-brand-navy-900 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {open && (
        <div className="absolute top-full z-20 mt-1 max-h-72 w-full min-w-[260px] overflow-y-auto scroll-thin rounded-xl border border-slate-200 bg-white shadow-xl">
          {candidates.length === 0 ? (
            <div className="px-3 py-2.5 text-[12.5px] text-slate-400">{term ? "Sin coincidencias" : "Escribe para buscar…"}</div>
          ) : (
            candidates.map((o) => (
              <button
                key={o.key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addChip(o)}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-brand-cyan-50"
              >
                <span className="text-[13px] text-brand-navy-900">{o.label}</span>
                {o.sub && <span className="text-[11px] text-slate-400">{o.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
