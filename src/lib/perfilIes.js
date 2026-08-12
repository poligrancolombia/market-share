import { esc, NIVEL_FORMACION_ORDER, NIVEL_ACADEMICO_ORDER, MODALIDAD_ORDER } from "./format";
import { TEXT_FILTERS, sqlIn, sqlInNum } from "../state/FiltersContext";

function orderIndex(order, value) {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

// WHERE de esta pestaña: SIEMPRE una sola institución, respeta el resto de
// filtros globales (sector, departamento, nivel, modalidad, semestre) pero
// IGNORA año (se necesita todo el histórico) y NO fija métrica -- se traen
// Primer Curso y Matriculados juntos en una sola consulta y se separan en JS.
export function whereInstitucion(filters, institucion) {
  let w = `institucion = '${esc(institucion)}'`;
  w += sqlInNum("semestre", filters.semestre);
  for (const { key, col } of TEXT_FILTERS) w += sqlIn(col, filters[key]);
  return w;
}

// una entrada por programa (codigo_snies_programa) de UNA métrica: historial
// de matrícula por año + su nivel/modalidad (se asumen estables en el tiempo).
// Matriculados es una foto por semestre (no un acumulado como Primer Curso):
// sumar semestre 1 + 2 duplicaría la matrícula. El corte oficial de cada año
// es semestre 2 -- se aplica solo si el usuario no fijó ya un semestre
// explícito en los filtros globales (en ese caso se respeta su elección).
export function applyMatriculadosCutoff(rows, filters) {
  if (filters.semestre?.length) return rows;
  return rows.filter((r) => r.metrica !== "matriculados" || Number(r.semestre) === 2);
}

function groupByPrograma(rows, metrica) {
  const byPrograma = new Map();
  for (const r of rows) {
    if (r.metrica !== metrica) continue;
    if (!byPrograma.has(r.codigo_snies_programa)) {
      byPrograma.set(r.codigo_snies_programa, {
        programa: r.programa_academico,
        nivel: r.nivel_formacion,
        modalidad: r.metodologia,
        years: {},
      });
    }
    const p = byPrograma.get(r.codigo_snies_programa);
    p.years[r.anio] = (p.years[r.anio] ?? 0) + r.valor;
  }
  return byPrograma;
}

// tabla nivel x modalidad: último año vs penúltimo, var % y var absoluta,
// para UNA métrica (Primer Curso o Matriculados). `levelField` alterna entre
// el resumen ("nivel_academico": Pregrado/Posgrado) y el desglose
// ("nivel_formacion"); el orden de filas es SIEMPRE fijo -- primero por
// modalidad (MODALIDAD_ORDER), luego por nivel (NIVEL_*_ORDER) -- nunca por
// volumen de matrícula.
export function buildNivelModalidadYoY(rows, metrica, lastYear, prevYear, levelField = "nivel_formacion") {
  const order = levelField === "nivel_academico" ? NIVEL_ACADEMICO_ORDER : NIVEL_FORMACION_ORDER;
  const map = new Map();
  for (const r of rows) {
    if (r.metrica !== metrica) continue;
    if (r.anio !== lastYear && r.anio !== prevYear) continue;
    const nivel = r[levelField];
    const k = `${nivel}‧${r.metodologia}`;
    if (!map.has(k)) map.set(k, { key: k, nivel, modalidad: r.metodologia, last: 0, prev: 0 });
    const row = map.get(k);
    if (r.anio === lastYear) row.last += r.valor;
    else row.prev += r.valor;
  }
  const rowsOut = [...map.values()]
    .map((r) => ({ ...r, dif: r.last - r.prev, growth: r.prev ? (r.last - r.prev) / r.prev : null }))
    .sort((a, b) => orderIndex(MODALIDAD_ORDER, a.modalidad) - orderIndex(MODALIDAD_ORDER, b.modalidad) || orderIndex(order, a.nivel) - orderIndex(order, b.nivel));
  const total = rowsOut.reduce((acc, r) => ({ last: acc.last + r.last, prev: acc.prev + r.prev }), { last: 0, prev: 0 });
  return {
    rows: rowsOut,
    total: { ...total, dif: total.last - total.prev, growth: total.prev ? (total.last - total.prev) / total.prev : null },
  };
}

// crecimiento por programa (último año vs penúltimo) para UNA métrica --
// separado en los que más crecen y los que más decrecen (diferencia
// absoluta), con el conteo total de cada lado.
export function buildProgramGrowth(rows, metrica, lastYear, prevYear, topN = 10) {
  const byPrograma = groupByPrograma(rows, metrica);
  const items = [...byPrograma.values()]
    .map((p) => {
      const last = p.years[lastYear] ?? 0;
      const prev = p.years[prevYear] ?? 0;
      return { programa: p.programa, nivel: p.nivel, modalidad: p.modalidad, last, prev, dif: last - prev, growth: prev ? (last - prev) / prev : null };
    })
    .filter((p) => p.dif !== 0);
  const growers = items.filter((p) => p.dif > 0).sort((a, b) => b.dif - a.dif);
  const decliners = items.filter((p) => p.dif < 0).sort((a, b) => a.dif - b.dif);
  return {
    growers: growers.slice(0, topN),
    decliners: decliners.slice(0, topN),
    growersCount: growers.length,
    declinersCount: decliners.length,
  };
}

// programas nuevos: matrícula > 0 en el último año, CERO en todos los años
// anteriores (nunca antes tuvieron matrícula) -- para UNA métrica. Orden por
// volumen de matrícula (mayor a menor): esta tabla sí es sobre cantidades,
// a diferencia de las demás tablas de la pestaña que van por nivel/modalidad.
export function buildNuevosProgramas(rows, metrica, anios, lastYear, topN = 10) {
  const byPrograma = groupByPrograma(rows, metrica);
  const priorYears = anios.filter((a) => a !== lastYear);
  const nuevos = [...byPrograma.values()]
    .map((p) => ({ programa: p.programa, nivel: p.nivel, modalidad: p.modalidad, nuevos: p.years[lastYear] ?? 0, years: p.years }))
    .filter((p) => p.nuevos > 0 && priorYears.every((a) => !((p.years[a] ?? 0) > 0)));
  nuevos.sort((a, b) => b.nuevos - a.nuevos);
  const total = nuevos.reduce((acc, p) => acc + p.nuevos, 0);
  return { count: nuevos.length, total, items: nuevos.slice(0, topN) };
}

// evolución de participación nacional de una IES, por año -- reutiliza el
// share/rank ya calculado a nivel nacional (computeShareByYear de
// lib/mercadoCompetencia.js) sobre TODAS las instituciones.
export function buildShareEvolutionForInst(shareByYear, anios, institucion) {
  return anios.map((a) => {
    const row = shareByYear.get(a)?.find((r) => r.institucion === institucion);
    return { anio: String(a), share: row?.share ?? null, valor: row?.valor ?? null, rank: row?.rank ?? null };
  });
}

// concentración tipo Pareto: del último año de la institución, qué % de la
// matrícula depende de sus programas más grandes (por codigo_snies_programa,
// no por nombre -- una misma IES puede repetir "Adm. de Empresas" en varias
// sedes con códigos distintos). Solo se usan los 3 cortes de resumen
// (top5/10/20) en el bloque de indicadores generales de Perfil IES.
export function buildParetoInstitucion(rows, lastYear) {
  const byPrograma = new Map();
  for (const r of rows) {
    if (r.anio !== lastYear) continue;
    byPrograma.set(r.codigo_snies_programa, (byPrograma.get(r.codigo_snies_programa) ?? 0) + r.valor);
  }
  const items = [...byPrograma.values()].filter((v) => v > 0).sort((a, b) => b - a);
  const total = items.reduce((s, v) => s + v, 0);
  let cum = 0;
  const cums = items.map((v) => {
    cum += v;
    return total ? cum / total : 0;
  });
  const shareAt = (n) => cums[n - 1] ?? (cums.length ? cums[cums.length - 1] : 0);
  return { totalPrograms: items.length, top5Share: shareAt(5), top10Share: shareAt(10), top20Share: shareAt(20) };
}
