export const fmt = (n) => (n == null ? "" : Number(n).toLocaleString("es-CO"));
export const pct = (n) => (n == null ? "" : (n * 100).toFixed(1) + "%");
export const esc = (s) => String(s).replace(/'/g, "''");

// condición SQL "todas estas palabras aparecen, en cualquier orden" -- separa
// el término escrito por espacios y exige que CADA palabra coincida (ILIKE)
// contra AL MENOS una de las columnas dadas; todas las palabras deben
// cumplirse (AND), cada una en cualquiera de las columnas (OR). Así "sistemas
// comp" encuentra "Ingenieria De Sistemas Y Computacion" sin que las palabras
// aparezcan juntas ni en ese orden. Con término vacío no filtra nada.
export function sqlKeywordsIlike(term, columns) {
  const words = String(term ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "TRUE";
  return words.map((w) => `(${columns.map((c) => `${c} ILIKE '%${esc(w)}%'`).join(" OR ")})`).join(" AND ");
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
