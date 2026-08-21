export const fmt = (n) => (n == null ? "" : Number(n).toLocaleString("es-CO"));
// decimal con coma (convención es-CO) -- toFixed() siempre usa punto sin
// importar el locale, así que se reemplaza a mano. Único punto de verdad
// para "número con N decimales" en toda la app.
export const decimal = (n, digits = 1) => (n == null ? "" : Number(n).toFixed(digits).replace(".", ","));
export const pct = (n) => (n == null ? "" : decimal(n * 100, 1) + "%");
export const esc = (s) => String(s).replace(/'/g, "''");

// una palabra suelta -> condición "aparece en al menos una de las columnas";
// prefijada con "-" -> lo contrario (NO debe aparecer). El COALESCE es para
// que una columna NULL no arrastre el NOT a NULL (en SQL `NOT NULL` es NULL,
// y la fila se perdería): si el nombre viene vacío, simplemente no contiene
// la palabra, así que la fila se conserva.
function wordCondition(word, columns) {
  const negated = word.startsWith("-");
  const bare = negated ? word.slice(1) : word;
  if (!bare) return null;
  const any = columns.map((c) => `${c} ILIKE '%${esc(bare)}%'`).join(" OR ");
  return negated ? `NOT COALESCE(${any}, FALSE)` : `(${any})`;
}

// condición SQL "todas estas palabras aparecen, en cualquier orden" -- separa
// el término escrito por espacios y exige que CADA palabra coincida (ILIKE)
// contra AL MENOS una de las columnas dadas; todas las palabras deben
// cumplirse (AND), cada una en cualquiera de las columnas (OR). Así "sistemas
// comp" encuentra "Ingenieria De Sistemas Y Computacion" sin que las palabras
// aparezcan juntas ni en ese orden. Una palabra con "-" adelante EXCLUYE
// ("mercadeo -digital" = tiene mercadeo pero no digital). Con término vacío
// no filtra nada.
export function sqlKeywordsIlike(term, columns) {
  const conds = String(term ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => wordCondition(w, columns))
    .filter(Boolean);
  if (!conds.length) return "TRUE";
  return conds.join(" AND ");
}

// mini-lenguaje de búsqueda sobre sqlKeywordsIlike: "|" separa GRUPOS en O
// (con que uno se cumpla alcanza); dentro de cada grupo, las palabras
// separadas por espacio siguen siendo un Y (todas deben aparecer) y las
// prefijadas con "-" excluyen. Ej.: "mercadeo publicidad | marketing" ->
// (mercadeo Y publicidad) O marketing; "mercadeo -digital" -> mercadeo pero
// NO digital. Se eligieron "|" y "-" y no letras ("o"/"y"/"no") porque una
// palabra real de búsqueda nunca los necesita al inicio, así no hay
// ambigüedad con lo que el usuario escriba.
export function sqlSearchQuery(term, columns) {
  const groups = String(term ?? "")
    .split("|")
    .map((g) => sqlKeywordsIlike(g, columns))
    .filter((g) => g !== "TRUE");
  if (!groups.length) return "TRUE";
  return groups.length === 1 ? groups[0] : groups.map((g) => `(${g})`).join(" OR ");
}

export function normalizeName(s) {
  return String(s)
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// nombres canónicos que usa v_mercado para agrupar/filtrar (ver duckdb.jsx)
// vs. las etiquetas que se le muestran al usuario -- separados a propósito:
// el valor crudo debe seguir viajando intacto en SQL/JS, solo la etiqueta cambia.
export const NIVEL_FORMACION_ORDER = [
  "Formacion Tecnica Profesional",
  "Tecnologico",
  "Universitario",
  "Especializacion Tecnico Profesional",
  "Especializacion Tecnologica",
  "Especializacion Universitaria",
  "Especializacion Medico Quirurgica",
  "Maestria",
  "Doctorado",
];
const NIVEL_FORMACION_LABELS = {
  "Formacion Tecnica Profesional": "Técnico",
  Tecnologico: "Tecnólogo",
  Universitario: "Universitario",
  "Especializacion Tecnico Profesional": "Especialización Técnica",
  "Especializacion Tecnologica": "Especialización Tecnológica",
  "Especializacion Universitaria": "Especialización",
  "Especializacion Medico Quirurgica": "Especialización Médico-Quirúrgica",
  Maestria: "Maestría",
  Doctorado: "Doctorado",
};
export const formatNivel = (v) => (v == null ? "—" : NIVEL_FORMACION_LABELS[v] ?? v);

export const NIVEL_ACADEMICO_ORDER = ["Pregrado", "Posgrado"];

export const MODALIDAD_ORDER = ["Presencial", "Virtual", "A distancia", "Dual", "Hibrida"];
const MODALIDAD_LABELS = { Hibrida: "Híbrida" };
export const formatModalidad = (v) => (v == null ? "—" : MODALIDAD_LABELS[v] ?? v);
