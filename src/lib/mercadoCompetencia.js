import { whereCommon } from "../state/FiltersContext";

// esta pestaña siempre usa Primer Curso (Matriculados mezcla estudiantes
// nuevos y antiguos, distorsionando la comparación de mercado) e ignora el
// filtro de año -- necesita todo el histórico para calcular tendencia/HHI.
export function whereGrupo(filters, grupo, competencia) {
  let w = whereCommon({ ...filters, metrica: "primer_curso" });
  if (grupo) w += ` AND grupo_homologo = ${grupo}`;
  if (competencia === "directa") w += ` AND competencia_directa`;
  return w;
}

// participación + ranking por año, y concentración (HHI) del grupo por año.
export function computeShareByYear(rows) {
  const anios = [...new Set(rows.map((r) => r.anio))].sort((a, b) => a - b);
  const byYear = new Map(anios.map((a) => [a, rows.filter((r) => r.anio === a)]));
  const shareByYear = new Map();
  const hhiByYear = [];
  for (const a of anios) {
    const yr = byYear.get(a);
    const total = yr.reduce((acc, r) => acc + Number(r.valor), 0);
    const withShare = yr
      .map((r) => ({ ...r, share: total ? Number(r.valor) / total : 0 }))
      .sort((x, y) => y.valor - x.valor)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    shareByYear.set(a, withShare);
    hhiByYear.push({ anio: a, hhi: withShare.reduce((acc, r) => acc + Math.pow(r.share * 100, 2), 0) });
  }
  return { anios, shareByYear, hhiByYear };
}

// top-7 instituciones por el último año (para no saturar el gráfico de
// líneas), siempre incluye al Poli aunque no esté entre las de mayor
// participación.
export function pickTopInsts(shareByYear, anios, isPoli, topN = 7) {
  const lastYear = anios[anios.length - 1];
  const finalRanking = shareByYear.get(lastYear) ?? [];
  const top = finalRanking.slice(0, topN).map((r) => r.institucion);
  if (!top.some(isPoli)) {
    const poli = finalRanking.find((r) => isPoli(r.institucion));
    if (poli) top.push(poli.institucion);
  }
  return top;
}

// crecimiento interanual (valor bruto, no participación) del último vs
// penúltimo año -- solo instituciones con dato en ambos años.
export function computeGrowthAll(insts, shareByYear, anios) {
  const lastYear = anios[anios.length - 1];
  const prevYear = anios[anios.length - 2];
  return insts
    .map((inst) => {
      const cur = shareByYear.get(lastYear)?.find((r) => r.institucion === inst);
      const prev = prevYear ? shareByYear.get(prevYear)?.find((r) => r.institucion === inst) : null;
      if (!cur || !prev) return null;
      const dif = cur.valor - prev.valor;
      return { institucion: inst, dif, growth: prev.valor ? dif / prev.valor : null };
    })
    .filter(Boolean);
}

export function pickGrowth(rows, key, sign, topN = 10) {
  const filtered = rows.filter((r) => r[key] != null && (sign === "pos" ? r[key] > 0 : r[key] < 0));
  filtered.sort((a, b) => (sign === "pos" ? b[key] - a[key] : a[key] - b[key]));
  return filtered.slice(0, topN);
}

// una fila por institución (en el mismo orden que `insts`, ver pickTopInsts),
// con la matrícula de cada uno de los últimos `yearsBack` años como columna
// -- para la gráfica de barras agrupadas por año dentro de cada institución.
export function pickMatriculaChartData(shareByYear, anios, insts, yearsBack = 5) {
  const years = anios.slice(-yearsBack);
  const data = insts.map((inst) => {
    const row = { institucion: inst };
    for (const a of years) row[a] = shareByYear.get(a)?.find((r) => r.institucion === inst)?.valor ?? 0;
    return row;
  });
  return { data, years };
}
