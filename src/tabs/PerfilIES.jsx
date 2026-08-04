import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, PieChart, TrendingUp, TrendingDown, Sparkles, ChevronsUpDown, NotebookText, Award, Check } from "lucide-react";
import { useDuckDB } from "../lib/duckdb";
import { useFilters, whereCommon } from "../state/FiltersContext";
import { fmt, pct, esc, formatNivel, formatModalidad, NIVEL_FORMACION_ORDER, MODALIDAD_ORDER } from "../lib/format";
import { computeShareByYear } from "../lib/mercadoCompetencia";
import { HALLAZGOS_2025 } from "../data/hallazgos2025";
import {
  whereInstitucion,
  applyMatriculadosCutoff,
  buildNivelModalidadYoY,
  buildProgramGrowth,
  buildNuevosProgramas,
  buildShareEvolutionForInst,
  buildParetoInstitucion,
} from "../lib/perfilIes";
import { Card } from "../components/ui/Card";
import { ChartTooltip } from "../components/ui/ChartTooltip";
import { SearchSelect } from "../components/ui/SearchSelect";
import { KpiTile, TrendBadge } from "../components/ui/KpiBadge";

const SHARE_COLOR = "#1fb2de";

// código SNIES a partir del cual se considera un programa "reciente" -- los
// códigos son correlativos en el tiempo, así que un umbral alto filtra
// programas históricos que por otra razón nunca acumularon matrícula.
const SNIES_NUEVO_MIN = 115000;

function ShareBarLabel({ x, y, width, value }) {
  if (value == null) return null;
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={SHARE_COLOR}>
      {pct(value)}
    </text>
  );
}

// tabla nivel x modalidad -- se reutiliza para la versión Nuevos (Primer
// Curso) y Totales (Matriculados). Por defecto muestra el resumen por nivel
// académico (Pregrado/Posgrado); un botón despliega el detalle por nivel de
// formación. El orden de filas viene fijo desde buildNivelModalidadYoY (no
// cambia al alternar ni al recargar), nunca por volumen de matrícula.
function NivelModalidadTable({ resumen, detalle, lastYear, prevYear }) {
  const [expanded, setExpanded] = useState(false);
  const data = expanded ? detalle : resumen;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{expanded ? "Nivel de formación" : "Nivel académico"}</span>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-cyan hover:text-brand-cyan"
        >
          <ChevronsUpDown size={12} />
          {expanded ? "Ver resumen" : "Ver detalle"}
        </button>
      </div>
      <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5 text-left">Modalidad</th>
              <th className="px-3 py-1.5 text-left">{expanded ? "Nivel de formación" : "Nivel"}</th>
              <th className="px-3 py-1.5 text-right">{prevYear}</th>
              <th className="px-3 py-1.5 text-right">{lastYear}</th>
              <th className="px-3 py-1.5 text-right">Var %</th>
              <th className="px-3 py-1.5 text-right">Var Abs.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <tr key={r.key} className="hover:bg-slate-50/80">
                <td className="px-3 py-1.5">{formatModalidad(r.modalidad)}</td>
                <td className="px-3 py-1.5">{expanded ? formatNivel(r.nivel) : r.nivel ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.prev)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.last)}</td>
                <td className="px-3 py-1.5 text-right">{r.growth == null ? <span className="text-slate-300">—</span> : <TrendBadge value={r.growth} />}</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmt(r.dif)}</td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  Sin datos en este segmento.
                </td>
              </tr>
            )}
          </tbody>
          {data.rows.length > 0 && (
            <tfoot>
              <tr className="bg-brand-navy-50/70 font-semibold">
                <td className="px-3 py-1.5" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(data.total.prev)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(data.total.last)}</td>
                <td className="px-3 py-1.5 text-right">{data.total.growth == null ? "—" : <TrendBadge value={data.total.growth} />}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(data.total.dif)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// tabla de programas (crecen/decrecen) -- misma forma para ambos lados,
// coloreando la diferencia según el signo esperado de esa lista.
function ProgramGrowthTable({ items, tone }) {
  const color = tone === "up" ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-1.5 text-left">Programa</th>
            <th className="px-3 py-1.5 text-left">Nivel</th>
            <th className="px-3 py-1.5 text-left">Modalidad</th>
            <th className="px-3 py-1.5 text-right">Dif.</th>
            <th className="px-3 py-1.5 text-right">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((p, i) => (
            <tr key={i} className="hover:bg-slate-50/80">
              <td className="px-3 py-1.5">{p.programa}</td>
              <td className="px-3 py-1.5 text-slate-500">{formatNivel(p.nivel)}</td>
              <td className="px-3 py-1.5 text-slate-500">{formatModalidad(p.modalidad)}</td>
              <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${color}`}>
                {p.dif >= 0 ? "+" : ""}
                {fmt(p.dif)}
              </td>
              <td className="px-3 py-1.5 text-right">{p.growth == null ? "—" : <TrendBadge value={p.growth} />}</td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                Sin programas en esta categoría.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const ROWS_VISIBLE = 10;

function orderIndex(order, value) {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

// botón "ver más / ver menos" compartido por las tablas de programas nuevos
// (2024 y 2026) -- solo aparece si hay filas ocultas más allá de las 10
// visibles por defecto.
function ExpandToggle({ hidden, expanded, onToggle }) {
  if (hidden <= 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 w-full rounded-lg border border-slate-200 py-1.5 text-[12px] font-medium text-slate-600 hover:border-brand-cyan hover:text-brand-cyan"
    >
      {expanded ? "Ver menos" : `Ver ${fmt(hidden)} más`}
    </button>
  );
}

// programas nuevos del último año CON matrícula (primer curso) -- muestra
// las primeras 10 filas, con botón para desplegar el resto.
function NuevosProgramasTable({ items, lastYear }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, ROWS_VISIBLE);
  const hidden = items.length - ROWS_VISIBLE;
  return (
    <div>
      <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5 text-left">Programa</th>
              <th className="px-3 py-1.5 text-left">Nivel</th>
              <th className="px-3 py-1.5 text-left">Modalidad</th>
              <th className="px-3 py-1.5 text-right">Nuevos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((p, i) => (
              <tr key={i} className="hover:bg-slate-50/80">
                <td className="px-3 py-1.5">{p.programa}</td>
                <td className="px-3 py-1.5 text-slate-500">{formatNivel(p.nivel)}</td>
                <td className="px-3 py-1.5 text-slate-500">{formatModalidad(p.modalidad)}</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-600">+{fmt(p.nuevos)}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  Sin programas nuevos en {lastYear}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ExpandToggle hidden={hidden} expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
    </div>
  );
}

// modalidad + ciudad para el listado de oferta: Presencial/Híbrida se ofrecen
// en una sede puntual (se anota la ciudad); Virtual/A distancia son de
// alcance nacional, sin ciudad que agregar.
function formatModalidadCiudad(metodologia, municipio) {
  const label = formatModalidad(metodologia);
  const conCiudad = (metodologia === "Presencial" || metodologia === "Hibrida") && municipio;
  return conCiudad ? `${label}/${municipio}` : label;
}

// programas nuevos 2026 (del catálogo de oferta, sin matrícula histórica) --
// misma paginación de 10 que la tabla anterior. La marca de homólogo Poli se
// muestra como un ícono junto al nombre del programa (no una columna aparte,
// para no perder espacio horizontal), con su leyenda al pie.
function Nuevos2026Table({ items }) {
  const [expanded, setExpanded] = useState(false);
  const loading = items == null;
  const rows = useMemo(
    () =>
      [...(items ?? [])].sort(
        (a, b) =>
          orderIndex(NIVEL_FORMACION_ORDER, a.nivel_formacion) - orderIndex(NIVEL_FORMACION_ORDER, b.nivel_formacion) ||
          orderIndex(MODALIDAD_ORDER, a.metodologia) - orderIndex(MODALIDAD_ORDER, b.metodologia)
      ),
    [items]
  );
  const visible = expanded ? rows : rows.slice(0, ROWS_VISIBLE);
  const hidden = rows.length - ROWS_VISIBLE;
  const hayHomologos = rows.some((p) => p.grupo_homologo != null);
  return (
    <div>
      <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5 text-left">Programa</th>
              <th className="px-3 py-1.5 text-left">Nivel de formación</th>
              <th className="px-3 py-1.5 text-left">Modalidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((p, i) => (
              <tr key={i} className="hover:bg-slate-50/80">
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    {p.grupo_homologo != null && <Check size={13} strokeWidth={3} className="shrink-0 text-brand-cyan" />}
                    {p.programa_academico}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-slate-500">{formatNivel(p.nivel_formacion)}</td>
                <td className="px-3 py-1.5 text-slate-500">{formatModalidadCiudad(p.metodologia, p.municipio_programa)}</td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                  Sin programas nuevos bajo este criterio.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ExpandToggle hidden={hidden} expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
      {hayHomologos && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          <Check size={11} strokeWidth={3} className="shrink-0 text-brand-cyan" /> Homólogo a un programa del Poli (Competencia Total)
        </p>
      )}
    </div>
  );
}

export function PerfilIES() {
  const { query, poliName } = useDuckDB();
  const { filters } = useFilters();
  const [institucionOptions, setInstitucionOptions] = useState([]);
  const [accreditedMap, setAccreditedMap] = useState(new Map());
  const [institucion, setInstitucion] = useState("");
  const [rows, setRows] = useState(null);
  const [nationalRows, setNationalRows] = useState(null);
  const [nuevos2026, setNuevos2026] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // una institución puede tener varias sedes (codigo_institucion) -- se
      // considera acreditada en alta calidad si CUALQUIERA de sus sedes lo
      // está. El Poli aparece como no acreditada en el catálogo fuente
      // (Instituciones.xlsx no se ha actualizado con su acreditación
      // reciente); se fuerza a "sí" aquí mismo hasta que se corrija el dato
      // de origen.
      const r = await query(`
        SELECT institucion, BOOL_OR(acreditada_alta_calidad) AS acreditada
        FROM dim_institucion WHERE institucion IS NOT NULL
        GROUP BY institucion ORDER BY institucion
      `);
      if (cancelled) return;
      setInstitucionOptions(r.map((x) => x.institucion));
      setAccreditedMap(new Map(r.map((x) => [x.institucion, !!x.acreditada])));
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const isAccredited = institucion === poliName ? true : !!accreditedMap.get(institucion);

  // cruce dim_programa x hecho_indicador: programas del catálogo nacional de
  // oferta vigente ("Programas.xlsx", cubre TODAS las IES -- no es
  // oferta_poli, que es solo el catálogo propio del Poli) para esta
  // institución, con código SNIES > SNIES_NUEVO_MIN, que NUNCA registraron
  // matrícula en el histórico 2016-2024 -- candidatos a nuevo lanzamiento.
  // grupo_homologo (columna "COMPETENCIA TOTAL" de Programas.xlsx) marca si
  // ese programa nuevo está homologado a algún programa del Poli.
  useEffect(() => {
    if (!institucion) {
      setNuevos2026(null);
      return;
    }
    let cancelled = false;
    setNuevos2026(null);
    (async () => {
      const r = await query(`
        SELECT p.programa_academico, p.metodologia, p.nivel_formacion, p.municipio_programa, p.grupo_homologo
        FROM dim_programa p
        JOIN dim_institucion i ON p.codigo_institucion = i.codigo_institucion
        WHERE i.institucion = '${esc(institucion)}'
          AND p.codigo_snies_programa > ${SNIES_NUEVO_MIN}
          AND NOT EXISTS (
            SELECT 1 FROM hecho_indicador h
            WHERE h.codigo_snies_programa = p.codigo_snies_programa AND h.codigo_institucion = p.codigo_institucion
          )
        ORDER BY p.programa_academico
      `);
      if (!cancelled) setNuevos2026(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, institucion]);

  // detalle de la institución: TODOS los años, las DOS métricas y sus
  // programas -- una sola consulta, ya filtrada a esta institución (barata),
  // que alimenta todas las tablas de abajo.
  useEffect(() => {
    if (!institucion) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setRows(null);
    (async () => {
      const where = whereInstitucion(filters, institucion);
      const r = await query(`
        SELECT anio, semestre, metrica, codigo_snies_programa, programa_academico, nivel_formacion, nivel_academico, metodologia, SUM(valor)::DOUBLE AS valor
        FROM v_mercado WHERE ${where}
        GROUP BY anio, semestre, metrica, codigo_snies_programa, programa_academico, nivel_formacion, nivel_academico, metodologia
      `);
      if (!cancelled) setRows(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters, institucion]);

  // totales nacionales por institución y año (siempre Primer Curso) -- no
  // depende de cuál institución esté seleccionada, solo de los demás
  // filtros; sirve para el share/ranking de la institución elegida.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const where = whereCommon({ ...filters, metrica: "primer_curso" });
      const r = await query(`
        SELECT anio, institucion, SUM(valor)::DOUBLE AS valor
        FROM v_mercado WHERE ${where}
        GROUP BY anio, institucion
      `);
      if (!cancelled) setNationalRows(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters]);

  const derived = useMemo(() => {
    if (!institucion || !rows || !rows.length || !nationalRows || !nationalRows.length) return null;
    const cutRows = applyMatriculadosCutoff(rows, filters);
    const anios = [...new Set(cutRows.map((r) => r.anio))].sort((a, b) => a - b);
    const lastYear = anios[anios.length - 1];
    const prevYear = anios[anios.length - 2];

    const nuevosResumen = buildNivelModalidadYoY(cutRows, "primer_curso", lastYear, prevYear, "nivel_academico");
    const nuevosDetalle = buildNivelModalidadYoY(cutRows, "primer_curso", lastYear, prevYear, "nivel_formacion");
    const totalesResumen = buildNivelModalidadYoY(cutRows, "matriculados", lastYear, prevYear, "nivel_academico");
    const totalesDetalle = buildNivelModalidadYoY(cutRows, "matriculados", lastYear, prevYear, "nivel_formacion");
    const growth = buildProgramGrowth(cutRows, "primer_curso", lastYear, prevYear, 10);
    const nuevosProgramas = buildNuevosProgramas(cutRows, "primer_curso", anios, lastYear, 200);
    const pareto = buildParetoInstitucion(
      cutRows.filter((r) => r.metrica === "matriculados"),
      lastYear
    );

    const { anios: nationalAnios, shareByYear } = computeShareByYear(nationalRows);
    const shareEvo = buildShareEvolutionForInst(shareByYear, nationalAnios.slice(-5), institucion);
    const lastShareRow = shareByYear.get(lastYear)?.find((r) => r.institucion === institucion);
    const prevShareRow = shareByYear.get(prevYear)?.find((r) => r.institucion === institucion);
    const totalInstsLastYear = shareByYear.get(lastYear)?.length ?? 0;
    const growthPC = prevShareRow?.valor ? (lastShareRow?.valor - prevShareRow.valor) / prevShareRow.valor : null;

    return {
      anios,
      lastYear,
      prevYear,
      nuevosResumen,
      nuevosDetalle,
      totalesResumen,
      totalesDetalle,
      growth,
      nuevosProgramas,
      pareto,
      shareEvo,
      lastShareRow,
      totalInstsLastYear,
      growthPC,
    };
  }, [institucion, rows, nationalRows, filters]);

  return (
    <div className="flex flex-col gap-5">
      <Card
        icon={Building2}
        title="Perfil IES"
        subtitle="Resultado de una institución usando Primer Curso — la tabla de Totales usa Matriculados (corte semestre 2). Ignora el filtro de año (usa todo el histórico)."
      >
        <div className="flex flex-wrap items-end gap-3">
          <SearchSelect label="Institución" value={institucion} onChange={setInstitucion} options={institucionOptions} placeholder="Buscar institución…" className="w-72" />
          {institucion &&
            (isAccredited ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <Award size={13} /> Acreditación de Alta Calidad
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-500 ring-1 ring-slate-200">
                Sin acreditación de Alta Calidad
              </span>
            ))}
        </div>

        {!institucion ? (
          <div className="py-16 text-center text-sm text-slate-400">Selecciona una institución arriba para ver su perfil.</div>
        ) : !derived ? (
          <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>
        ) : (
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap gap-2.5">
              <KpiTile label={`Primer curso ${derived.lastYear}`} value={fmt(derived.lastShareRow?.valor ?? 0)} delta={derived.growthPC} />
              <KpiTile label={`Participación nacional (${derived.lastYear})`} value={pct(derived.lastShareRow?.share ?? 0)} />
              <KpiTile label="Posición nacional" value={derived.lastShareRow ? `#${derived.lastShareRow.rank} / ${derived.totalInstsLastYear}` : "—"} />
              <KpiTile label={`Programas nuevos ${derived.lastYear}`} value={`${derived.nuevosProgramas.count} → ${fmt(derived.nuevosProgramas.total)}`} />
              <div className="min-w-[190px] flex-1 rounded-xl bg-white p-3.5 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Concentración de programas</span>
                <div className="mt-1.5 flex items-baseline gap-4">
                  <div>
                    <div className="text-[10.5px] text-slate-400">Top 5</div>
                    <div className="text-lg font-bold tabular-nums leading-none text-brand-navy-900">{pct(derived.pareto.top5Share)}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-slate-400">Top 10</div>
                    <div className="text-lg font-bold tabular-nums leading-none text-brand-navy-900">{pct(derived.pareto.top10Share)}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-slate-400">Top 20</div>
                    <div className="text-lg font-bold tabular-nums leading-none text-brand-navy-900">{pct(derived.pareto.top20Share)}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="w-full shrink-0 lg:w-64">
              <h4 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <PieChart size={12} /> Evolución de participación (últimos 5 años)
              </h4>
              <div style={{ width: "100%", height: 140 }}>
                <ResponsiveContainer>
                  <BarChart data={derived.shareEvo} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis dataKey="anio" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      content={<ChartTooltip formatter={(v, name, p) => (v == null ? "s/d" : `${pct(v)} · ${fmt(p.payload.valor)}`)} />}
                      cursor={{ fill: "rgba(31,178,222,0.06)" }}
                    />
                    <Bar dataKey="share" fill={SHARE_COLOR} radius={[3, 3, 0, 0]}>
                      <LabelList dataKey="share" content={<ShareBarLabel />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </Card>

      {derived && (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card icon={Sparkles} title={`Programas nuevos ${derived.lastYear}`} subtitle={`Debuts con matrícula (Primer Curso) en ${derived.lastYear}`}>
              <NuevosProgramasTable items={derived.nuevosProgramas.items} lastYear={derived.lastYear} />
            </Card>
            <Card
              icon={Sparkles}
              title="Programas nuevos 2026 (sin matrícula histórica)"
              subtitle={`Catálogo nacional de oferta vigente, código SNIES > ${fmt(SNIES_NUEVO_MIN)}, sin matrícula en el histórico 2016-2024`}
            >
              <Nuevos2026Table items={nuevos2026} />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card icon={TrendingUp} title="Por nivel y modalidad — Nuevos (Primer Curso)" subtitle={`${derived.prevYear} vs ${derived.lastYear}`}>
              <NivelModalidadTable resumen={derived.nuevosResumen} detalle={derived.nuevosDetalle} lastYear={derived.lastYear} prevYear={derived.prevYear} />
            </Card>
            <Card
              icon={TrendingUp}
              title="Por nivel y modalidad — Totales (Matriculados)"
              subtitle={`${derived.prevYear} vs ${derived.lastYear}${filters.semestre ? "" : " · corte semestre 2"}`}
            >
              <NivelModalidadTable resumen={derived.totalesResumen} detalle={derived.totalesDetalle} lastYear={derived.lastYear} prevYear={derived.prevYear} />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card
              icon={TrendingUp}
              title="Programas que más crecen"
              subtitle={`${derived.growth.growersCount} programas crecieron — ${derived.prevYear} → ${derived.lastYear}`}
            >
              <ProgramGrowthTable items={derived.growth.growers} tone="up" />
            </Card>
            <Card
              icon={TrendingDown}
              title="Programas que más decrecen"
              subtitle={`${derived.growth.declinersCount} programas decrecieron — ${derived.prevYear} → ${derived.lastYear}`}
            >
              <ProgramGrowthTable items={derived.growth.decliners} tone="down" />
            </Card>
          </div>

          {HALLAZGOS_2025[institucion] && (
            <Card icon={NotebookText} title="Hallazgos 2025" subtitle="Principales resultados del informe de gestión de la institución">
              <p className="text-[13.5px] leading-relaxed text-slate-700">{HALLAZGOS_2025[institucion]}</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
