import { normalizeName, NIVEL_FORMACION_ORDER } from "./format";

function orderIndex(order, value) {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

// conjunto curado de "Principales IES" -- fijo, no un top-N automático.
export const PRINCIPALES_IES = [
  "Unad", "CUN", "Uniminuto", "Poli", "Areandina", "Ibero", "Santo Tomas",
  "Cooperativa", "EAN", "Asturias", "IU. Digital", "Unir", "Americana", "Remington", "Manuela Beltran",
];

// IES en Bogotá / Medellín -- guardadas para cuando haya que consultarlas o
// armar un filtro específico por ciudad (además de aparecer, ya sin
// duplicados, en SHARE_IES de abajo).
export const IES_COLA_BOGOTA = ["San Jose", "ECCI", "Catolica de Colombia", "Libre", "Tadeo"];
export const IES_COLA_MEDELLIN = ["Luis Amigo", "Unaula", "Esumer", "Americana", "Cooperativa"];

// conjunto EXACTO y fijo de IES para el gráfico de participación -- no un
// top-N automático: solo estas deben aparecer, cada una con su share real.
export const SHARE_IES = [
  "Unad", "CUN", "Uniminuto", "Poli", "Areandina", "Ibero", "Santo Tomas",
  "Cooperativa", "Asturias", "IU. Digital", "Unir", "Americana", "Remington",
  "Manuela Beltran", "EAN", "San Jose", "ECCI", "Catolica de Colombia",
  "Libre", "Tadeo", "Luis Amigo", "Unaula", "Esumer", "Ceipa", "Unicompensar",
];

export async function resolveIESNames(query, poliName, targets) {
  const rows = await query(`SELECT DISTINCT institucion FROM dim_institucion WHERE institucion IS NOT NULL`);
  const all = rows.map((r) => r.institucion);
  return targets.map((target) => {
    if (target.toLowerCase() === "poli") return poliName;
    const norm = normalizeName(target);
    return (
      all.find((a) => normalizeName(a) === norm) ||
      all.find((a) => normalizeName(a).includes(norm)) ||
      all.find((a) => norm.includes(normalizeName(a))) ||
      target
    );
  });
}

export async function resolvePrincipalesIES(query, poliName) {
  return resolveIESNames(query, poliName, PRINCIPALES_IES);
}

// SHARE_IES (25 IES) es el universo CANDIDATO -- se guarda completo para que,
// sin importar qué filtros se apliquen, cualquiera de esas 25 pueda entrar a
// figurar. Pero el gráfico solo pinta el Top N (por defecto 10) de ese
// universo según su share real en el último año visible, recalculado cada
// vez que cambian los filtros; se fuerza incluir al Poli aunque no alcance
// el Top N por su cuenta. Cada barra se apila al 100% para poder comparar
// años entre sí, pero eso es solo la ALTURA visual: el valor real (usado en
// etiquetas y tooltip vía trueShare) sigue siendo el share de esa IES sobre
// el total nacional, no sobre la suma del grupo mostrado.
export function buildIESShareEvolution(rows, anios, resolvedNames, isPoli, topN = 10) {
  const byYear = new Map(anios.map((a) => [a, { byInst: new Map(), total: 0 }]));
  for (const r of rows) {
    const y = byYear.get(r.anio);
    if (!y) continue;
    y.total += r.valor;
    y.byInst.set(r.institucion, (y.byInst.get(r.institucion) ?? 0) + r.valor);
  }
  const lastYear = anios[anios.length - 1];
  const lastYearData = byYear.get(lastYear) ?? { byInst: new Map(), total: 0 };
  const candidates = [...new Set(resolvedNames)];
  const ranked = candidates
    .map((name) => [name, lastYearData.byInst.get(name) ?? 0])
    .sort((a, b) => b[1] - a[1]);
  const topNames = ranked.slice(0, topN).map(([name]) => name);
  const poliName = candidates.find((name) => isPoli(name));
  if (poliName && !topNames.includes(poliName)) topNames.push(poliName);
  const order = topNames.sort((a, b) => (lastYearData.byInst.get(b) ?? 0) - (lastYearData.byInst.get(a) ?? 0));

  const data = anios.map((a) => {
    const y = byYear.get(a);
    const trueShare = {};
    const trueAbs = {};
    let trackedTotal = 0;
    for (const name of order) {
      const v = y.byInst.get(name) ?? 0;
      const frac = y.total ? v / y.total : 0;
      trueShare[name] = frac;
      trueAbs[name] = v;
      trackedTotal += frac;
    }
    const row = { anio: String(a), trueShare, trueAbs };
    for (const name of order) {
      row[name] = trackedTotal ? trueShare[name] / trackedTotal : 0;
    }
    return row;
  });
  return { data, order };
}

export function buildTopIesSeries(rows, resolvedNames, lastYear, prevYear, anios) {
  const years3 = anios.slice(-3);
  const byInst = new Map();
  for (const r of rows) {
    if (!byInst.has(r.institucion)) byInst.set(r.institucion, {});
    const years = byInst.get(r.institucion);
    years[r.anio] = (years[r.anio] ?? 0) + r.valor;
  }
  const resolvedSet = new Set(resolvedNames);
  const selected = [...byInst.entries()]
    .filter(([inst]) => resolvedSet.has(inst))
    .map(([inst, years]) => ({ institucion: inst, years, last: years[lastYear] ?? 0 }))
    .sort((a, b) => b.last - a.last);

  const data = selected.map((e) => {
    const prev = e.years[prevYear] ?? 0;
    const last = e.years[lastYear] ?? 0;
    const dif = last - prev;
    const growth = prev ? dif / prev : null;
    const row = { institucion: e.institucion, dif, growth };
    for (const y of years3) row[String(y)] = e.years[y] ?? 0;
    return row;
  });
  return { data, years3 };
}

export function buildSectorEvolution(rows, anios) {
  const bySectorYear = new Map();
  for (const r of rows) {
    if (!bySectorYear.has(r.anio)) bySectorYear.set(r.anio, new Map());
    const m = bySectorYear.get(r.anio);
    m.set(r.sector_ies, (m.get(r.sector_ies) ?? 0) + r.valor);
  }
  const sectors = [...new Set(rows.map((r) => r.sector_ies))].sort();
  const abs = anios.map((a) => {
    const m = bySectorYear.get(a) ?? new Map();
    const row = { anio: String(a) };
    let total = 0;
    for (const s of sectors) {
      row[s] = m.get(s) ?? 0;
      total += row[s];
    }
    row.Total = total;
    return row;
  });
  const share = abs.map((row) => {
    const out = { anio: row.anio };
    for (const s of sectors) out[s] = row.Total ? row[s] / row.Total : 0;
    return out;
  });
  const lastTotal = abs[abs.length - 1]?.Total ?? 0;
  const prevTotal = abs[abs.length - 2]?.Total ?? 0;
  const totalGrowth = prevTotal ? (lastTotal - prevTotal) / prevTotal : null;
  return { sectors, abs, share, totalGrowth };
}

// niveles marginales (muy pocos programas/matrícula, % de variación se
// dispara sin decir nada real) -- se excluyen de esta gráfica a pedido
// explícito, igual que ya pasa en la distribución de Oferta.jsx.
const NIVEL_FORMACION_EXCLUIDOS = new Set([
  "Especializacion Medico Quirurgica",
  "Especializacion Tecnologica",
  "Especializacion Tecnico Profesional",
]);

// variación porcentual año contra año de matrículas NUEVAS (siempre Primer
// Curso, sin importar el toggle global de métrica -- se fija en la consulta
// que llama a esto) por nivel de formación (Universitario, Maestría,
// Técnico, etc). Cada valor de la serie lleva también la diferencia absoluta
// vs. el año anterior (sufijo "__abs") para que el tooltip la muestre junto
// al %. El primer año de "rows" solo sirve de base para el primer %, no
// aparece como punto.
export function buildNivelFormacionVariacion(rows, anios) {
  const byYear = new Map();
  for (const r of rows) {
    if (NIVEL_FORMACION_EXCLUIDOS.has(r.nivel_formacion)) continue;
    if (!byYear.has(r.anio)) byYear.set(r.anio, new Map());
    const m = byYear.get(r.anio);
    m.set(r.nivel_formacion, (m.get(r.nivel_formacion) ?? 0) + r.valor);
  }
  const niveles = [...new Set(rows.map((r) => r.nivel_formacion))]
    .filter((n) => !NIVEL_FORMACION_EXCLUIDOS.has(n))
    .sort((a, b) => orderIndex(NIVEL_FORMACION_ORDER, a) - orderIndex(NIVEL_FORMACION_ORDER, b));
  const totals = anios.map((a) => {
    const m = byYear.get(a) ?? new Map();
    const row = { anio: a };
    for (const n of niveles) row[n] = m.get(n) ?? 0;
    return row;
  });
  const variation = totals.slice(1).map((row, i) => {
    const prev = totals[i];
    const out = { anio: String(row.anio) };
    for (const n of niveles) {
      out[n] = prev[n] ? (row[n] - prev[n]) / prev[n] : null;
      out[`${n}__abs`] = row[n] - prev[n];
    }
    return out;
  });
  return { niveles, variation };
}

// puente/cascada real entre el total del año anterior y el del último año:
// barra sólida de partida, top-N que más crecen y top-N que más decrecen
// como barras flotantes (con un bucket "Otros" agregando el resto), y barra
// sólida de llegada -- la suma de todo cuadra exacto con la diferencia entre
// ambos totales. Puerto fiel del diseño ya aprobado (antes en ECharts).
export function buildBridge(rows, lastYear, prevYear, topN = 10) {
  const prevMap = new Map(),
    lastMap = new Map(),
    sectorByInst = new Map();
  for (const r of rows) {
    sectorByInst.set(r.institucion, r.sector_ies);
    if (r.anio === prevYear) prevMap.set(r.institucion, (prevMap.get(r.institucion) ?? 0) + r.valor);
    if (r.anio === lastYear) lastMap.set(r.institucion, (lastMap.get(r.institucion) ?? 0) + r.valor);
  }
  const prevTotal = [...prevMap.values()].reduce((s, v) => s + v, 0);

  const allInsts = new Set([...prevMap.keys(), ...lastMap.keys()]);
  const items = [...allInsts]
    .map((inst) => {
      const prev = prevMap.get(inst) ?? 0;
      const last = lastMap.get(inst) ?? 0;
      return { institucion: inst, prev, last, dif: last - prev, sector: sectorByInst.get(inst) };
    })
    .filter((i) => i.dif !== 0);

  const growers = items.filter((i) => i.dif > 0).sort((a, b) => b.dif - a.dif);
  const declinersByMagnitude = items.filter((i) => i.dif < 0).sort((a, b) => a.dif - b.dif);
  const declinersShown = declinersByMagnitude.slice(0, topN).sort((a, b) => b.dif - a.dif);

  const growersShown = growers.slice(0, topN);
  const shownDeclinerSet = new Set(declinersShown.map((d) => d.institucion));
  const otrosMasSum = growers.slice(topN).reduce((s, i) => s + i.dif, 0);
  const otrosMenosSum = declinersByMagnitude.filter((d) => !shownDeclinerSet.has(d.institucion)).reduce((s, i) => s + i.dif, 0);

  const bridgeItems = [
    ...growersShown.map((g) => ({ label: g.institucion, dif: g.dif, prev: g.prev, sector: g.sector })),
    ...(otrosMasSum > 0 ? [{ label: `Otros crecen (${growers.length - growersShown.length})`, dif: otrosMasSum, sector: null }] : []),
    ...(otrosMenosSum < 0
      ? [{ label: `Otros decrecen (${declinersByMagnitude.length - declinersShown.length})`, dif: otrosMenosSum, sector: null }]
      : []),
    ...declinersShown.map((d) => ({ label: d.institucion, dif: d.dif, prev: d.prev, sector: d.sector })),
  ];

  let running = prevTotal;
  let minRunning = prevTotal;
  const chartData = [{ label: String(prevYear), kind: "total", base: 0, delta: prevTotal, total: prevTotal }];
  for (const item of bridgeItems) {
    const before = running;
    running += item.dif;
    minRunning = Math.min(minRunning, running);
    chartData.push({
      label: item.label,
      kind: "item",
      sector: item.sector,
      base: Math.min(before, running),
      delta: Math.abs(item.dif),
      dif: item.dif,
      prev: item.prev,
      growth: item.prev ? item.dif / item.prev : null,
    });
  }
  chartData.push({ label: String(lastYear), kind: "total", base: 0, delta: running, total: running });

  // el eje de valor arranca cerca del rango real de los datos (no en 0): así
  // las barras flotantes (miles) se ven grandes frente a los totales
  // (millones) y sus etiquetas +%/+dif tienen espacio para no encimarse.
  const axisMin = Math.max(0, Math.floor((minRunning * 0.9) / 10000) * 10000);
  const axisMax = Math.max(prevTotal, running) * 1.08;

  const growersOficial = growers.filter((g) => g.sector === "Oficial").length;
  const declinersOficial = declinersByMagnitude.filter((d) => d.sector === "Oficial").length;

  return {
    chartData,
    axisMin,
    axisMax,
    summary: {
      growersTotal: growers.length,
      growersOficial,
      declinersTotal: declinersByMagnitude.length,
      declinersOficial,
    },
  };
}

// modalidades que se muestran en "Evolución por modalidad" -- se excluye
// "Dual" a propósito (participación marginal, distorsiona poco la lectura
// pero satura la leyenda).
export const MODALIDADES_MOSTRADAS = ["Presencial", "Virtual", "A distancia", "Hibrida"];

// participación (% del total nacional, todas las modalidades incluida Dual)
// de cada modalidad mostrada, por año.
export function buildModalidadEvolution(rows, anios) {
  const byYear = new Map(anios.map((a) => [a, { total: 0, byModalidad: new Map() }]));
  for (const r of rows) {
    const y = byYear.get(r.anio);
    if (!y) continue;
    y.total += r.valor;
    y.byModalidad.set(r.metodologia, (y.byModalidad.get(r.metodologia) ?? 0) + r.valor);
  }
  return anios.map((a) => {
    const y = byYear.get(a);
    const row = { anio: String(a) };
    for (const m of MODALIDADES_MOSTRADAS) {
      row[m] = y.total ? (y.byModalidad.get(m) ?? 0) / y.total : null;
    }
    return row;
  });
}

// migración de modalidad: por nivel de formación, qué tanto se movió la
// matrícula de Presencial hacia otras modalidades entre el primer y el
// último año disponible (respeta los filtros globales, incluida la métrica).
export function buildModalidadMigracion(rows, anios) {
  const firstYear = anios[0];
  const lastYear = anios[anios.length - 1];
  // nivel -> { [anio]: { total, presencial, virtual } }
  const byNivel = new Map();
  for (const r of rows) {
    if (!byNivel.has(r.nivel_formacion)) byNivel.set(r.nivel_formacion, {});
    const years = byNivel.get(r.nivel_formacion);
    if (!years[r.anio]) years[r.anio] = { total: 0, presencial: 0, virtual: 0 };
    years[r.anio].total += r.valor;
    if (r.metodologia === "Presencial") years[r.anio].presencial += r.valor;
    if (r.metodologia === "Virtual") years[r.anio].virtual += r.valor;
  }

  const items = [...byNivel.entries()]
    .map(([nivel, years]) => {
      const f = years[firstYear];
      const l = years[lastYear];
      const sharePresF = f?.total ? f.presencial / f.total : null;
      const sharePresL = l?.total ? l.presencial / l.total : null;
      const shareVirtF = f?.total ? f.virtual / f.total : null;
      const shareVirtL = l?.total ? l.virtual / l.total : null;
      const deltaPresencial = sharePresF != null && sharePresL != null ? sharePresL - sharePresF : null;
      return {
        nivel,
        totalLast: l?.total ?? 0,
        sharePresF,
        sharePresL,
        shareVirtF,
        shareVirtL,
        deltaPresencial,
      };
    })
    .filter((d) => d.totalLast > 0)
    .sort((a, b) => {
      if (a.deltaPresencial == null && b.deltaPresencial == null) return orderIndex(NIVEL_FORMACION_ORDER, a.nivel) - orderIndex(NIVEL_FORMACION_ORDER, b.nivel);
      if (a.deltaPresencial == null) return 1;
      if (b.deltaPresencial == null) return -1;
      return a.deltaPresencial - b.deltaPresencial;
    });

  return { firstYear, lastYear, items };
}

// concentración tipo Pareto comparada entre las principales IES: qué % de la
// matrícula del último año depende de sus 5/10/20 programas más grandes, por
// codigo_snies_programa (no por nombre -- una misma IES puede repetir un
// programa en varias sedes con códigos distintos). `order` fija el orden de
// salida (se usa el mismo orden por tamaño que el gráfico de arriba).
export function buildParetoComparison(rows, lastYear, order) {
  const byInst = new Map();
  for (const r of rows) {
    if (r.anio !== lastYear) continue;
    if (!byInst.has(r.institucion)) byInst.set(r.institucion, new Map());
    const progs = byInst.get(r.institucion);
    progs.set(r.codigo_snies_programa, (progs.get(r.codigo_snies_programa) ?? 0) + r.valor);
  }
  function sharesFor(progs) {
    const items = [...progs.values()].filter((v) => v > 0).sort((a, b) => b - a);
    const total = items.reduce((s, v) => s + v, 0);
    let cum = 0;
    const cums = items.map((v) => {
      cum += v;
      return total ? cum / total : 0;
    });
    const shareAt = (n) => cums[n - 1] ?? (cums.length ? cums[cums.length - 1] : 0);
    return { totalPrograms: items.length, top5Share: shareAt(5), top10Share: shareAt(10), top20Share: shareAt(20) };
  }
  const names = order ?? [...byInst.keys()];
  return names
    .map((inst) => ({ institucion: inst, ...sharesFor(byInst.get(inst) ?? new Map()) }))
    .filter((r) => r.totalPrograms > 0);
}

function groupByPrograma(rows) {
  const byPrograma = new Map();
  for (const r of rows) {
    if (!byPrograma.has(r.codigo_snies_programa)) {
      byPrograma.set(r.codigo_snies_programa, {
        codigo: r.codigo_snies_programa,
        programa: r.programa_academico,
        modalidad: r.metodologia,
        institucion: r.institucion,
        years: {},
      });
    }
    const p = byPrograma.get(r.codigo_snies_programa);
    p.years[r.anio] = (p.years[r.anio] ?? 0) + r.valor;
  }
  return byPrograma;
}

// tres tablas a nivel de programa (una fila por codigo_snies_programa, no
// por institución): debut (matrícula nueva en el último año, cero en todos
// los años anteriores), y top crecen/decrecen (mayor diferencia absoluta
// último año vs. penúltimo).
export function buildProgramTables(rows, anios, lastYear, prevYear, topN = 10) {
  const byPrograma = groupByPrograma(rows);
  const priorYears = anios.filter((a) => a !== lastYear);

  const debut = [...byPrograma.values()]
    .filter((p) => (p.years[lastYear] ?? 0) > 0 && priorYears.every((a) => !((p.years[a] ?? 0) > 0)))
    .map((p) => ({ ...p, nuevos: p.years[lastYear] }))
    .sort((a, b) => b.nuevos - a.nuevos)
    .slice(0, topN);

  // en crecen/decrecen se exige matrícula > 2 en LOS DOS años (mismo umbral
  // "en oferta" que el resto de la pestaña) -- así se deja fuera tanto los
  // debuts explosivos (0 -> miles, ya cubiertos en la tabla de debut) como los
  // programas que prácticamente desaparecen (miles -> 1), que no son
  // crecimiento/caída real de un programa ya establecido, sino casos límite.
  const growthItems = [...byPrograma.values()]
    .map((p) => {
      const prev = p.years[prevYear] ?? 0;
      const last = p.years[lastYear] ?? 0;
      const dif = last - prev;
      const growth = prev ? dif / prev : null;
      return { ...p, prev, last, dif, growth };
    })
    .filter((p) => p.dif !== 0 && p.prev > 2 && p.last > 2);
  const growers = growthItems
    .filter((p) => p.dif > 0)
    .sort((a, b) => b.dif - a.dif)
    .slice(0, topN);
  const decliners = growthItems
    .filter((p) => p.dif < 0)
    .sort((a, b) => a.dif - b.dif)
    .slice(0, topN);

  return { debut, growers, decliners };
}

// serie anual "Mercado nacional vs. Poli": totales, participación (share) y
// crecimiento interanual de cada uno -- para la gráfica combinada de barras +
// línea de participación.
export function buildMercadoVsPoli(rows, anios, isPoli) {
  const byYear = new Map(anios.map((a) => [a, { mercado: 0, poli: 0 }]));
  for (const r of rows) {
    const y = byYear.get(r.anio);
    if (!y) continue;
    y.mercado += r.valor;
    if (isPoli(r.institucion)) y.poli += r.valor;
  }
  return anios.map((a, i) => {
    const cur = byYear.get(a);
    const prev = i > 0 ? byYear.get(anios[i - 1]) : null;
    const share = cur.mercado ? cur.poli / cur.mercado : null;
    const mercadoGrowth = prev && prev.mercado ? (cur.mercado - prev.mercado) / prev.mercado : null;
    const poliGrowth = prev && prev.poli ? (cur.poli - prev.poli) / prev.poli : null;
    return { anio: String(a), mercado: cur.mercado, poli: cur.poli, share, mercadoGrowth, poliGrowth };
  });
}
