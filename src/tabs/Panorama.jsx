import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, TrendingUp, PieChart, ArrowLeftRight, Landmark } from "lucide-react";
import { useDuckDB } from "../lib/duckdb";
import { useFilters, whereCommon } from "../state/FiltersContext";
import { fmt, pct, esc, formatNivel } from "../lib/format";
import {
  resolvePrincipalesIES,
  resolveIESNames,
  SHARE_IES,
  buildTopIesSeries,
  buildSectorEvolution,
  buildIESShareEvolution,
  buildBridge,
  buildMercadoVsPoli,
  buildModalidadEvolution,
  buildModalidadMigracion,
  buildParetoComparison,
  buildNivelFormacionVariacion,
  MODALIDADES_MOSTRADAS,
} from "../lib/panorama";
import { Card } from "../components/ui/Card";
import { ChartTooltip } from "../components/ui/ChartTooltip";
import { TrendBadge } from "../components/ui/KpiBadge";
import { InteractiveLegend } from "../components/ui/InteractiveLegend";

// paleta para el share de IES (24 series fijas + Poli) -- tonos medio-oscuros
// elegidos a mano para que se distingan entre sí y para que el texto blanco
// de cada segmento se lea bien encima; el Poli siempre usa el cian de marca
// para reconocerlo de un vistazo, sin importar su posición en el orden.
const IES_SHARE_PALETTE = [
  "#0f385a", "#e0637c", "#f2a541", "#2fb88a", "#7c6fe0", "#d6336c", "#94670f", "#3b82f6",
  "#65a30d", "#64748b", "#b91c1c", "#0891b2", "#a21caf", "#ca8a04", "#15803d", "#6d28d9",
  "#be123c", "#0369a1", "#92400e", "#4d7c0f", "#86198f", "#1e40af", "#a16207", "#374151",
];
function buildShareColors(order, isPoli) {
  const colors = {};
  let n = 0;
  for (const name of order) {
    colors[name] = isPoli(name) ? "#1fb2de" : IES_SHARE_PALETTE[n++ % IES_SHARE_PALETTE.length];
  }
  return colors;
}

// etiqueta centrada dentro de cada segmento del share -- se omite en
// segmentos muy angostos (<1.5% o <12px) para no saturar de texto encimado.
function ShareSegmentLabel({ x, y, width, height, value }) {
  if (value == null || value < 0.015 || height < 12) return null;
  return (
    <text x={x + width / 2} y={y + height / 2} dy={3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#fff">
      {(value * 100).toFixed(1)}%
    </text>
  );
}

function DeltaCell({ value }) {
  if (value == null) return <span className="text-slate-300">—</span>;
  const sign = value >= 0 ? "+" : "";
  return <span className={`font-semibold tabular-nums ${value >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{sign}{(value * 100).toFixed(1)} pts</span>;
}

// etiqueta sobre cada barra de la comparación de concentración Pareto.
function ParetoCompareBarLabel({ x, y, width, value }) {
  if (value == null) return null;
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#1fb2de">
      {(value * 100).toFixed(1)}%
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

// etiqueta vertical (texto rotado -90°) sobre cada barra -- con dos barras
// (Oficial/Privado) muy juntas por año, un número horizontal se encimaría
// con el de la barra vecina. Si el número alcanza dentro de la barra va
// adentro (blanco o navy según qué tan clara sea esa barra); si la barra es
// muy baja para contenerlo, va justo encima, en el color de la serie.
function VerticalBarLabel({ x, y, width, height, value, fill }) {
  if (value == null) return null;
  const text = fmt(value);
  const textLength = text.length * 10 * 0.62;
  const fitsInside = height >= textLength + 10;
  const cx = x + width / 2;
  const cy = fitsInside ? y + height - 5 : y - 5;
  const textFill = fitsInside ? (isLightColor(fill) ? "#0f385a" : "#ffffff") : fill;
  return (
    <text x={cx} y={cy} transform={`rotate(-90, ${cx}, ${cy})`} textAnchor="start" dominantBaseline="central" fontSize={10} fontWeight={700} fill={textFill}>
      {text}
    </text>
  );
}

// etiqueta horizontal centrada sobre cada punto de una línea -- los puntos
// van más espaciados entre sí que las barras, así que aquí sí cabe sin rotar.
function LinePointLabel({ x, y, value, fill }) {
  if (value == null) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={fill}>
      {fmt(value)}
    </text>
  );
}

const YEAR_COLORS = ["#cbd5e1", "#6dd3ec", "#1fb2de"];
const SECTOR_COLORS = { Oficial: "#0f385a", Privado: "#1fb2de" };
const MERCADO_COLOR = "#0f385a";
const POLI_COLOR = "#1fb2de";
const SHARE_COLOR = "#d6336c";
const GOOD = "#1ea672";
const CRITICAL = "#e0637c";
const MODALIDAD_COLORS = { Presencial: MERCADO_COLOR, Virtual: POLI_COLOR, "A distancia": SHARE_COLOR, Hibrida: "#f2a541" };
// mismos colores que NIVEL_COLORS en Oferta.jsx -- un nivel de formación
// siempre se lee del mismo color en cualquier pestaña de la app. Los 3 que
// no están aquí (Especializacion Tecnico Profesional/Tecnologica/Medico
// Quirurgica) son marginales -- caen al gris neutro de respaldo.
const NIVEL_FORMACION_COLORS = {
  Universitario: "#0f385a",
  "Especializacion Universitaria": "#f2a541",
  Maestria: "#e0637c",
  Tecnologico: "#1fb2de",
  Doctorado: "#2fb88a",
  "Formacion Tecnica Profesional": "#7c6fe0",
};

// etiqueta de variación % sobre cada barra -- color semántico por signo
// (verde/rojo), igual que el resto de gráficas de crecimiento de la app.
function VariationBarLabel({ x, y, width, value }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <text x={x + width / 2} y={up ? y - 6 : y + 14} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={up ? GOOD : CRITICAL}>
      {up ? "+" : ""}
      {(value * 100).toFixed(1)}%
    </text>
  );
}

function GrowthLabel({ x, y, width, index, data }) {
  const d = data?.[index];
  if (!d) return null;
  const up = d.dif >= 0;
  const color = up ? GOOD : CRITICAL;
  const pctText = d.growth == null ? "s/d" : `${up ? "+" : ""}${(d.growth * 100).toFixed(1)}%`;
  const difText = `${up ? "+" : ""}${fmt(d.dif)}`;
  return (
    <g transform={`translate(${x + width / 2}, ${y - 24})`} textAnchor="middle">
      <text fontSize={12.5} fontWeight={800} fill={color}>
        {pctText}
      </text>
      <text dy={13} fontSize={10.5} fontWeight={700} fill={color}>
        {difText}
      </text>
    </g>
  );
}

function LabelListSafe({ data }) {
  return <LabelList content={(props) => <GrowthLabel {...props} data={data} />} />;
}

// etiqueta del "puente": barra sólida (total año) en navy con solo el valor,
// barra flotante (institución/"Otros") con %+diferencia coloreados por signo.
function BridgeLabel({ x, y, width, index, data }) {
  const d = data?.[index];
  if (!d) return null;
  const cx = x + width / 2;
  if (d.kind === "total") {
    return (
      <text x={cx} y={y - 10} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={MERCADO_COLOR}>
        {fmt(d.total)}
      </text>
    );
  }
  const up = d.dif >= 0;
  const color = up ? GOOD : CRITICAL;
  const pctText = d.growth == null ? "" : `${up ? "+" : ""}${(d.growth * 100).toFixed(1)}%`;
  const difText = `${up ? "+" : ""}${fmt(d.dif)}`;
  return (
    <g transform={`translate(${cx}, ${y - 22})`} textAnchor="middle">
      {pctText && (
        <text fontSize={10} fontWeight={700} fill={color}>
          {pctText}
        </text>
      )}
      <text dy={pctText ? 12 : 0} fontSize={9.5} fontWeight={600} fill={color}>
        {difText}
      </text>
    </g>
  );
}

// eje X del puente: rotula "O"/"P" (Oficial/Privado) coloreado antes del
// nombre, como en el diseño original -- los años y los buckets "Otros" van
// sin marca de sector.
function BridgeTick({ x, y, payload, data }) {
  const d = data?.[payload.index];
  const sector = d?.sector;
  const tagColor = sector === "Oficial" ? MERCADO_COLOR : sector === "Privado" ? POLI_COLOR : null;
  const tag = sector === "Oficial" ? "O  " : sector === "Privado" ? "P  " : "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text transform="rotate(-40)" textAnchor="end" dy={4} fontSize={10.5}>
        {tag && (
          <tspan fill={tagColor} fontWeight={700}>
            {tag}
          </tspan>
        )}
        <tspan fill="#475569">{payload.value}</tspan>
      </text>
    </g>
  );
}

function BridgeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const value = d.kind === "total" ? d.total : d.delta;
  return (
    <div className="min-w-[140px] rounded-xl border border-slate-200/70 bg-white/85 p-3 shadow-xl shadow-brand-navy-900/10 backdrop-blur-md">
      <div className="mb-1 text-xs font-semibold text-slate-500">{d.label}</div>
      <div className="text-[13px] font-semibold tabular-nums text-brand-navy-900">{fmt(value)}</div>
    </div>
  );
}

// etiqueta "píldora" centrada EN el punto de la línea (no flotando encima) --
// fondo redondeado + texto blanco coloreado por serie, como un callout de
// dato (Share, modalidades).
function PillLabel({ x, y, value, color }) {
  if (value == null) return null;
  const text = pct(value);
  const w = 15 + text.length * 6.2;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-w / 2} y={-11} width={w} height={20} rx={10} fill={color} />
      <text textAnchor="middle" dy={3.5} fontSize={11} fontWeight={700} fill="#fff">
        {text}
      </text>
    </g>
  );
}

// etiqueta sobre cada barra Mercado/Poli: valor total + crecimiento
// interanual coloreado (se omite el % en el primer año, sin año anterior).
// Poli va alineada a la derecha y desplazada fuera de la barra -- al ser tan
// angosta, un texto centrado queda tapado por la barra de Mercado contigua.
function ValueGrowthLabel({ x, y, width, index, data, dataKey, color, fontSize = 11 }) {
  const d = data?.[index];
  if (!d) return null;
  const growth = dataKey === "mercado" ? d.mercadoGrowth : d.poliGrowth;
  const value = d[dataKey];
  const isPoli = dataKey === "poli";
  const tx = isPoli ? x + width + 5 : x + width / 2;
  const anchor = isPoli ? "start" : "middle";
  return (
    <g transform={`translate(${tx}, ${y - (growth == null ? 8 : 22)})`} textAnchor={anchor}>
      <text fontSize={fontSize} fontWeight={700} fill={color}>
        {fmt(value)}
      </text>
      {growth != null && (
        <text dy={13} fontSize={fontSize - 1.5} fontWeight={600} fill={growth >= 0 ? GOOD : CRITICAL}>
          {growth >= 0 ? "+" : ""}
          {(growth * 100).toFixed(1)}%
        </text>
      )}
    </g>
  );
}

export function Panorama() {
  const { query, isPoli, poliName } = useDuckDB();
  const { filters } = useFilters();
  const [rows, setRows] = useState([]);
  const [resolvedNames, setResolvedNames] = useState([]);
  const [resolvedShareNames, setResolvedShareNames] = useState([]);
  const [modalidadRows, setModalidadRows] = useState([]);
  const [hiddenIES, setHiddenIES] = useState(new Set());
  const [paretoCompareRows, setParetoCompareRows] = useState([]);
  const [paretoN, setParetoN] = useState(10);
  const [nivelFormacionRows, setNivelFormacionRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const where = whereCommon(filters);
      const [r, names, shareNames, modRows] = await Promise.all([
        query(`
          SELECT anio, institucion, sector_ies, SUM(valor)::DOUBLE AS valor
          FROM v_mercado WHERE ${where}
          GROUP BY anio, institucion, sector_ies
          ORDER BY anio
        `),
        resolvePrincipalesIES(query, poliName),
        resolveIESNames(query, poliName, SHARE_IES),
        query(`
          SELECT anio, nivel_formacion, metodologia, SUM(valor)::DOUBLE AS valor
          FROM v_mercado WHERE ${where}
          GROUP BY anio, nivel_formacion, metodologia
          ORDER BY anio
        `),
      ]);
      if (!cancelled) {
        setRows(r);
        setResolvedNames(names);
        setResolvedShareNames(shareNames);
        setModalidadRows(modRows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters, poliName]);

  // matrículas NUEVAS (Primer Curso, fijo -- no depende del toggle global de
  // métrica) por nivel de formación, para la variación % año contra año.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const where = whereCommon({ ...filters, metrica: "primer_curso" });
      const r = await query(`
        SELECT anio, nivel_formacion, SUM(valor)::DOUBLE AS valor
        FROM v_mercado WHERE ${where}
        GROUP BY anio, nivel_formacion
        ORDER BY anio
      `);
      if (!cancelled) setNivelFormacionRows(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters]);

  // concentración Pareto por programa (codigo_snies_programa) de las mismas
  // 15 principales IES del gráfico de arriba -- consulta aparte porque
  // depende de resolvedNames (nombres ya resueltos en la consulta anterior).
  useEffect(() => {
    if (!resolvedNames.length) return;
    let cancelled = false;
    (async () => {
      const where = whereCommon(filters);
      const inList = resolvedNames.map((n) => `'${esc(n)}'`).join(",");
      const r = await query(`
        SELECT anio, institucion, codigo_snies_programa, SUM(valor)::DOUBLE AS valor
        FROM v_mercado WHERE ${where} AND institucion IN (${inList})
        GROUP BY anio, institucion, codigo_snies_programa
      `);
      if (!cancelled) setParetoCompareRows(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters, resolvedNames]);

  const anios = useMemo(() => [...new Set(rows.map((r) => r.anio))].sort((a, b) => a - b), [rows]);
  const lastYear = anios[anios.length - 1];
  const prevYear = anios[anios.length - 2];

  const { data: topIesData, years3 } = useMemo(
    () => (rows.length ? buildTopIesSeries(rows, resolvedNames, lastYear, prevYear, anios) : { data: [], years3: [] }),
    [rows, resolvedNames, lastYear, prevYear, anios]
  );
  const sectorEvo = useMemo(() => (rows.length ? buildSectorEvolution(rows, anios) : { sectors: [], abs: [], share: [], totalGrowth: null }), [rows, anios]);
  const iesShare = useMemo(
    () => (rows.length ? buildIESShareEvolution(rows, anios, resolvedShareNames, isPoli) : { data: [], order: [] }),
    [rows, anios, resolvedShareNames, isPoli]
  );
  const shareColors = useMemo(() => buildShareColors(iesShare.order, isPoli), [iesShare.order, isPoli]);
  const toggleIES = (key) =>
    setHiddenIES((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const modalidadEvo = useMemo(() => (modalidadRows.length ? buildModalidadEvolution(modalidadRows, anios) : []), [modalidadRows, anios]);
  const modalidadMigracion = useMemo(
    () => (modalidadRows.length ? buildModalidadMigracion(modalidadRows, anios) : { items: [] }),
    [modalidadRows, anios]
  );
  const nivelFormacionAnios = useMemo(
    () => [...new Set(nivelFormacionRows.map((r) => r.anio))].sort((a, b) => a - b),
    [nivelFormacionRows]
  );
  const nivelFormacionVariacion = useMemo(
    () => (nivelFormacionRows.length ? buildNivelFormacionVariacion(nivelFormacionRows, nivelFormacionAnios) : { niveles: [], variation: [] }),
    [nivelFormacionRows, nivelFormacionAnios]
  );
  // mismo orden de tamaño que el gráfico "Principales IES" de arriba, para
  // poder comparar ambos gráficos a simple vista.
  const paretoOrder = useMemo(() => topIesData.map((d) => d.institucion), [topIesData]);
  const paretoCompare = useMemo(
    () => (paretoCompareRows.length ? buildParetoComparison(paretoCompareRows, lastYear, paretoOrder) : []),
    [paretoCompareRows, lastYear, paretoOrder]
  );
  const paretoShareKey = `top${paretoN}Share`;
  const paretoCompareSorted = useMemo(
    () => [...paretoCompare].sort((a, b) => b[paretoShareKey] - a[paretoShareKey]),
    [paretoCompare, paretoShareKey]
  );
  const bridge = useMemo(
    () => (rows.length ? buildBridge(rows, lastYear, prevYear) : { chartData: [], axisMin: 0, axisMax: 0, summary: {} }),
    [rows, lastYear, prevYear]
  );
  const mercadoVsPoli = useMemo(() => (rows.length ? buildMercadoVsPoli(rows, anios, isPoli) : []), [rows, anios, isPoli]);
  const shareAxisMax = useMemo(() => {
    const maxShare = Math.max(0, ...mercadoVsPoli.map((d) => d.share ?? 0));
    return maxShare ? maxShare * 2.4 : 0.1;
  }, [mercadoVsPoli]);
  // Mercado y Poli van cada uno en su propia escala oculta -- si Poli usara
  // el mismo eje 1:1 su barra sería una raya invisible (es ~2-3% del
  // mercado). El techo de Poli se fija para que su barra más alta ocupe una
  // fracción fija y visible del alto del gráfico (POLI_HEIGHT_FRACTION) --
  // ni casi invisible, ni casi del tamaño de Mercado.
  const valorAxisMax = useMemo(() => {
    const maxMercado = Math.max(0, ...mercadoVsPoli.map((d) => d.mercado ?? 0));
    return maxMercado ? maxMercado * 1.15 : 1;
  }, [mercadoVsPoli]);
  const POLI_HEIGHT_FRACTION = 0.42;
  const poliAxisMax = useMemo(() => {
    const maxPoli = Math.max(0, ...mercadoVsPoli.map((d) => d.poli ?? 0));
    return maxPoli ? maxPoli / POLI_HEIGHT_FRACTION : 1;
  }, [mercadoVsPoli]);

  if (!rows.length) {
    return <div className="py-16 text-center text-sm text-slate-400">Cargando panorama…</div>;
  }

  const { summary } = bridge;

  return (
    <div className="flex flex-col gap-5">
      <Card
        icon={BarChart3}
        title="Principales IES"
        subtitle={`Últimos ${years3.length} años disponibles (${years3.join(", ")}) — se ajusta solo al último año en los datos.`}
      >
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <BarChart data={topIesData} margin={{ top: 36, right: 12, bottom: 8, left: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="#eef2f6" />
              <XAxis
                dataKey="institucion"
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {years3.map((y, i) => (
                <Bar key={y} dataKey={String(y)} name={String(y)} fill={YEAR_COLORS[i]} radius={i === years3.length - 1 ? [4, 4, 0, 0] : [2, 2, 0, 0]}>
                  {i === years3.length - 1 && <LabelListSafe data={topIesData} />}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          icon={PieChart}
          title="Concentración de programas por IES (Pareto)"
          subtitle={`Qué % de la matrícula de cada institución (${fmt(lastYear)}) depende de sus programas más grandes, por código SNIES (no por nombre) — mismas 15 IES del gráfico anterior`}
          action={
            <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 text-[12px] font-medium">
              {[5, 10, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setParetoN(n)}
                  className={`rounded-md px-2.5 py-1 ${paretoN === n ? "bg-brand-navy-900 text-white" : "text-slate-500 hover:text-brand-navy-900"}`}
                >
                  Top {n}
                </button>
              ))}
            </div>
          }
        >
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <BarChart data={paretoCompareSorted} margin={{ top: 28, right: 12, bottom: 8, left: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis
                  dataKey="institucion"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={56}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <YAxis domain={[0, 1]} hide />
                <Tooltip
                  content={<ChartTooltip formatter={(v, name, p) => `${pct(v)} · ${fmt(p.payload.totalPrograms)} programas`} />}
                  cursor={{ fill: "rgba(31,178,222,0.06)" }}
                />
                <Bar dataKey={paretoShareKey} name={`Top ${paretoN}`} fill={POLI_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey={paretoShareKey} content={<ParetoCompareBarLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          icon={TrendingUp}
          title="Variación de matrículas nuevas por nivel de formación"
          subtitle={`Primer Curso, año contra año${
            nivelFormacionVariacion.variation.length
              ? ` (${nivelFormacionVariacion.variation[0].anio}-${nivelFormacionVariacion.variation[nivelFormacionVariacion.variation.length - 1].anio})`
              : ""
          } — pasa el cursor sobre una barra para ver la diferencia absoluta vs. el año anterior. No incluye Especialización Tecnológica, Médico Quirúrgica ni Técnico Profesional (marginales)`}
        >
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <BarChart data={nivelFormacionVariacion.variation} margin={{ top: 28, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  content={
                    <ChartTooltip
                      formatter={(v, name, p) => {
                        const diff = p.payload[`${p.dataKey}__abs`];
                        return `${pct(v)} · ${diff >= 0 ? "+" : ""}${fmt(diff)}`;
                      }}
                    />
                  }
                  cursor={{ fill: "rgba(31,178,222,0.06)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {nivelFormacionVariacion.niveles.map((n) => (
                  <Bar key={n} dataKey={n} name={formatNivel(n)} fill={NIVEL_FORMACION_COLORS[n] ?? "#94a3b8"} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey={n} content={<VariationBarLabel />} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card
        icon={PieChart}
        title="Participación de las principales IES"
        subtitle="Top 10 + Poli dentro de un universo fijo de 25 IES rastreadas (varía según los filtros aplicados), por año — barras apiladas al 100% para comparar años entre sí; el % de cada segmento es su share real sobre el total nacional, no sobre la suma del grupo mostrado"
      >
        <div style={{ width: "100%", height: 460 }}>
          <ResponsiveContainer>
            <BarChart data={iesShare.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke="#eef2f6" />
              <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis domain={[0, 1]} hide />
              <Tooltip
                shared={false}
                content={
                  <ChartTooltip
                    formatter={(v, name, p) => `${pct(p.payload.trueShare?.[name] ?? v)} · ${fmt(p.payload.trueAbs?.[name])}`}
                  />
                }
                cursor={{ fill: "rgba(31,178,222,0.06)" }}
              />
              {/* iesShare.order va de mayor a menor (para leyenda/colores) --
                  se invierte solo para el apilado, así la barra queda de
                  abajo hacia arriba en orden ascendente por el último año. */}
              {[...iesShare.order].reverse().map((name) => (
                <Bar key={name} dataKey={name} name={name} stackId="ies-share" fill={shareColors[name]} hide={hiddenIES.has(name)}>
                  <LabelList dataKey={name} content={(p) => <ShareSegmentLabel {...p} value={iesShare.data[p.index]?.trueShare?.[name]} />} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <InteractiveLegend
          items={iesShare.order.map((name) => ({ key: name, label: name, color: shareColors[name] }))}
          hidden={hiddenIES}
          onToggle={toggleIES}
        />
      </Card>

      <Card icon={Landmark} title="Mercado vs. Poli" subtitle="Tamaño total del mercado nacional frente al Poli, con crecimiento interanual y participación (share) por año">
        <div style={{ width: "100%", height: 380 }}>
          <ResponsiveContainer>
            <ComposedChart data={mercadoVsPoli} margin={{ top: 44, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke="#eef2f6" />
              <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis yAxisId="valor" domain={[0, valorAxisMax]} hide />
              <YAxis yAxisId="poli" domain={[0, poliAxisMax]} hide />
              <YAxis yAxisId="share" orientation="right" domain={[0, shareAxisMax]} hide />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(v, name) => (name === "Participación" ? pct(v) : fmt(v))}
                  />
                }
                cursor={{ fill: "rgba(31,178,222,0.06)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} payload={[
                { value: "Mercado", type: "square", color: MERCADO_COLOR },
                { value: "Poli", type: "square", color: POLI_COLOR },
                { value: "Share", type: "line", color: SHARE_COLOR },
              ]} />
              <Bar yAxisId="valor" dataKey="mercado" name="Mercado" fill={MERCADO_COLOR} radius={[4, 4, 0, 0]} barSize={36}>
                <LabelList content={(p) => <ValueGrowthLabel {...p} data={mercadoVsPoli} dataKey="mercado" color={MERCADO_COLOR} />} />
              </Bar>
              <Bar yAxisId="poli" dataKey="poli" name="Poli" fill={POLI_COLOR} radius={[3, 3, 0, 0]} barSize={24}>
                <LabelList content={(p) => <ValueGrowthLabel {...p} data={mercadoVsPoli} dataKey="poli" color={POLI_COLOR} />} />
              </Bar>
              <Line
                yAxisId="share"
                type="monotone"
                dataKey="share"
                name="Participación"
                stroke={SHARE_COLOR}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: SHARE_COLOR, strokeWidth: 0 }}
                label={<PillLabel color={SHARE_COLOR} />}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card icon={TrendingUp} title="Evolución por sector" subtitle="Valores absolutos, con el crecimiento del último año">
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={sectorEvo.abs} margin={{ top: 56, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} cursor={{ fill: "rgba(31,178,222,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {sectorEvo.sectors.map((s) => {
                  const color = SECTOR_COLORS[s] ?? "#94a3b8";
                  return (
                    <Bar key={s} dataKey={s} name={s} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      <LabelList dataKey={s} content={<VerticalBarLabel fill={color} />} />
                    </Bar>
                  );
                })}
                <Line type="monotone" dataKey="Total" name="Total" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
                  <LabelList dataKey="Total" content={<LinePointLabel fill="#0f172a" />} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {sectorEvo.totalGrowth != null && (
            <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-500">
              Crecimiento total {lastYear}
              <TrendBadge value={sectorEvo.totalGrowth} />
            </div>
          )}
        </Card>

        <Card icon={PieChart} title="Participación" subtitle="Porcentaje de cada sector sobre el total nacional, por año">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={sectorEvo.share} margin={{ top: 24, right: 16, bottom: 0, left: 16 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis hide domain={["dataMin - 0.05", "dataMax + 0.05"]} />
                <Tooltip content={<ChartTooltip formatter={(v) => pct(v)} />} cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {sectorEvo.sectors.map((s) => (
                  <Line
                    key={s}
                    type="monotone"
                    dataKey={s}
                    name={s}
                    stroke={SECTOR_COLORS[s] ?? "#94a3b8"}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: SECTOR_COLORS[s] ?? "#94a3b8", strokeWidth: 0 }}
                    label={<PillLabel color={SECTOR_COLORS[s] ?? "#94a3b8"} />}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card icon={TrendingUp} title="Evolución por modalidad" subtitle="Participación de cada modalidad sobre el total nacional, por año">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <LineChart data={modalidadEvo} margin={{ top: 24, right: 16, bottom: 0, left: 16 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="anio" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis hide domain={["dataMin - 0.08", "dataMax + 0.08"]} />
                <Tooltip content={<ChartTooltip formatter={(v) => pct(v)} />} cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {MODALIDADES_MOSTRADAS.map((m) => (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={m}
                    name={m}
                    stroke={MODALIDAD_COLORS[m]}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: MODALIDAD_COLORS[m], strokeWidth: 0 }}
                    label={<PillLabel color={MODALIDAD_COLORS[m]} />}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Migración de modalidad — % Presencial por nivel de formación, {anios[0]} vs. {lastYear}
            </h4>
            <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-1.5 text-left">Nivel de formación</th>
                    <th className="px-3 py-1.5 text-right">%Presencial {anios[0]}</th>
                    <th className="px-3 py-1.5 text-right">%Presencial {lastYear}</th>
                    <th className="px-3 py-1.5 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modalidadMigracion.items.map((d) => (
                    <tr key={d.nivel} className="hover:bg-slate-50/80">
                      <td className="px-3 py-1.5 font-medium text-brand-navy-900">{formatNivel(d.nivel)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{d.sharePresF == null ? "—" : pct(d.sharePresF)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{d.sharePresL == null ? "—" : pct(d.sharePresL)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <DeltaCell value={d.deltaPresencial} />
                      </td>
                    </tr>
                  ))}
                  {!modalidadMigracion.items.length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                        Cargando…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Ordenado por mayor migración fuera de Presencial.</p>
          </div>
        </div>
      </Card>

      <Card
        icon={ArrowLeftRight}
        title="Quiénes más ganan y más pierden matrícula"
        subtitle={`Puente ${prevYear} → ${lastYear}: top 10 que más crecen, top 10 que más decrecen, y "Otros" agregando el resto`}
        action={
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {summary.growersTotal} crecieron ({summary.growersTotal - summary.growersOficial} priv. / {summary.growersOficial} of.)
            </span>
            <span className="flex items-center gap-1.5 font-medium text-rose-600">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> {summary.declinersTotal} decrecieron ({summary.declinersTotal - summary.declinersOficial} priv. / {summary.declinersOficial} of.)
            </span>
          </div>
        }
      >
        <div style={{ width: "100%", height: 460 }}>
          <ResponsiveContainer>
            <BarChart data={bridge.chartData} margin={{ top: 44, right: 12, bottom: 92, left: 8 }} barCategoryGap="2%" maxBarSize={46}>
              <CartesianGrid vertical={false} stroke="#eef2f6" />
              <XAxis dataKey="label" interval={0} height={90} tick={<BridgeTick data={bridge.chartData} />} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis domain={[bridge.axisMin, bridge.axisMax]} allowDataOverflow hide />
              <Tooltip content={<BridgeTooltip />} cursor={{ fill: "rgba(31,178,222,0.06)" }} />
              <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="delta" stackId="wf" radius={[3, 3, 0, 0]}>
                <LabelList content={(p) => <BridgeLabel {...p} data={bridge.chartData} />} />
                {bridge.chartData.map((d, i) => (
                  <Cell key={i} fill={d.kind === "total" ? MERCADO_COLOR : d.dif >= 0 ? GOOD : CRITICAL} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
