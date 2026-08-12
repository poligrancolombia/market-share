import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeftRight, TrendingUp, PieChart, Building2, ListChecks } from "lucide-react";
import { useDuckDB } from "../lib/duckdb";
import { useFilters } from "../state/FiltersContext";
import { esc, fmt, pct } from "../lib/format";
import { pivotByYear } from "../lib/pivot";
import { whereGrupo, computeShareByYear, pickTopInsts, computeGrowthAll, pickGrowth, pickMatriculaChartData } from "../lib/mercadoCompetencia";
import { Card } from "../components/ui/Card";
import { ChartTooltip } from "../components/ui/ChartTooltip";
import { Select } from "../components/ui/Select";
import { RadioGroup } from "../components/ui/Tabs";
import { InteractiveLegend } from "../components/ui/InteractiveLegend";
import { KpiTile, TrendBadge } from "../components/ui/KpiBadge";
import { Sparkline } from "../components/ui/Sparkline";

const SERIES_COLORS = ["#1fb2de", "#f2a541", "#7c6fe0", "#2fb88a", "#e0637c", "#8a97a8", "#6dd3ec"];
const POLI_COLOR = "#0f385a";
const GOOD = "#1ea672";
const CRITICAL = "#e0637c";
const colorFor = (i) => SERIES_COLORS[i % SERIES_COLORS.length];
// serie secuencial (un solo tono, claro -> oscuro) para los 5 años de
// matrícula -- son la misma magnitud a lo largo del tiempo, no identidades
// distintas, así que llevan un solo hue en vez de colores categóricos.
const MATRICULA_YEAR_COLORS = ["#cbd5e1", "#93c5da", "#4bb8d8", "#1fb2de", "#0f385a"];

// eje X del comparativo de matrícula: nombre de la institución, resaltando
// al Poli en cian de marca para ubicarlo de un vistazo entre 10-11 barras.
function InstTick({ x, y, payload, isPoli }) {
  const poli = isPoli(payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text transform="rotate(-30)" textAnchor="end" dy={4} fontSize={11} fontWeight={poli ? 800 : 500} fill={poli ? POLI_COLOR : "#64748b"}>
        {payload.value}
      </text>
    </g>
  );
}

// etiqueta sobre cada barra de crecimiento -- color semántico por signo
// (verde/rojo), formateado según sea % o diferencia absoluta.
function GrowthBarLabel({ x, y, width, value, formatter }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <text x={x + width / 2} y={up ? y - 6 : y + 14} textAnchor="middle" fontSize={11} fontWeight={700} fill={up ? GOOD : CRITICAL}>
      {up ? "+" : ""}
      {formatter(value)}
    </text>
  );
}

// ¿el texto blanco se lee bien encima de este color, o hace falta uno oscuro?
function isLightColor(hex) {
  const h = String(hex ?? "").replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// valor de matrícula rotado 90° sobre cada barra: son 5 años x 11
// instituciones (barras angostas), así que horizontal no cabe. Si el número
// alcanza dentro de la barra va adentro (color según el fondo); si la barra
// es muy baja, va afuera justo encima, también vertical.
const MATRICULA_LABEL_FONT = 10;

function VerticalMatriculaLabel({ x, y, width, height, value, barColor }) {
  if (value == null || value === 0) return null;
  const text = fmt(value);
  // ancho real del texto ya rotado = su largo horizontal antes de girar.
  const textLength = text.length * MATRICULA_LABEL_FONT * 0.62;
  const fitsInside = height >= textLength + 10;
  const cx = x + width / 2;
  const cy = fitsInside ? y + height - 5 : y - 5;
  const fill = fitsInside ? (isLightColor(barColor) ? "#0f385a" : "#ffffff") : "#475569";
  return (
    <text
      x={cx}
      y={cy}
      transform={`rotate(-90, ${cx}, ${cy})`}
      textAnchor="start"
      dominantBaseline="central"
      fontSize={MATRICULA_LABEL_FONT}
      fontWeight={700}
      fill={fill}
    >
      {text}
    </text>
  );
}

// etiqueta sobre cada punto del HHI -- valor entero centrado sobre el punto.
function AreaPointLabel({ x, y, value }) {
  if (value == null) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#0f385a">
      {fmt(Math.round(value))}
    </text>
  );
}

// RECONOCIMIENTO_DEL_MINISTERIO trae texto libre -- se homologa a las 3
// categorías reales que reporta la fuente (ver etl/schemas.py).
function formatRegistro(v) {
  if (!v) return "—";
  const low = v.toLowerCase();
  if (low.includes("alta calidad")) return "Alta calidad";
  if (low.includes("previa")) return "Acreditación previa";
  return "Registro calificado";
}

export function MercadoCompetencia() {
  const { query, isPoli } = useDuckDB();
  const { filters } = useFilters();
  const [sede, setSede] = useState("");
  const [sedes, setSedes] = useState([]);
  const [grupo, setGrupo] = useState("");
  const [grupoOptions, setGrupoOptions] = useState([]);
  const [competencia, setCompetencia] = useState("");
  const [rows, setRows] = useState(null);
  const [detalle, setDetalle] = useState([]);
  const [growthPctSign, setGrowthPctSign] = useState("pos");
  const [growthAbsSign, setGrowthAbsSign] = useState("pos");
  const [hidden, setHidden] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await query(`SELECT DISTINCT sede FROM oferta_poli WHERE sede IS NOT NULL ORDER BY sede`);
      if (!cancelled) setSedes(r.map((x) => x.sede));
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sedeCond = sede ? ` AND op.sede = '${esc(sede)}'` : "";
      const r = await query(`
        SELECT DISTINCT poli.codigo_snies_programa AS id, poli.programa_academico AS nombre
        FROM (SELECT DISTINCT grupo_homologo FROM dim_programa WHERE grupo_homologo IS NOT NULL) g
        JOIN dim_programa poli ON poli.codigo_snies_programa = g.grupo_homologo
        JOIN dim_institucion pi ON poli.codigo_institucion = pi.codigo_institucion
        JOIN oferta_poli op ON op.codigo_snies_programa = g.grupo_homologo
        WHERE pi.institucion_completo ILIKE '%Grancolombiano%'${sedeCond}
        ORDER BY poli.programa_academico
      `);
      if (!cancelled) {
        setGrupoOptions(r);
        setGrupo((g) => (g && r.some((x) => String(x.id) === String(g)) ? g : ""));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, sede]);

  useEffect(() => {
    if (!grupo) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setRows(null);
    (async () => {
      const where = whereGrupo(filters, grupo, competencia);
      const r = await query(`
        SELECT anio, institucion, SUM(valor)::DOUBLE AS valor
        FROM v_mercado WHERE ${where} GROUP BY anio, institucion ORDER BY anio, institucion
      `);
      if (!cancelled) setRows(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters, grupo, competencia]);

  // detalle del programa (créditos, duración, tipo de registro, ciclo
  // propedéutico, convenio) por institución -- una fila por sede que ofrece
  // un programa homologado a este grupo. No depende de la métrica/filtros
  // globales: es información propia del programa, no de la matrícula.
  useEffect(() => {
    if (!grupo) {
      setDetalle([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await query(`
        SELECT
          i.institucion,
          MAX(p.duracion_periodos) AS duracion_periodos,
          MAX(p.creditos) AS creditos,
          MAX(p.reconocimiento_ministerio) AS reconocimiento_ministerio,
          BOOL_OR(p.ciclos_propedeuticos) AS ciclos_propedeuticos,
          BOOL_OR(p.programa_en_convenio) AS programa_en_convenio
        FROM dim_programa p
        JOIN dim_institucion i ON p.codigo_institucion = i.codigo_institucion
        WHERE p.grupo_homologo = ${grupo}
        GROUP BY i.institucion
      `);
      if (!cancelled) setDetalle(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, grupo]);

  useEffect(() => {
    setHidden(new Set());
  }, [grupo]);

  const derived = useMemo(() => {
    if (!rows || !rows.length) return null;
    const { anios, shareByYear, hhiByYear } = computeShareByYear(rows);
    const lastYear = anios[anios.length - 1];
    const prevYear = anios[anios.length - 2];
    const topInsts = pickTopInsts(shareByYear, anios, isPoli);
    const insts = [...new Set(rows.map((r) => r.institucion))];
    const growthAll = computeGrowthAll(insts, shareByYear, anios);
    const finalRanking = shareByYear.get(lastYear) ?? [];
    const hhiLast = Math.round(hhiByYear[hhiByYear.length - 1]?.hhi ?? 0);
    const hhiLabel = hhiLast > 2500 ? "Concentrado" : hhiLast > 1500 ? "Moderado" : "Competido";
    const poliRow = finalRanking.find((r) => isPoli(r.institucion));
    const poliGrowth = growthAll.find((r) => isPoli(r.institucion));
    const shareChartData = anios.map((a) => {
      const row = { anio: String(a) };
      for (const inst of topInsts) row[inst] = shareByYear.get(a)?.find((r) => r.institucion === inst)?.share ?? null;
      return row;
    });
    const hhiChartData = hhiByYear.map((r) => ({ anio: String(r.anio), hhi: Math.round(r.hhi) }));
    const pivot = pivotByYear(
      rows.map((r) => ({ ...r, total: r.valor })),
      ["institucion"]
    );
    const top10 = pickTopInsts(shareByYear, anios, isPoli, 10);
    const { data: matriculaChartData, years: matriculaYears } = pickMatriculaChartData(shareByYear, anios, top10, 5);
    return {
      anios,
      lastYear,
      prevYear,
      topInsts,
      growthAll,
      finalRanking,
      hhiLast,
      hhiLabel,
      poliRow,
      poliGrowth,
      shareChartData,
      hhiChartData,
      pivot,
      top10,
      matriculaChartData,
      matriculaYears,
    };
  }, [rows, isPoli]);

  const detalleByInst = useMemo(() => new Map(detalle.map((d) => [d.institucion, d])), [detalle]);

  const toggleSeries = (key) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const growthPct = derived ? pickGrowth(derived.growthAll, "growth", growthPctSign) : [];
  const growthAbs = derived ? pickGrowth(derived.growthAll, "dif", growthAbsSign) : [];

  return (
    <div className="flex flex-col gap-5">
      <Card
        icon={ArrowLeftRight}
        title="Mercado Competencia"
        subtitle="Un programa del Poli a la vez, frente a su competencia homologada: participación, posición, crecimiento, concentración e histórico por competidor. Usa siempre todo el histórico (ignora el filtro de año) y solo la métrica Primer Curso."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Select label="Sede POLI" value={sede} onChange={setSede} blankLabel="Todas" options={sedes} className="w-48" />
          <Select
            label="Programa del Poli"
            value={grupo}
            onChange={setGrupo}
            blankLabel="— ninguno —"
            options={grupoOptions.map((g) => ({ value: g.id, label: g.nombre }))}
            className="w-72"
          />
          <Select
            label="Competencia"
            value={competencia}
            onChange={setCompetencia}
            options={[
              { value: "", label: "Competencia total" },
              { value: "directa", label: "Directa" },
            ]}
            className="w-44"
          />
        </div>

        {!grupo ? (
          <div className="py-16 text-center text-sm text-slate-400">Selecciona un programa del Poli arriba para ver este análisis.</div>
        ) : !derived ? (
          <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-3">
            <KpiTile label={`Participación Poli (${derived.lastYear})`} value={derived.poliRow ? pct(derived.poliRow.share) : "—"} />
            <KpiTile
              label="Posición Poli"
              value={derived.poliRow ? `#${derived.poliRow.rank} / ${derived.finalRanking.length}` : "—"}
            />
            <KpiTile
              label="Crecimiento interanual Poli"
              value={derived.poliGrowth?.growth != null ? pct(derived.poliGrowth.growth) : "—"}
              delta={derived.poliGrowth?.growth}
            />
            <div className="min-w-[152px] flex-1 rounded-xl bg-white p-4 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">HHI del grupo ({derived.lastYear})</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-brand-navy-900">{derived.hhiLast}</span>
              </div>
              <div className="mt-2 text-xs font-medium text-slate-500">{derived.hhiLabel}</div>
            </div>
          </div>
        )}
      </Card>

      {derived && (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card icon={PieChart} title="Participación de mercado por año" subtitle="Top instituciones del grupo homólogo, más el Poli">
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={derived.shareChartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip formatter={(v) => pct(v)} />} cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }} />
                    <Legend content={() => null} />
                    {derived.topInsts.map((inst, i) => {
                      const poli = isPoli(inst);
                      return (
                        <Line
                          key={inst}
                          type="monotone"
                          dataKey={inst}
                          name={inst}
                          stroke={poli ? POLI_COLOR : colorFor(i)}
                          strokeWidth={poli ? 3 : 1.75}
                          dot={{ r: poli ? 3.5 : 2.5 }}
                          hide={hidden.has(inst)}
                          connectNulls
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <InteractiveLegend
                items={derived.topInsts.map((inst, i) => ({ key: inst, label: inst, color: isPoli(inst) ? POLI_COLOR : colorFor(i) }))}
                hidden={hidden}
                onToggle={toggleSeries}
              />
            </Card>

            <Card
              icon={TrendingUp}
              title="Concentración del mercado (HHI)"
              subtitle="Suma de las participaciones² de todos los competidores (0–10.000). <1.500 competido, 1.500–2.500 moderado, >2.500 concentrado."
            >
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <AreaChart data={derived.hhiChartData} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="hhiFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f385a" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0f385a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                    <YAxis domain={[0, 10000]} hide />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="hhi" name="HHI" stroke="#0f385a" fill="url(#hhiFill)" strokeWidth={2.5} dot={{ r: 3, fill: "#0f385a", strokeWidth: 0 }} isAnimationActive={false}>
                      <LabelList dataKey="hhi" content={<AreaPointLabel />} />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card
            icon={ListChecks}
            title="Matrículas nuevas por institución (últimos 5 años)"
            subtitle="Top 10 del grupo homólogo + Poli, con la ficha del programa por institución debajo (duración, créditos, tipo de registro, ciclo propedéutico y convenio)"
          >
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer>
                <BarChart data={derived.matriculaChartData} margin={{ top: 24, right: 16, bottom: 70, left: 0 }} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis
                    dataKey="institucion"
                    interval={0}
                    height={80}
                    tick={(p) => <InstTick {...p} isPoli={isPoli} />}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} cursor={{ fill: "rgba(31,178,222,0.06)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {derived.matriculaYears.map((y, i) => (
                    <Bar key={y} dataKey={y} name={String(y)} fill={MATRICULA_YEAR_COLORS[i]} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      <LabelList dataKey={y} content={<VerticalMatriculaLabel barColor={MATRICULA_YEAR_COLORS[i]} />} />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-1.5 text-left">Ficha del programa</th>
                    {derived.top10.map((inst) => (
                      <th key={inst} className={`px-3 py-1.5 text-center ${isPoli(inst) ? "text-brand-cyan" : ""}`}>
                        {inst}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-3 py-1.5 font-medium text-brand-navy-900">Duración (semestres)</td>
                    {derived.top10.map((inst) => (
                      <td key={inst} className="px-3 py-1.5 text-center tabular-nums">
                        {detalleByInst.get(inst)?.duracion_periodos ?? "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 font-medium text-brand-navy-900">Créditos</td>
                    {derived.top10.map((inst) => (
                      <td key={inst} className="px-3 py-1.5 text-center tabular-nums">
                        {detalleByInst.get(inst)?.creditos ?? "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 font-medium text-brand-navy-900">Tipo de registro</td>
                    {derived.top10.map((inst) => (
                      <td key={inst} className="px-3 py-1.5 text-center">
                        {formatRegistro(detalleByInst.get(inst)?.reconocimiento_ministerio)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 font-medium text-brand-navy-900">Ciclo propedéutico</td>
                    {derived.top10.map((inst) => (
                      <td key={inst} className="px-3 py-1.5 text-center">
                        {detalleByInst.get(inst)?.ciclos_propedeuticos ? "Sí" : "No"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 font-medium text-brand-navy-900">Convenio</td>
                    {derived.top10.map((inst) => (
                      <td key={inst} className="px-3 py-1.5 text-center">
                        {detalleByInst.get(inst)?.programa_en_convenio ? "Sí" : "No"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card
              title="Crecimiento interanual (%)"
              subtitle={`vs. ${derived.prevYear} → ${derived.lastYear}`}
              action={
                <RadioGroup
                  options={[
                    { value: "pos", label: "+" },
                    { value: "neg", label: "−" },
                  ]}
                  value={growthPctSign}
                  onChange={setGrowthPctSign}
                />
              }
            >
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={growthPct} margin={{ top: 24, right: 16, bottom: 48, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis
                      dataKey="institucion"
                      tick={{ fontSize: 10.5, fill: "#64748b" }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={64}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip formatter={(v) => pct(v)} labelFormatter={() => null} />} cursor={{ fill: "rgba(31,178,222,0.06)" }} />
                    <Bar dataKey="growth" name="Crecimiento" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {growthPct.map((d, i) => (
                        <Cell key={i} fill={d.growth >= 0 ? GOOD : CRITICAL} />
                      ))}
                      <LabelList dataKey="growth" content={<GrowthBarLabel formatter={pct} />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card
              title="Crecimiento interanual (diferencia absoluta)"
              subtitle={`vs. ${derived.prevYear} → ${derived.lastYear}`}
              action={
                <RadioGroup
                  options={[
                    { value: "pos", label: "+" },
                    { value: "neg", label: "−" },
                  ]}
                  value={growthAbsSign}
                  onChange={setGrowthAbsSign}
                />
              }
            >
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={growthAbs} margin={{ top: 24, right: 16, bottom: 48, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis
                      dataKey="institucion"
                      tick={{ fontSize: 10.5, fill: "#64748b" }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={64}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} labelFormatter={() => null} />} cursor={{ fill: "rgba(31,178,222,0.06)" }} />
                    <Bar dataKey="dif" name="Diferencia" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {growthAbs.map((d, i) => (
                        <Cell key={i} fill={d.dif >= 0 ? GOOD : CRITICAL} />
                      ))}
                      <LabelList dataKey="dif" content={<GrowthBarLabel formatter={fmt} />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card icon={Building2} title="Histórico y tendencia por competidor" subtitle={`vs. ${derived.prevYear} → ${derived.lastYear}`}>
            <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
              <table className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-1.5 text-left">Institución</th>
                    {derived.pivot.anios.map((a) => (
                      <th key={a} className="px-3 py-1.5 text-right tabular-nums">
                        {a}
                      </th>
                    ))}
                    <th className="px-3 py-1.5 text-right">
                      VAR {derived.pivot.lastYear} vs {derived.pivot.prevYear}
                    </th>
                    <th className="px-3 py-1.5 text-right">
                      DIF {derived.pivot.lastYear} vs {derived.pivot.prevYear}
                    </th>
                    <th className="px-3 py-1.5 text-left">Tendencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-brand-navy-50/70 font-semibold">
                    <td className="px-3 py-1.5">Subtotal — {derived.pivot.totalCount} instituciones</td>
                    {derived.pivot.subtotal.values.map((v, i) => (
                      <td key={i} className="px-3 py-1.5 text-right tabular-nums">
                        {fmt(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right">{derived.pivot.subtotal.varr == null ? "—" : <TrendBadge value={derived.pivot.subtotal.varr} />}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(derived.pivot.subtotal.dif)}</td>
                    <td className="px-3 py-1.5">
                      <Sparkline values={derived.pivot.subtotal.values} />
                    </td>
                  </tr>
                  {derived.pivot.entries.map((e) => (
                    <tr key={e.row.institucion} className={isPoli(e.row.institucion) ? "bg-brand-cyan-50/40" : ""}>
                      <td className="px-3 py-1.5">{e.row.institucion}</td>
                      {e.values.map((v, i) => (
                        <td key={i} className="px-3 py-1.5 text-right tabular-nums">
                          {fmt(v)}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right">{e.varr == null ? "—" : <TrendBadge value={e.varr} />}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(e.dif)}</td>
                      <td className="px-3 py-1.5">
                        <Sparkline values={e.values} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
