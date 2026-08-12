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
  anio: [],
  semestre: [],
  nivelAcademico: [],
  sector: [],
  nivelFormacion: [],
  metodologia: [],
  departamento: [],
  municipio: [],
};

// -- constructores de WHERE, puros (reciben el objeto de filtros, no leen contexto) --
// cada filtro ahora es una LISTA de valores seleccionados (antes uno solo) --
// vacía = "Todos"/sin filtrar, 1+ valores = OR entre ellos (col IN (...)).
export function sqlIn(col, values) {
  return values?.length ? ` AND ${col} IN (${values.map((v) => `'${esc(v)}'`).join(",")})` : "";
}
export function sqlInNum(col, values) {
  return values?.length ? ` AND ${col} IN (${values.join(",")})` : "";
}
export function whereCommon(s) {
  let w = `metrica = '${s.metrica}'`;
  w += sqlInNum("semestre", s.semestre);
  for (const { key, col } of TEXT_FILTERS) w += sqlIn(col, s[key]);
  return w;
}
export function whereBase(s) {
  return `${whereCommon(s)}${sqlInNum("anio", s.anio)}`;
}
export function whereExcluding(s, excludeKey) {
  let w = `metrica = '${s.metrica}'`;
  if (excludeKey !== "anio") w += sqlInNum("anio", s.anio);
  if (excludeKey !== "semestre") w += sqlInNum("semestre", s.semestre);
  for (const { key, col } of TEXT_FILTERS) {
    if (key !== excludeKey) w += sqlIn(col, s[key]);
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

      // el updater de setFilters debe ser puro (React en StrictMode lo llama
      // 2 veces para detectar justo esto: si mutara initialized.current aquí
      // dentro, la 2a llamada vería la ref ya en true y descartaría el
      // resultado bueno de la 1a -- por eso se decide y se marca ANTES de
      // entrar al updater, no dentro).
      const shouldDefaultAnio = next.anio.length > 0 && !initialized.current;
      initialized.current = true;

      // si alguna de las seleccionadas quedó fuera del nuevo conjunto válido,
      // se descarta solo esa (las demás siguen filtrando) -- año, si queda en
      // cero, cae al más reciente disponible (arranque inicial también).
      setFilters((f) => {
        const patched = { ...f };
        let changed = false;
        if (f.anio.length) {
          const valid = f.anio.filter((a) => next.anio.some((n) => String(n) === String(a)));
          if (valid.length !== f.anio.length) {
            patched.anio = valid.length ? valid : next.anio.length ? [String(next.anio[next.anio.length - 1])] : [];
            changed = true;
          }
        } else if (shouldDefaultAnio) {
          patched.anio = [String(next.anio[next.anio.length - 1])];
          changed = true;
        }
        for (const { key } of TEXT_FILTERS) {
          if (f[key].length) {
            const valid = f[key].filter((v) => next[key].some((n) => String(n) === String(v)));
            if (valid.length !== f[key].length) {
              patched[key] = valid;
              changed = true;
            }
          }
        }
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
