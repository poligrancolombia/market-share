import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDuckDB } from "../lib/duckdb";
import { esc } from "../lib/format";

export const TEXT_FILTERS = [
  { key: "nivelAcademico", col: "nivel_academico", label: "Nivel académico", blankLabel: "Todos" },
  { key: "sector", col: "sector_ies", label: "Sector", blankLabel: "Todos" },
  { key: "nivelFormacion", col: "nivel_formacion", label: "Nivel de formación", blankLabel: "Todos" },
  { key: "metodologia", col: "metodologia", label: "Modalidad", blankLabel: "Todas" },
  { key: "departamento", col: "departamento_programa", label: "Departamento de oferta", blankLabel: "Todos" },
  { key: "municipio", col: "municipio_programa", label: "Municipio de oferta", blankLabel: "Todos" },
];

const DEFAULT_FILTERS = {
  metrica: "matriculados",
  anio: "",
  semestre: "",
  nivelAcademico: "",
  sector: "",
  nivelFormacion: "",
  metodologia: "",
  departamento: "",
  municipio: "",
};

// -- constructores de WHERE, puros (reciben el objeto de filtros, no leen contexto) --
export function whereCommon(s) {
  let w = `metrica = '${s.metrica}'`;
  if (s.semestre) w += ` AND semestre = ${s.semestre}`;
  for (const { key, col } of TEXT_FILTERS) {
    if (s[key]) w += ` AND ${col} = '${esc(s[key])}'`;
  }
  return w;
}
export function whereBase(s) {
  return s.anio ? `${whereCommon(s)} AND anio = ${s.anio}` : whereCommon(s);
}
export function whereExcluding(s, excludeKey) {
  let w = `metrica = '${s.metrica}'`;
  if (excludeKey !== "anio" && s.anio) w += ` AND anio = ${s.anio}`;
  if (excludeKey !== "semestre" && s.semestre) w += ` AND semestre = ${s.semestre}`;
  for (const { key, col } of TEXT_FILTERS) {
    if (key !== excludeKey && s[key]) w += ` AND ${col} = '${esc(s[key])}'`;
  }
  return w;
}

const FiltersContext = createContext(null);

export function FiltersProvider({ children }) {
  const { query, ready } = useDuckDB();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [options, setOptions] = useState({ anio: [] });
  const initialized = useRef(false);

  const setFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  // recalcula, para CADA filtro, sus opciones válidas dado el resto ya
  // seleccionado (slicers condicionales, como en una tabla dinámica de Excel).
  const refreshOptions = useCallback(
    async (current) => {
      const anios = await query(`SELECT DISTINCT anio FROM v_mercado WHERE ${whereExcluding(current, "anio")} ORDER BY anio`);
      const next = { anio: anios.map((r) => r.anio) };
      for (const { key, col } of TEXT_FILTERS) {
        const rows = await query(
          `SELECT DISTINCT ${col} AS v FROM v_mercado WHERE ${whereExcluding(current, key)} AND ${col} IS NOT NULL ORDER BY v`
        );
        next[key] = rows.map((r) => r.v);
      }
      setOptions(next);

      // si la selección actual quedó fuera del nuevo conjunto válido, se limpia
      // (vuelve a "Todos") -- excepto año, que cae al más reciente disponible.
      setFilters((f) => {
        const patched = { ...f };
        let changed = false;
        if (f.anio && !next.anio.some((a) => String(a) === String(f.anio))) {
          patched.anio = next.anio.length ? String(next.anio[next.anio.length - 1]) : "";
          changed = true;
        } else if (!f.anio && next.anio.length && !initialized.current) {
          patched.anio = String(next.anio[next.anio.length - 1]);
          changed = true;
        }
        for (const { key } of TEXT_FILTERS) {
          if (f[key] && !next[key].some((v) => String(v) === String(f[key]))) {
            patched[key] = "";
            changed = true;
          }
        }
        initialized.current = true;
        return changed ? patched : f;
      });
    },
    [query]
  );

  useEffect(() => {
    if (!ready) return;
    refreshOptions(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filters.metrica, filters.anio, filters.semestre, filters.nivelAcademico, filters.sector, filters.nivelFormacion, filters.metodologia, filters.departamento, filters.municipio]);

  const value = useMemo(() => ({ filters, setFilter, options }), [filters, setFilter, options]);

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters debe usarse dentro de <FiltersProvider>");
  return ctx;
}
