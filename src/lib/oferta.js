// una IES puede reportar matrícula real muy baja (1-2 estudiantes) en un
// programa que en la práctica ya no está "en oferta" -- se pide contar como
// oferta activa solo los programas con MÁS de este umbral en el año que se
// esté mirando (aplica igual sin importar si la métrica activa es
// Matriculados o Primer Curso: el umbral se evalúa sobre "valor", que ya
// viene filtrado por la métrica seleccionada).
const OFERTA_MIN = 2;

// las 6 niveles de formación que se muestran por defecto (vista
// simplificada), con su nombre estandarizado. Las otras 3 especializaciones
// (Tecnológica, Médico Quirúrgica y Técnico Profesional) son minoritarias y
// quedan ocultas por defecto -- el botón "Ver todos los niveles" de la
// pestaña Oferta las agrega mediante NIVEL_FORMACION_ORDER_FULL.
export const NIVEL_FORMACION_ORDER = [
  "Especializacion Universitaria",
  "Maestria",
  "Doctorado",
  "Universitario",
  "Tecnologico",
  "Formacion Tecnica Profesional",
];
// los 3 niveles minoritarios, ocultos en la vista simplificada.
export const NIVEL_FORMACION_EXTRA = [
  "Especializacion Tecnologica",
  "Especializacion Medico Quirurgica",
  "Especializacion Tecnico Profesional",
];
// vista completa: mismo orden que arriba, con los 3 extra intercalados junto
// a "Especialización" (misma familia).
export const NIVEL_FORMACION_ORDER_FULL = [
  "Especializacion Universitaria",
  "Especializacion Tecnologica",
  "Especializacion Medico Quirurgica",
  "Especializacion Tecnico Profesional",
  "Maestria",
  "Doctorado",
  "Universitario",
  "Tecnologico",
  "Formacion Tecnica Profesional",
];
export const NIVEL_FORMACION_LABELS = {
  "Especializacion Universitaria": "Especialización",
  "Especializacion Tecnologica": "Esp. Tecnológica",
  "Especializacion Medico Quirurgica": "Esp. Médico Quirúrgica",
  "Especializacion Tecnico Profesional": "Esp. Técnico Profesional",
  Maestria: "Maestría",
  Doctorado: "Doctorado",
  Universitario: "Universitario",
  Tecnologico: "Tecnológico",
  "Formacion Tecnica Profesional": "Técnico",
};

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
// por nivel de formación -- una línea por nivel. `niveles` son los niveles a
// incluir (NIVEL_FORMACION_ORDER en la vista simplificada,
// NIVEL_FORMACION_ORDER_FULL con el botón "ver todos"); el resto simplemente
// no se cuenta en ninguna línea (no se pierde en un "otros"). Cada fila trae
// además `diffs`, la diferencia de cada nivel contra el año anterior (null en
// el primer año), para el tooltip.
export function buildOfertaEvolution(rows, anios, niveles = NIVEL_FORMACION_ORDER) {
  const nivelSet = new Set(niveles);
  const byPrograma = groupByPrograma(rows);
  const counts = anios.map((a) => {
    const row = { anio: String(a) };
    for (const nivel of niveles) row[NIVEL_FORMACION_LABELS[nivel]] = 0;
    for (const p of byPrograma.values()) {
      if (!nivelSet.has(p.nivel)) continue;
      if ((p.years[a] ?? 0) > OFERTA_MIN) row[NIVEL_FORMACION_LABELS[p.nivel]] += 1;
    }
    return row;
  });
  return counts.map((row, i) => {
    const diffs = {};
    for (const nivel of niveles) {
      const label = NIVEL_FORMACION_LABELS[nivel];
      diffs[label] = i > 0 ? row[label] - counts[i - 1][label] : null;
    }
    return { ...row, diffs };
  });
}

// misma evolución anual que buildOfertaEvolution, pero agrupada por
// modalidad en vez de nivel de formación -- `niveles` sigue acotando qué
// programas entran (para que el botón "ver todos los niveles" también mueva
// esta gráfica). Solo se devuelven las modalidades con algún dato distinto de
// cero en el rango, igual que en la distribución (evita líneas planas en el
// legend, ej. "Sin información" cuando no aplica).
export function buildModalidadEvolution(rows, anios, niveles = NIVEL_FORMACION_ORDER) {
  const nivelSet = new Set(niveles);
  const byPrograma = groupByPrograma(rows);
  const counts = anios.map((a) => {
    const row = { anio: String(a) };
    for (const m of MODALIDAD_ORDER) row[MODALIDAD_LABELS[m]] = 0;
    for (const p of byPrograma.values()) {
      if (!nivelSet.has(p.nivel)) continue;
      if ((p.years[a] ?? 0) > OFERTA_MIN) row[MODALIDAD_LABELS[p.modalidad]] += 1;
    }
    return row;
  });
  const modalidades = MODALIDAD_ORDER.filter((m) => counts.some((row) => row[MODALIDAD_LABELS[m]] > 0));
  const series = counts.map((row, i) => {
    const diffs = {};
    for (const m of modalidades) {
      const label = MODALIDAD_LABELS[m];
      diffs[label] = i > 0 ? row[label] - counts[i - 1][label] : null;
    }
    return { ...row, diffs };
  });
  return { series, modalidades };
}

// evolución anual de programas NUEVOS (matrícula > OFERTA_MIN ese año y CERO
// en TODOS los años anteriores) por nivel de formación -- generaliza
// buildNuevosTable (que solo miraba el último año) a toda la serie. El primer
// año del histórico se omite: sin años previos para comparar, todo programa
// activo contaría como "nuevo" y ese pico no sería real, solo un artefacto de
// no tener datos de antes de 2016.
export function buildNuevosEvolutionByNivel(rows, anios, niveles = NIVEL_FORMACION_ORDER) {
  const nivelSet = new Set(niveles);
  const byPrograma = groupByPrograma(rows);
  const targetYears = anios.slice(1);
  const counts = targetYears.map((a) => {
    const priorYears = anios.filter((y) => y < a);
    const row = { anio: String(a) };
    for (const nivel of niveles) row[NIVEL_FORMACION_LABELS[nivel]] = 0;
    for (const p of byPrograma.values()) {
      if (!nivelSet.has(p.nivel)) continue;
      const esNuevo = (p.years[a] ?? 0) > OFERTA_MIN && priorYears.every((y) => !((p.years[y] ?? 0) > 0));
      if (esNuevo) row[NIVEL_FORMACION_LABELS[p.nivel]] += 1;
    }
    return row;
  });
  return counts.map((row, i) => {
    const diffs = {};
    for (const nivel of niveles) {
      const label = NIVEL_FORMACION_LABELS[nivel];
      diffs[label] = i > 0 ? row[label] - counts[i - 1][label] : null;
    }
    return { ...row, diffs };
  });
}

// igual que buildNuevosEvolutionByNivel, pero agrupada por modalidad --
// mismo recorte de `niveles` y mismo filtro de modalidades sin datos.
export function buildNuevosEvolutionByModalidad(rows, anios, niveles = NIVEL_FORMACION_ORDER) {
  const nivelSet = new Set(niveles);
  const byPrograma = groupByPrograma(rows);
  const targetYears = anios.slice(1);
  const counts = targetYears.map((a) => {
    const priorYears = anios.filter((y) => y < a);
    const row = { anio: String(a) };
    for (const m of MODALIDAD_ORDER) row[MODALIDAD_LABELS[m]] = 0;
    for (const p of byPrograma.values()) {
      if (!nivelSet.has(p.nivel)) continue;
      const esNuevo = (p.years[a] ?? 0) > OFERTA_MIN && priorYears.every((y) => !((p.years[y] ?? 0) > 0));
      if (esNuevo) row[MODALIDAD_LABELS[p.modalidad]] += 1;
    }
    return row;
  });
  const modalidades = MODALIDAD_ORDER.filter((m) => counts.some((row) => row[MODALIDAD_LABELS[m]] > 0));
  const series = counts.map((row, i) => {
    const diffs = {};
    for (const m of modalidades) {
      const label = MODALIDAD_LABELS[m];
      diffs[label] = i > 0 ? row[label] - counts[i - 1][label] : null;
    }
    return { ...row, diffs };
  });
  return { series, modalidades };
}

// distribución de programas en oferta en el último año, por nivel de
// formación (mismos `niveles` y exclusiones que la evolución).
export function buildNivelDistribution(rows, lastYear, niveles = NIVEL_FORMACION_ORDER) {
  const nivelSet = new Set(niveles);
  const byPrograma = groupByPrograma(rows);
  const counts = new Map(niveles.map((n) => [n, 0]));
  for (const p of byPrograma.values()) {
    if (!nivelSet.has(p.nivel)) continue;
    if ((p.years[lastYear] ?? 0) > OFERTA_MIN) counts.set(p.nivel, (counts.get(p.nivel) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return niveles
    .map((n) => ({
      key: n,
      label: NIVEL_FORMACION_LABELS[n],
      count: counts.get(n) ?? 0,
      pct: total ? (counts.get(n) ?? 0) / total : 0,
    }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
}

// distribución de programas en oferta en el último año, por modalidad --
// mismos `niveles` que el resto de la pestaña, para que las dos
// distribuciones cuenten siempre el mismo conjunto de programas.
export function buildModalidadDistribution(rows, lastYear, niveles = NIVEL_FORMACION_ORDER) {
  const nivelSet = new Set(niveles);
  const byPrograma = groupByPrograma(rows);
  const counts = new Map(MODALIDAD_ORDER.map((m) => [m, 0]));
  for (const p of byPrograma.values()) {
    if (!nivelSet.has(p.nivel)) continue;
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
// anteriores (nunca antes tuvieron matrícula). Solo cuenta los `niveles`
// pasados.
export function buildNuevosTable(rows, anios, lastYear, niveles = NIVEL_FORMACION_ORDER) {
  const nivelSet = new Set(niveles);
  const byPrograma = groupByPrograma(rows);
  const priorYears = anios.filter((a) => a !== lastYear);
  const grid = new Map(niveles.map((n) => [n, new Map(MODALIDAD_ORDER.map((m) => [m, 0]))]));

  for (const p of byPrograma.values()) {
    if (!nivelSet.has(p.nivel)) continue;
    const last = p.years[lastYear] ?? 0;
    const esNuevo = last > OFERTA_MIN && priorYears.every((a) => !((p.years[a] ?? 0) > 0));
    if (!esNuevo) continue;
    const row = grid.get(p.nivel);
    row.set(p.modalidad, (row.get(p.modalidad) ?? 0) + 1);
  }

  const modalidades = MODALIDAD_ORDER.filter((m) => niveles.some((n) => (grid.get(n).get(m) ?? 0) > 0));
  const nivelesConDatos = niveles.filter((n) => modalidades.some((m) => (grid.get(n).get(m) ?? 0) > 0));

  const rowsOut = nivelesConDatos.map((n) => {
    const row = grid.get(n);
    const cells = modalidades.map((m) => row.get(m) ?? 0);
    return { key: n, label: NIVEL_FORMACION_LABELS[n], cells, total: cells.reduce((a, b) => a + b, 0) };
  });
  const colTotals = modalidades.map((_, i) => rowsOut.reduce((acc, r) => acc + r.cells[i], 0));
  const grandTotal = colTotals.reduce((a, b) => a + b, 0);

  return { modalidades: modalidades.map((m) => MODALIDAD_LABELS[m]), rows: rowsOut, colTotals, grandTotal };
}
