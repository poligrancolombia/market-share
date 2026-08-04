import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Layers } from "lucide-react";
import { useDuckDB } from "../lib/duckdb";
import { useFilters, whereBase } from "../state/FiltersContext";
import { fmt, esc } from "../lib/format";
import { pivotWide } from "../lib/pivot";
import { Card } from "../components/ui/Card";
import { ChartTooltip } from "../components/ui/ChartTooltip";
import { Select } from "../components/ui/Select";
import { InteractiveLegend } from "../components/ui/InteractiveLegend";

const DIMENSIONS = [
  { label: "Institución", col: "institucion" },
  { label: "Año", col: "anio" },
  { label: "Semestre", col: "semestre" },
  { label: "Nivel académico", col: "nivel_academico" },
  { label: "Sector", col: "sector_ies" },
  { label: "Nivel de formación", col: "nivel_formacion" },
  { label: "Modalidad", col: "metodologia" },
  { label: "Departamento", col: "departamento_programa" },
  { label: "Municipio", col: "municipio_programa" },
  { label: "Sexo", col: "sexo" },
];

const SERIES_COLORS = ["#1fb2de", "#0f385a", "#6dd3ec", "#f2a541", "#7c6fe0", "#2fb88a", "#e0637c", "#8a97a8"];
const colorFor = (i) => SERIES_COLORS[i % SERIES_COLORS.length];

// etiqueta de valor sobre cada barra -- solo se activa hasta 20 categorías
// (Top N configurable hasta 40): con más barras el texto se encimaría, y el
// tooltip ya cubre el detalle.
function SingleBarLabel({ x, y, width, value }) {
  if (value == null) return null;
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#0f385a">
      {fmt(value)}
    </text>
  );
}

export function Explorador() {
  const { query } = useDuckDB();
  const { filters } = useFilters();
  const [dim1, setDim1] = useState(DIMENSIONS[0].col);
  const [dim2, setDim2] = useState("");
  const [topN, setTopN] = useState(12);
  const [top, setTop] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const where = whereBase(filters);
      const topRows = await query(`
        SELECT ${dim1} AS d1, SUM(valor)::DOUBLE AS total FROM v_mercado
        WHERE ${where} GROUP BY d1 ORDER BY total DESC LIMIT ${topN}
      `);
      let brRows = [];
      if (dim2) {
        const keys = topRows.map((r) => `'${esc(String(r.d1))}'`).join(",");
        brRows = keys
          ? await query(`
              SELECT ${dim1} AS d1, ${dim2} AS d2, SUM(valor)::DOUBLE AS total FROM v_mercado
              WHERE ${where} AND ${dim1} IN (${keys}) GROUP BY d1, d2 ORDER BY d1, d2
            `)
          : [];
      }
      if (!cancelled) {
        setTop(topRows);
        setBreakdown(brRows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters, dim1, dim2, topN]);

  useEffect(() => {
    setHidden(new Set());
  }, [dim1, dim2]);

  const dim1Label = DIMENSIONS.find((d) => d.col === dim1)?.label ?? dim1;
  const dim2Label = DIMENSIONS.find((d) => d.col === dim2)?.label ?? dim2;
  const isTimeSeries = dim2 === "anio";

  const d1Order = useMemo(() => top.map((r) => String(r.d1)), [top]);
  const { dim2Vals, byDim1 } = useMemo(
    () => (dim2 ? pivotWide(breakdown, "d1", "d2", "total") : { dim2Vals: [], byDim1: new Map() }),
    [breakdown, dim2]
  );

  const chartData = useMemo(() => {
    if (!dim2) return top.map((r) => ({ d1: String(r.d1), total: r.total }));
    if (isTimeSeries) {
      return dim2Vals.map((d2v) => {
        const row = { d2: String(d2v) };
        for (const d1v of d1Order) row[d1v] = byDim1.get(d1v)?.[d2v] ?? null;
        return row;
      });
    }
    return d1Order.map((d1v) => {
      const row = { d1: d1v };
      for (const d2v of dim2Vals) row[String(d2v)] = byDim1.get(d1v)?.[d2v] ?? 0;
      return row;
    });
  }, [top, dim2, isTimeSeries, dim2Vals, byDim1, d1Order]);

  const toggleSeries = (key) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const legendItems = dim2
    ? (isTimeSeries ? d1Order : dim2Vals.map(String)).map((key, i) => ({ key, label: key, color: colorFor(i) }))
    : [];

  return (
    <div className="flex flex-col gap-5">
      <Card
        icon={Layers}
        title="Explorador de dimensiones"
        subtitle="Arma tu propio cruce: elige cómo agrupar y, opcionalmente, cómo desglosar cada categoría."
      >
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <Select label="Agrupar por" value={dim1} onChange={setDim1} options={DIMENSIONS.map((d) => ({ value: d.col, label: d.label }))} className="w-56" />
          <Select
            label="Desglosar por"
            value={dim2}
            onChange={setDim2}
            blankLabel="— ninguno —"
            options={DIMENSIONS.map((d) => ({ value: d.col, label: d.label }))}
            className="w-56"
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top N</span>
            <input
              type="number"
              min={3}
              max={40}
              value={topN}
              onChange={(e) => setTopN(Math.min(40, Math.max(3, parseInt(e.target.value, 10) || 12)))}
              className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13.5px] text-brand-navy-900 shadow-sm outline-none focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan-100"
            />
          </label>
        </div>

        {loading && !top.length ? (
          <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>
        ) : (
          <>
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer>
                {dim2 && isTimeSeries ? (
                  <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis dataKey="d2" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }} />
                    <Legend content={() => null} />
                    {d1Order.map((d1v, i) => (
                      <Line
                        key={d1v}
                        type="monotone"
                        dataKey={d1v}
                        name={d1v}
                        stroke={colorFor(i)}
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        hide={hidden.has(d1v)}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                ) : dim2 ? (
                  <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 40, left: 0 }} barCategoryGap="24%">
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis
                      dataKey="d1"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={56}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} cursor={{ fill: "rgba(31,178,222,0.06)" }} />
                    <Legend content={() => null} />
                    {dim2Vals.map((d2v, i) => (
                      <Bar key={d2v} dataKey={String(d2v)} name={String(d2v)} fill={colorFor(i)} radius={[3, 3, 0, 0]} hide={hidden.has(String(d2v))} />
                    ))}
                  </BarChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: topN > 20 ? 12 : 26, right: 16, bottom: 40, left: 0 }} barCategoryGap="24%">
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis
                      dataKey="d1"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={56}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} cursor={{ fill: "rgba(31,178,222,0.06)" }} />
                    <Bar dataKey="total" name={dim1Label} fill={colorFor(0)} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {topN <= 20 && <LabelList dataKey="total" content={<SingleBarLabel />} />}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            {dim2 && <InteractiveLegend items={legendItems} hidden={hidden} onToggle={toggleSeries} />}

            <div className="mt-5 overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
              <table className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-1.5 text-left">{dim1Label}</th>
                    {dim2 ? (
                      dim2Vals.map((v) => (
                        <th key={v} className="px-3 py-1.5 text-right tabular-nums">
                          {v}
                        </th>
                      ))
                    ) : (
                      <th className="px-3 py-1.5 text-right">Total</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dim2
                    ? d1Order.map((d1v) => (
                        <tr key={d1v}>
                          <td className="px-3 py-1.5">{d1v}</td>
                          {dim2Vals.map((v) => (
                            <td key={v} className="px-3 py-1.5 text-right tabular-nums">
                              {byDim1.get(d1v)?.[v] == null ? "" : fmt(byDim1.get(d1v)[v])}
                            </td>
                          ))}
                        </tr>
                      ))
                    : top.map((r) => (
                        <tr key={String(r.d1)}>
                          <td className="px-3 py-1.5">{String(r.d1)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.total)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
