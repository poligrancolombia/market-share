import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronRight, ChevronDown, Table2 } from "lucide-react";
import { useDuckDB } from "../lib/duckdb";
import { useFilters, whereCommon } from "../state/FiltersContext";
import { esc, fmt, pct } from "../lib/format";
import { pivotByYear, buildYearSeries, buildTasaPromedio } from "../lib/pivot";
import { Card } from "../components/ui/Card";
import { RadioGroup } from "../components/ui/Tabs";
import { ChipSelect } from "../components/ui/ChipSelect";
import { Sparkline } from "../components/ui/Sparkline";
import { TrendBadge } from "../components/ui/KpiBadge";

// autocompletado de institución/programa: consulta SOLO las tablas de
// dimensión (dim_institucion ~290 filas, dim_programa ~18.000), nunca la
// vista v_mercado (une hecho_indicador, ~1M filas). Un ILIKE + GROUP BY
// sobre esa vista, repetido en cada tecla, fue lo que colgaba/tumbaba la
// pestaña -- aquí el candidato puede no reflejar el corte exacto de los
// filtros de métrica/nivel/modalidad (solo sector/departamento/municipio,
// que sí viven en las dimensiones), pero la tabla principal de abajo sigue
// aplicando todos los filtros correctamente sobre los datos reales.
async function fetchInstitucionOptions(query, filters, term) {
  const nameCond = term ? `institucion ILIKE '%${esc(term)}%'` : "TRUE";
  const sectorCond = filters.sector ? ` AND sector_ies = '${esc(filters.sector)}'` : "";
  const rows = await query(`SELECT DISTINCT institucion FROM dim_institucion WHERE ${nameCond}${sectorCond} ORDER BY institucion LIMIT 30`);
  return rows.map((r) => ({ key: r.institucion, label: r.institucion }));
}

// set (codigo_institucion‧codigo_snies_programa) de programas que SÍ
// registran matrículas (valor > 0) en al menos un año -- se consulta una
// sola vez contra hecho_indicador (nunca por tecla, ver nota de arriba) y se
// usa para filtrar en el cliente las sugerencias del buscador de Programa,
// así no aparecen programas "fantasma" sin matrícula real.
async function fetchActiveProgramKeys(query) {
  const rows = await query(`
    SELECT DISTINCT codigo_institucion, codigo_snies_programa
    FROM hecho_indicador WHERE valor > 0
  `);
  return new Set(rows.map((r) => `${r.codigo_institucion}‧${r.codigo_snies_programa}`));
}

async function fetchProgramaOptions(query, filters, selectedInst, term, activeProgKeys) {
  const nameCond = term
    ? `(p.programa_academico ILIKE '%${esc(term)}%' OR CAST(p.codigo_snies_programa AS VARCHAR) ILIKE '%${esc(term)}%')`
    : "TRUE";
  const instCond = selectedInst.length ? ` AND i.institucion IN (${selectedInst.map((o) => `'${esc(o.key)}'`).join(", ")})` : "";
  const sectorCond = filters.sector ? ` AND i.sector_ies = '${esc(filters.sector)}'` : "";
  const deptCond = filters.departamento ? ` AND p.departamento_programa = '${esc(filters.departamento)}'` : "";
  const munCond = filters.municipio ? ` AND p.municipio_programa = '${esc(filters.municipio)}'` : "";
  const rows = await query(`
    SELECT i.institucion, p.codigo_institucion, p.codigo_snies_programa, p.programa_academico
    FROM dim_programa p
    JOIN dim_institucion i ON p.codigo_institucion = i.codigo_institucion
    WHERE ${nameCond}${instCond}${sectorCond}${deptCond}${munCond}
    ORDER BY p.programa_academico LIMIT 200
  `);
  const withMatriculas = activeProgKeys
    ? rows.filter((r) => activeProgKeys.has(`${r.codigo_institucion}‧${r.codigo_snies_programa}`))
    : rows;
  return withMatriculas.slice(0, 40).map((r) => ({
    key: `${r.institucion}‧${r.codigo_snies_programa}`,
    label: `${r.programa_academico} (SNIES ${r.codigo_snies_programa})`,
    sub: r.institucion,
    institucion: r.institucion,
    codigo: r.codigo_snies_programa,
  }));
}

export function Historico() {
  const { query, isPoli } = useDuckDB();
  const { filters } = useFilters();
  const [groupBy, setGroupBy] = useState("institucion");
  const [topN, setTopN] = useState(30);
  const [selectedInst, setSelectedInst] = useState([]);
  const [selectedProg, setSelectedProg] = useState([]);
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState({}); // institucion -> array de sub-entries (o null mientras carga)
  const [activeProgKeys, setActiveProgKeys] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveProgramKeys(query).then((keys) => {
      if (!cancelled) setActiveProgKeys(keys);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let where = whereCommon(filters);
      if (selectedInst.length) where += ` AND institucion IN (${selectedInst.map((o) => `'${esc(o.key)}'`).join(", ")})`;
      const keyCols = groupBy === "institucion" ? ["institucion"] : ["institucion", "codigo_snies_programa", "programa_academico"];
      if (groupBy === "programa" && selectedProg.length) {
        const conds = selectedProg.map((o) => `(institucion = '${esc(o.institucion)}' AND codigo_snies_programa = ${o.codigo})`).join(" OR ");
        where += ` AND (${conds})`;
      }
      const r = await query(`
        SELECT ${keyCols.join(", ")}, anio, SUM(valor)::DOUBLE total
        FROM v_mercado WHERE ${where} GROUP BY ${keyCols.join(", ")}, anio
      `);
      if (!cancelled) {
        setRows(r);
        setExpanded({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters, groupBy, selectedInst, selectedProg]);

  const keyCols = groupBy === "institucion" ? ["institucion"] : ["institucion", "codigo_snies_programa", "programa_academico"];
  const byProgram = keyCols.includes("codigo_snies_programa");
  const exactSelection = selectedInst.length > 0 || (groupBy === "programa" && selectedProg.length > 0);

  const pivot = useMemo(() => pivotByYear(rows, keyCols), [rows, groupBy]);
  const { anios, lastYear, prevYear, entries: allEntries, subtotal, totalCount } = pivot;
  const clipped = !exactSelection && allEntries.length > topN;
  // ojo: selectedProg/selectedInst cambian sincrónicamente al elegir un chip
  // (dentro del mismo render), pero `rows` sigue siendo el conjunto viejo sin
  // filtrar hasta que la consulta async resuelve -- un `loading` seteado en
  // useEffect llega TARDE, después de que este render ya calculó `entries`
  // sin límite. Por eso el tope es un valor fijo, síncrono, que nunca
  // depende de que otro estado se haya puesto al día todavía: aunque
  // `exactSelection` ya sea true con datos viejos (potencialmente ~18.000
  // programas), nunca se renderizan más de este máximo -- de sobra para
  // cualquier selección real de chips, pero nunca catastrófico.
  const MAX_EXACT_ENTRIES = 300;
  const entries = exactSelection ? allEntries.slice(0, MAX_EXACT_ENTRIES) : allEntries.slice(0, topN);

  const toggleExpand = useCallback(
    async (inst) => {
      if (expanded[inst]) {
        setExpanded((e) => ({ ...e, [inst]: undefined }));
        return;
      }
      setExpanded((e) => ({ ...e, [inst]: null })); // marcador de "cargando"
      const where = whereCommon(filters);
      const r = await query(`
        SELECT codigo_snies_programa, programa_academico, anio, SUM(valor)::DOUBLE total
        FROM v_mercado WHERE ${where} AND institucion = '${esc(inst)}'
        GROUP BY codigo_snies_programa, programa_academico, anio
      `);
      const { entries: subEntries } = pivotByYear(r, ["codigo_snies_programa", "programa_academico"]);
      setExpanded((e) => ({ ...e, [inst]: subEntries }));
    },
    [expanded, filters, query]
  );

  const varLabel = prevYear ? `VAR ${String(lastYear).slice(-2)} vs ${String(prevYear).slice(-2)}` : "VAR";
  const difLabel = prevYear ? `DIF ${String(lastYear).slice(-2)} vs ${String(prevYear).slice(-2)}` : "DIF";

  return (
    <Card
      icon={Table2}
      title="Histórico por año"
      subtitle="Una fila por institución (o por programa), un año por columna — como la tabla dinámica de Excel. Ignora el filtro de año arriba; respeta los demás. 'Tasa prom.' promedia el CAGR de cada año disponible hasta el último — más robusto que la variación de un solo año."
    >
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agrupar por</span>
          <RadioGroup
            options={[
              { value: "institucion", label: "Institución" },
              { value: "programa", label: "Programa" },
            ]}
            value={groupBy}
            onChange={setGroupBy}
          />
        </div>

        <ChipSelect
          label="Institución (busca y selecciona)"
          placeholder="ej. Nacional"
          selected={selectedInst}
          onChange={setSelectedInst}
          fetchOptions={(term) => fetchInstitucionOptions(query, filters, term)}
        />

        {groupBy === "programa" && (
          <ChipSelect
            label="Programa (nombre o código SNIES)"
            placeholder="ej. Sistemas o 101382"
            selected={selectedProg}
            onChange={setSelectedProg}
            fetchOptions={(term) => fetchProgramaOptions(query, filters, selectedInst, term, activeProgKeys)}
          />
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top N</span>
          <input
            type="number"
            min={5}
            max={100}
            value={topN}
            onChange={(e) => setTopN(parseInt(e.target.value, 10) || 30)}
            className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13.5px] text-brand-navy-900 shadow-sm outline-none focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan-100"
          />
        </label>
      </div>

      <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5 text-left">{byProgram ? "Institución / Programa" : "Institución"}</th>
              {anios.map((a) => (
                <th key={a} className="px-3 py-1.5 text-right tabular-nums">
                  {a}
                </th>
              ))}
              <th className="px-3 py-1.5 text-right">{varLabel}</th>
              <th className="px-3 py-1.5 text-right">{difLabel}</th>
              <th className="px-3 py-1.5 text-left">Tendencia</th>
              <th className="px-3 py-1.5 text-right">Tasa Prom.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-brand-navy-50/70 font-semibold">
              <td className="px-3 py-1.5">
                Subtotal — {totalCount} {byProgram ? "programas" : "instituciones"}
              </td>
              {subtotal.values.map((v, i) => (
                <td key={i} className="px-3 py-1.5 text-right tabular-nums">
                  {fmt(v)}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right">{subtotal.varr == null ? "—" : <TrendBadge value={subtotal.varr} />}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt(subtotal.dif)}</td>
              <td className="px-3 py-1.5">
                <Sparkline values={subtotal.values} />
              </td>
              <td className="px-3 py-1.5 text-right">
                {(() => {
                  const tasa = buildTasaPromedio(subtotal.years, anios, lastYear);
                  return tasa == null ? "—" : <TrendBadge value={tasa} />;
                })()}
              </td>
            </tr>

            {entries.map((e) => {
              const inst = e.row.institucion;
              const isOpen = expanded[inst] !== undefined;
              const rowHighlight = isPoli(inst);
              return (
                <FragmentRow
                  key={keyCols.map((c) => e.row[c]).join("‧")}
                  entry={e}
                  anios={anios}
                  lastYear={lastYear}
                  expandable={!byProgram}
                  isOpen={isOpen}
                  onToggle={() => toggleExpand(inst)}
                  highlight={rowHighlight}
                  byProgram={byProgram}
                  subEntries={expanded[inst]}
                  isPoli={isPoli}
                />
              );
            })}
          </tbody>
        </table>
        {clipped && (
          <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
            Mostrando los {topN} de mayor valor en {lastYear} (de {totalCount} en el segmento filtrado) — ajusta Top N para ver más.
          </div>
        )}
      </div>
    </Card>
  );
}

function FragmentRow({ entry, anios, lastYear, expandable, isOpen, onToggle, highlight, byProgram, subEntries, isPoli }) {
  const entryTasa = buildTasaPromedio(entry.years, anios, lastYear);
  return (
    <>
      <tr className={highlight ? "bg-brand-cyan-50/60" : "hover:bg-slate-50/80"}>
        <td className="px-3 py-1.5">
          {expandable ? (
            <button onClick={onToggle} className="flex items-center gap-1.5 font-medium text-brand-navy-900 hover:text-brand-cyan">
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {entry.row.institucion}
            </button>
          ) : (
            <div>
              <div className="font-medium text-brand-navy-900">{entry.row.institucion}</div>
              {byProgram && (
                <div className="text-xs text-slate-400">
                  {entry.row.programa_academico} (SNIES {entry.row.codigo_snies_programa ?? "—"})
                </div>
              )}
            </div>
          )}
        </td>
        {entry.values.map((v, i) => (
          <td key={i} className="px-3 py-1.5 text-right tabular-nums text-slate-700">
            {fmt(v)}
          </td>
        ))}
        <td className="px-3 py-1.5 text-right">{entry.varr == null ? <span className="text-slate-300">—</span> : <TrendBadge value={entry.varr} />}</td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmt(entry.dif)}</td>
        <td className="px-3 py-1.5">
          <Sparkline values={entry.values} />
        </td>
        <td className="px-3 py-1.5 text-right">{entryTasa == null ? <span className="text-slate-300">—</span> : <TrendBadge value={entryTasa} />}</td>
      </tr>

      {isOpen === false ? null : subEntries === null ? (
        <tr>
          <td colSpan={anios.length + 5} className="px-3 py-3 pl-9 text-xs text-slate-400">
            Cargando programas…
          </td>
        </tr>
      ) : (
        subEntries?.map((p) => {
          const pTasa = buildTasaPromedio(p.years, anios, lastYear);
          return (
            <tr key={`${p.row.codigo_snies_programa}-${p.row.programa_academico}`} className={isPoli(entry.row.institucion) ? "bg-brand-cyan-50/40" : "bg-slate-50/50"}>
              <td className="px-3 py-1.5 pl-9 text-[12.5px] text-slate-600">
                {p.row.programa_academico} <span className="text-slate-400">(SNIES {p.row.codigo_snies_programa ?? "—"})</span>
              </td>
              {p.values.map((v, i) => (
                <td key={i} className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {fmt(v)}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right">{p.varr == null ? <span className="text-slate-300">—</span> : <TrendBadge value={p.varr} />}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{fmt(p.dif)}</td>
              <td className="px-3 py-1.5">
                <Sparkline values={p.values} />
              </td>
              <td className="px-3 py-1.5 text-right">{pTasa == null ? <span className="text-slate-300">—</span> : <TrendBadge value={pTasa} />}</td>
            </tr>
          );
        })
      )}
    </>
  );
}
