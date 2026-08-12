// utilidades compartidas para las vistas "un año por columna" (Histórico,
// Mercado Competencia): arma entradas {row, years, values, last, dif, varr}
// a partir de filas planas {..., anio, total}.
export function buildYearSeries(years, anios, lastYear, prevYear) {
  const values = anios.map((a) => years[a] ?? 0);
  const last = years[lastYear] ?? 0;
  const prev = years[prevYear] ?? 0;
  return { values, last, dif: last - prev, varr: prev ? (last - prev) / prev : null };
}

export function pivotByYear(rows, keyCols) {
  const anios = [...new Set(rows.map((r) => r.anio))].sort((a, b) => a - b);
  const keyOf = (r) => keyCols.map((c) => r[c]).join("‧");
  const byKey = new Map();
  for (const r of rows) {
    if (!byKey.has(keyOf(r))) byKey.set(keyOf(r), { row: r, years: {} });
    byKey.get(keyOf(r)).years[r.anio] = r.total;
  }
  const lastYear = anios[anios.length - 1];
  const prevYear = anios[anios.length - 2];
  let entries = [...byKey.values()].map((e) => ({ ...e, ...buildYearSeries(e.years, anios, lastYear, prevYear) }));
  entries.sort((a, b) => b.last - a.last);

  const subtotalYears = {};
  for (const a of anios) subtotalYears[a] = entries.reduce((sum, e) => sum + (e.years[a] ?? 0), 0);
  const subtotal = { years: subtotalYears, ...buildYearSeries(subtotalYears, anios, lastYear, prevYear) };

  return { anios, lastYear, prevYear, entries, subtotal, totalCount: entries.length };
}

// tasa promedio de CAGR "hacia atrás": para cada año anterior al último con
// dato, calcula el CAGR de ESE año hasta el último año disponible -- (último
// / año_i)^(1/n) - 1 -- y promedia todos esos resultados. A diferencia del
// CAGR simple (que solo usa el primer y el último año, ciego a lo que pasó
// en medio), aquí cada año del rango entra como punto de partida de su
// propia ventana, así que una anomalía en un año intermedio sí se refleja
// (con más peso cuanto más reciente sea, porque cae en ventanas más cortas).
export function buildTasaPromedio(years, anios, lastYear) {
  const lastValue = years[lastYear] ?? 0;
  const rates = [];
  for (const a of anios) {
    if (a === lastYear) continue;
    const startValue = years[a] ?? 0;
    const n = lastYear - a;
    if (startValue > 0 && n > 0) rates.push(Math.pow(lastValue / startValue, 1 / n) - 1);
  }
  return rates.length ? rates.reduce((sum, r) => sum + r, 0) / rates.length : null;
}
