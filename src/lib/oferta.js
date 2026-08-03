// una IES puede reportar matrícula real muy baja (1-2 estudiantes) en un
// programa que en la práctica ya no está "en oferta" -- se pide contar como
// oferta activa solo los programas con MÁS de este umbral en el año que se
// esté mirando (aplica igual sin importar si la métrica activa es
// Matriculados o Primer Curso: el umbral se evalúa sobre "valor", que ya
// viene filtrado por la métrica seleccionada).
const OFERTA_MIN = 2;

// las 6 niveles de formación que se muestran, con su nombre estandarizado.
// OJO: "Especialización" es SOLO "Especializacion Universitaria" -- las
// otras 3 especializaciones (Tecnológica, Médico Quirúrgica y Técnico
// Profesional) quedan EXCLUIDAS por ahora, sin sumarse a ningún nivel ni
// entre ellas (cada nivel de formación se cuenta por separado).
export const NIVEL_FORMACION_ORDER = [
  "Especializacion Universitaria",
  "Maestria",
  "Doctorado",
  "Universitario",
  "Tecnologico",
  "Formacion Tecnica Profesional",
];
export const NIVEL_FORMACION_LABELS = {
  "Especializacion Universitaria": "Especialización",
  Maestria: "Maestría",
  Doctorado: "Doctorado",
  Universitario: "Universitario",
  Tecnologico: "Tecnológico",
  "Formacion Tecnica Profesional": "Técnico",
};
const NIVEL_FORMACION_SET = new Set(NIVEL_FORMACION_ORDER);

export const MODALIDAD_ORDER = ["Presencial", "Virtual", "A distancia", "Hibrida", "Dual", "Sin informacion"];
export const MODALIDAD_LABELS = {
  Presencial: "Presencial",
  Virtual: "Virtual",
  "A distancia": "A distancia",
  Hibrida: "Híbrida",
  Dual: "Dual",
  "Sin informacion": "Sin información",
};
export function groupModalidad(raw) {
  return raw && MODALIDAD_ORDER.includes(raw) ? raw : "Sin informacion";
}

// una entrada por programa (codigo_snies_programa): matrícula total por año,
// más su nivel de formación (tal cual, sin agrupar) y modalidad agrupada --
// se toma el último valor visto (en la práctica un programa no cambia de
// nivel/modalidad de un año a otro).
function groupByPrograma(rows) {
  const byPrograma = new Map();
  for (const r of rows) {
    if (!byPrograma.has(r.codigo_snies_programa)) {
      byPrograma.set(r.codigo_snies_programa, { years: {}, nivel: null, modalidad: null });
    }
    const p = byPrograma.get(r.codigo_snies_programa);
    p.years[r.anio] = (p.years[r.anio] ?? 0) + r.valor;
    p.nivel = r.nivel_formacion;
    p.modalidad = groupModalidad(r.metodologia);
  }
  return byPrograma;
}

// evolución anual de programas "en oferta" (> OFERTA_MIN matrículas ese año)
// para los 6 niveles de formación -- una línea por nivel. Los programas de
// los 3 niveles de especialización excluidos simplemente no se cuentan en
// ninguna línea (no se pierden en un "otros": quedan fuera del todo, por
// pedido explícito). Cada fila trae además `diffs`, la diferencia de cada
// nivel contra el año anterior (null en el primer año), para el tooltip.
export function buildOfertaEvolution(rows, anios) {
  const byPrograma = groupByPrograma(rows);
  const counts = anios.map((a) => {
    const row = { anio: String(a) };
    for (const nivel of NIVEL_FORMACION_ORDER) row[NIVEL_FORMACION_LABELS[nivel]] = 0;
    for (const p of byPrograma.values()) {
      if (!NIVEL_FORMACION_SET.has(p.nivel)) continue;
      if ((p.years[a] ?? 0) > OFERTA_MIN) row[NIVEL_FORMACION_LABELS[p.nivel]] += 1;
    }
    return row;
  });
  return counts.map((row, i) => {
    const diffs = {};
    for (const nivel of NIVEL_FORMACION_ORDER) {
      const label = NIVEL_FORMACION_LABELS[nivel];
      diffs[label] = i > 0 ? row[label] - counts[i - 1][label] : null;
    }
    return { ...row, diffs };
  });
}

// distribución de programas en oferta en el último año, por nivel de
// formación (mismos 6 niveles, mismas exclusiones que la evolución).
export function buildNivelDistribution(rows, lastYear) {
  const byPrograma = groupByPrograma(rows);
  const counts = new Map(NIVEL_FORMACION_ORDER.map((n) => [n, 0]));
  for (const p of byPrograma.values()) {
    if (!NIVEL_FORMACION_SET.has(p.nivel)) continue;
    if ((p.years[lastYear] ?? 0) > OFERTA_MIN) counts.set(p.nivel, (counts.get(p.nivel) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return NIVEL_FORMACION_ORDER.map((n) => ({
    key: n,
    label: NIVEL_FORMACION_LABELS[n],
    count: counts.get(n) ?? 0,
    pct: total ? (counts.get(n) ?? 0) / total : 0,
  }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
}

// distribución de programas en oferta en el último año, por modalidad --
// misma exclusión de los 3 niveles de especialización que el resto de la
// pestaña, para que las dos distribuciones cuenten siempre el mismo conjunto
// de programas.
export function buildModalidadDistribution(rows, lastYear) {
  const byPrograma = groupByPrograma(rows);
  const counts = new Map(MODALIDAD_ORDER.map((m) => [m, 0]));
  for (const p of byPrograma.values()) {
    if (!NIVEL_FORMACION_SET.has(p.nivel)) continue;
    if ((p.years[lastYear] ?? 0) > OFERTA_MIN) counts.set(p.modalidad, (counts.get(p.modalidad) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return MODALIDAD_ORDER.map((m) => ({
    key: m,
    label: MODALIDAD_LABELS[m],
    count: counts.get(m) ?? 0,
    pct: total ? (counts.get(m) ?? 0) / total : 0,
  }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
}

// tabla cruzada nivel de formación x modalidad: cantidad de programas NUEVOS
// -- matrícula > OFERTA_MIN en el último año, y CERO en todos los años
// anteriores (nunca antes tuvieron matrícula). Solo cuenta los 6 niveles de
// formación de arriba.
export function buildNuevosTable(rows, anios, lastYear) {
  const byPrograma = groupByPrograma(rows);
  const priorYears = anios.filter((a) => a !== lastYear);
  const grid = new Map(NIVEL_FORMACION_ORDER.map((n) => [n, new Map(MODALIDAD_ORDER.map((m) => [m, 0]))]));

  for (const p of byPrograma.values()) {
    if (!NIVEL_FORMACION_SET.has(p.nivel)) continue;
    const last = p.years[lastYear] ?? 0;
    const esNuevo = last > OFERTA_MIN && priorYears.every((a) => !((p.years[a] ?? 0) > 0));
    if (!esNuevo) continue;
    const row = grid.get(p.nivel);
    row.set(p.modalidad, (row.get(p.modalidad) ?? 0) + 1);
  }

  const modalidades = MODALIDAD_ORDER.filter((m) => NIVEL_FORMACION_ORDER.some((n) => (grid.get(n).get(m) ?? 0) > 0));
  const niveles = NIVEL_FORMACION_ORDER.filter((n) => modalidades.some((m) => (grid.get(n).get(m) ?? 0) > 0));

  const rowsOut = niveles.map((n) => {
    const row = grid.get(n);
    const cells = modalidades.map((m) => row.get(m) ?? 0);
    return { key: n, label: NIVEL_FORMACION_LABELS[n], cells, total: cells.reduce((a, b) => a + b, 0) };
  });
  const colTotals = modalidades.map((_, i) => rowsOut.reduce((acc, r) => acc + r.cells[i], 0));
  const grandTotal = colTotals.reduce((a, b) => a + b, 0);

  return { modalidades: modalidades.map((m) => MODALIDAD_LABELS[m]), rows: rowsOut, colTotals, grandTotal };
}
