import { useState } from "react";
import { Copy, Check } from "lucide-react";

// arma un TSV (separado por tabs) a partir de un array de arrays -- primera
// fila = encabezados -- y lo copia al portapapeles. Pegado directo en
// Excel/Sheets arma columnas y filas solas, sin exportar ni descargar nada.
function toTSV(rows) {
  return rows.map((row) => row.map((cell) => cell ?? "").join("\t")).join("\n");
}

// botón sutil para copiar los datos de una gráfica puntual -- `getRows` se
// llama recién al hacer click (no en cada render) y debe devolver un array de
// arrays, primera fila = encabezados.
export function CopyDataButton({ getRows, className = "" }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const rows = getRows();
    if (!rows?.length) return;
    try {
      await navigator.clipboard.writeText(toTSV(rows));
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Copiar datos de esta gráfica (para pegar en Excel)"
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-navy-700 ${className}`}
    >
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.25} />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}
