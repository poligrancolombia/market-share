import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart as Donut, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Layers, PieChart, ListTree, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { useDuckDB } from "../lib/duckdb";
import { useFilters, whereCommon } from "../state/FiltersContext";
import { fmt, pct } from "../lib/format";
import { NIVEL_FORMACION_ORDER, NIVEL_FORMACION_LABELS, buildOfertaEvolution, buildNivelDistribution, buildModalidadDistribution, buildNuevosTable } from "../lib/oferta";
import { buildProgramTables } from "../lib/panorama";
import { Card } from "../components/ui/Card";
import { ChartTooltip } from "../components/ui/ChartTooltip";
import { InteractiveLegend } from "../components/ui/InteractiveLegend";
import { TrendBadge } from "../components/ui/KpiBadge";

// nota sobre el alcance de "nivel de formación" en esta pestaña -- se repite
// en las 3 gráficas que cortan por nivel.
const EXCLUSION_NOTE = "No incluye Especialización Tecnológica, Médico Quirúrgica ni Técnico Profesional (excluidas por ahora)";

// paleta fija (validada: 8 familias, orden fijo, nunca cíclica) -- cada
// categoría de nivel/modalidad siempre lleva el mismo color, sin importar su
// posición en el ranking. El residual de modalidad ("Sin información") va en
// gris neutro, fuera de la paleta categórica.
const NEUTRAL = "#94a3b8";
const NIVEL_COLORS = {
  "Especializacion Universitaria": "#eda100",
  Maestria: "#e87ba4",
  Doctorado: "#008300",
  Universitario: "#2a78d6",
  Tecnologico: "#eb6834",
  "Formacion Tecnica Profesional": "#1baf7a",
};
const MODALIDAD_COLORS = {
  Presencial: "#2a78d6",
  Virtual: "#eb6834",
  "A distancia": "#1baf7a",
  Hibrida: "#eda100",
  Dual: "#e87ba4",
  "Sin informacion": NEUTRAL,
};

// etiqueta sobre cada punto de la evolución de oferta -- píldora coloreada
// con el conteo de programas, centrada EN el punto (no flotando encima).
function CountPillLabel({ x, y, value, color }) {
  if (value == null) return null;
  const text = fmt(value);
  const w = 14 + text.length * 7.2;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-w / 2} y={-11} width={w} height={20} rx={10} fill={color} />
      <text textAnchor="middle" dy={3.5} fontSize={11} fontWeight={700} fill="#fff">
        {text}
      </text>
    </g>
  );
}

// etiqueta externa con línea guía -- nombre, cantidad y % de cada segmento,
// como los donuts del tablero de origen.
function DonutLabel({ cx, cy, midAngle, outerRadius, percent, label, value }) {
  const RADIAN = Math.PI / 180;
  const cos = Math.cos(-RADIAN * midAngle);
  const sin = Math.sin(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 6) * cos;
  const sy = cy + (outerRadius + 6) * sin;
  const mx = cx + (outerRadius + 20) * cos;
  const my = cy + (outerRadius + 20) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 10;
  const ey = my;
  const anchor = cos >= 0 ? "start" : "end";
  return (
    <g>
      <path d={`M${sx},${sy} L${mx},${my} L${ex},${ey}`} stroke="#cbd5e1" fill="none" />
      <text x={ex + (cos >= 0 ? 4 : -4)} y={ey} textAnchor={anchor} dominantBaseline="central" fontSize={11.5} fill="#334155">
        {`${label} ${fmt(value)} (${pct(percent)})`}
      </text>
    </g>
  );
}

function DonutLegend({ data, colors }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {data.map((d) => (
        <span key={d.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[d.key] ?? NEUTRAL }} />
          {d.label}
        </span>
      ))}
    </div>
  );
}

function DistributionDonut({ data, colors }) {
  return (
    <div>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <Donut>
            <Tooltip content={<ChartTooltip formatter={(v, name, p) => `${fmt(v)} (${pct(p.payload.pct)})`} />} />
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius="52%"
              outerRadius="72%"
              paddingAngle={1.5}
              label={<DonutLabel />}
              labelLine={false}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={colors[d.key] ?? NEUTRAL} />
              ))}
            </Pie>
          </Donut>
        </ResponsiveContainer>
      </div>
      <DonutLegend data={data} colors={colors} />
    </div>
  );
}

export function Oferta() {
  const { query } = useDuckDB();
  const { filters } = useFilters();
  const [rows, setRows] = useState([]);
  const [programRows, setProgramRows] = useState([]);
  const [hiddenNivel, setHiddenNivel] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const where = whereCommon(filters);
      const [r, progRows] = await Promise.all([
        query(`
          SELECT anio, codigo_snies_programa, nivel_formacion, metodologia, SUM(valor)::DOUBLE AS valor
          FROM v_mercado WHERE ${where}
          GROUP BY anio, codigo_snies_programa, nivel_formacion, metodologia
        `),
        query(`
          SELECT anio, codigo_snies_programa, programa_academico, metodologia, institucion, SUM(valor)::DOUBLE AS valor
          FROM v_mercado WHERE ${where}
          GROUP BY anio, codigo_snies_programa, programa_academico, metodologia, institucion
          ORDER BY anio
        `),
      ]);
      if (!cancelled) {
        setRows(r);
        setProgramRows(progRows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters]);

  const anios = useMemo(() => [...new Set(rows.map((r) => r.anio))].sort((a, b) => a - b), [rows]);
  const lastYear = anios[anios.length - 1];
  const prevYear = anios[anios.length - 2];

  const ofertaEvo = useMemo(() => (rows.length ? buildOfertaEvolution(rows, anios) : []), [rows, anios]);
  const nivelDist = useMemo(() => (rows.length ? buildNivelDistribution(rows, lastYear) : []), [rows, lastYear]);
  const modalidadDist = useMemo(() => (rows.length ? buildModalidadDistribution(rows, lastYear) : []), [rows, lastYear]);
  const programTables = useMemo(
    () => (programRows.length ? buildProgramTables(programRows, anios, lastYear, prevYear) : { debut: [], growers: [], decliners: [] }),
    [programRows, anios, lastYear, prevYear]
  );
  const nuevos = useMemo(
    () => (rows.length ? buildNuevosTable(rows, anios, lastYear) : { modalidades: [], rows: [], colTotals: [], grandTotal: 0 }),
    [rows, anios, lastYear]
  );

  const toggleNivel = (key) =>
    setHiddenNivel((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!rows.length) {
    return <div className="py-16 text-center text-sm text-slate-400">Cargando oferta…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card
        icon={Layers}
        title="Oferta de programas por nivel de formación"
        subtitle={`Programas (por código SNIES) con más de 2 matrículas ese año, por nivel de formación — ${EXCLUSION_NOTE}`}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer>
                <LineChart data={ofertaEvo} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                  <YAxis hide domain={["dataMin - 200", "dataMax + 200"]} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        formatter={(v, name, p) => {
                          const diff = p.payload.diffs?.[name];
                          const diffText = diff == null ? "" : ` (${diff >= 0 ? "+" : ""}${fmt(diff)})`;
                          return `${fmt(v)}${diffText}`;
                        }}
                      />
                    }
                    cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                  />
                  {NIVEL_FORMACION_ORDER.map((nivel) => {
                    const key = NIVEL_FORMACION_LABELS[nivel];
                    return (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={key}
                        stroke={NIVEL_COLORS[nivel]}
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: NIVEL_COLORS[nivel], strokeWidth: 0 }}
                        hide={hiddenNivel.has(key)}
                        label={<CountPillLabel color={NIVEL_COLORS[nivel]} />}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <InteractiveLegend
              items={NIVEL_FORMACION_ORDER.map((nivel) => ({ key: NIVEL_FORMACION_LABELS[nivel], label: NIVEL_FORMACION_LABELS[nivel], color: NIVEL_COLORS[nivel] }))}
              hidden={hiddenNivel}
              onToggle={toggleNivel}
            />
          </div>

          <div>
            <h4 className="mb-1 text-[13.5px] font-semibold tracking-tight text-brand-navy-900">Programas nuevos por nivel y modalidad</h4>
            <p className="mb-3 text-xs text-slate-500">
              Matrícula por primera vez en {lastYear} (más de 2 matrículas, sin registro en ningún año anterior)
            </p>
            <div className="overflow-x-auto scroll-thin rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2.5 py-2 text-left">Nivel</th>
                    {nuevos.modalidades.map((m) => (
                      <th key={m} className="px-2.5 py-2 text-right">
                        {m}
                      </th>
                    ))}
                    <th className="px-2.5 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {nuevos.rows.map((r) => (
                    <tr key={r.key} className="hover:bg-slate-50/80">
                      <td className="px-2.5 py-2 font-medium text-brand-navy-900">{r.label}</td>
                      {r.cells.map((c, i) => (
                        <td key={i} className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                          {c || <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                      <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-brand-navy-900">{r.total}</td>
                    </tr>
                  ))}
                  {!nuevos.rows.length && (
                    <tr>
                      <td colSpan={nuevos.modalidades.length + 2} className="px-2.5 py-6 text-center text-slate-400">
                        Sin programas nuevos en {lastYear} bajo este segmento.
                      </td>
                    </tr>
                  )}
                </tbody>
                {nuevos.rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-brand-navy-50/70 font-semibold">
                      <td className="px-2.5 py-2">Total</td>
                      {nuevos.colTotals.map((c, i) => (
                        <td key={i} className="px-2.5 py-2 text-right tabular-nums">
                          {c}
                        </td>
                      ))}
                      <td className="px-2.5 py-2 text-right tabular-nums">{nuevos.grandTotal}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card icon={PieChart} title="Distribución por nivel de formación" subtitle={`Programas en oferta en ${lastYear} — ${EXCLUSION_NOTE}`}>
          <DistributionDonut data={nivelDist} colors={NIVEL_COLORS} />
        </Card>

        <Card icon={ListTree} title="Distribución por modalidad" subtitle={`Programas en oferta en ${lastYear} — ${EXCLUSION_NOTE}`}>
          <DistributionDonut data={modalidadDist} colors={MODALIDAD_COLORS} />
        </Card>
      </div>

      <Card icon={Sparkles} title="Top 10 con mejor debut" subtitle={`Programas con matrícula en ${lastYear} que no registraban en ningún año anterior`}>
        <div className="overflow-x-auto scroll-thin rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-left">Top</th>
                <th className="px-3 py-2.5 text-left">SNIES</th>
                <th className="px-3 py-2.5 text-left">Programa</th>
                <th className="px-3 py-2.5 text-left">Modalidad</th>
                <th className="px-3 py-2.5 text-left">IES</th>
                <th className="px-3 py-2.5 text-right">Nuevos {lastYear}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programTables.debut.map((p, i) => (
                <tr key={p.codigo}>
                  <td className="px-3 py-2.5 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{p.codigo}</td>
                  <td className="px-3 py-2.5">{p.programa}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.modalidad}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.institucion}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-600">+{fmt(p.nuevos)}</td>
                </tr>
              ))}
              {!programTables.debut.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    Sin programas nuevos en este segmento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card icon={TrendingUp} title="Top 10 con mayor crecimiento" subtitle={`Programas por SNIES, mayor diferencia absoluta de matrícula ${prevYear} → ${lastYear}`}>
        <div className="overflow-x-auto scroll-thin rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-left">Top</th>
                <th className="px-3 py-2.5 text-left">SNIES</th>
                <th className="px-3 py-2.5 text-left">Programa</th>
                <th className="px-3 py-2.5 text-left">Modalidad</th>
                <th className="px-3 py-2.5 text-left">IES</th>
                <th className="px-3 py-2.5 text-right">{prevYear}</th>
                <th className="px-3 py-2.5 text-right">{lastYear}</th>
                <th className="px-3 py-2.5 text-right">Dif.</th>
                <th className="px-3 py-2.5 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programTables.growers.map((p, i) => (
                <tr key={p.codigo}>
                  <td className="px-3 py-2.5 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{p.codigo}</td>
                  <td className="px-3 py-2.5">{p.programa}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.modalidad}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.institucion}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.prev)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.last)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-600">+{fmt(p.dif)}</td>
                  <td className="px-3 py-2.5 text-right">{p.growth == null ? "—" : <TrendBadge value={p.growth} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card icon={TrendingDown} title="Top 10 que más decrecen" subtitle={`Programas por SNIES, mayor caída absoluta de matrícula ${prevYear} → ${lastYear}`}>
        <div className="overflow-x-auto scroll-thin rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-left">Top</th>
                <th className="px-3 py-2.5 text-left">SNIES</th>
                <th className="px-3 py-2.5 text-left">Programa</th>
                <th className="px-3 py-2.5 text-left">Modalidad</th>
                <th className="px-3 py-2.5 text-left">IES</th>
                <th className="px-3 py-2.5 text-right">{prevYear}</th>
                <th className="px-3 py-2.5 text-right">{lastYear}</th>
                <th className="px-3 py-2.5 text-right">Dif.</th>
                <th className="px-3 py-2.5 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programTables.decliners.map((p, i) => (
                <tr key={p.codigo}>
                  <td className="px-3 py-2.5 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{p.codigo}</td>
                  <td className="px-3 py-2.5">{p.programa}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.modalidad}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.institucion}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.prev)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.last)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-rose-600">{fmt(p.dif)}</td>
                  <td className="px-3 py-2.5 text-right">{p.growth == null ? "—" : <TrendBadge value={p.growth} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
