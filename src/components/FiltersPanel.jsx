import { SlidersHorizontal } from "lucide-react";
import { useFilters, TEXT_FILTERS } from "../state/FiltersContext";
import { formatNivel, formatModalidad } from "../lib/format";
import { Select } from "./ui/Select";
import { RadioGroup } from "./ui/Tabs";
import { Card } from "./ui/Card";

// las opciones viajan como valor crudo (lo que espera SQL); solo la etiqueta
// visible se traduce al nombre estandarizado.
function labelOptionsFor(key, raw) {
  if (key === "nivelFormacion") return raw.map((v) => ({ value: v, label: formatNivel(v) }));
  if (key === "metodologia") return raw.map((v) => ({ value: v, label: formatModalidad(v) }));
  return raw;
}

export function FiltersPanel({ hint }) {
  const { filters, setFilter, options } = useFilters();

  return (
    <Card icon={SlidersHorizontal} title="Filtros" subtitle={hint ?? "Aplican a todas las pestañas — cada uno se ajusta según los demás."}>
      <div className="mb-4 inline-flex items-center gap-3 rounded-xl border border-brand-cyan-200 bg-brand-cyan-50/70 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-cyan">Métrica</span>
        <RadioGroup
          options={[
            { value: "matriculados", label: "Matriculados" },
            { value: "primer_curso", label: "Primer Curso" },
          ]}
          value={filters.metrica}
          onChange={(v) => setFilter("metrica", v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <Select label="Año" value={filters.anio} onChange={(v) => setFilter("anio", v)} options={options.anio ?? []} blankLabel="Todos" />
        <Select
          label="Semestre"
          value={filters.semestre}
          onChange={(v) => setFilter("semestre", v)}
          options={[
            { value: "1", label: "1" },
            { value: "2", label: "2" },
          ]}
          blankLabel="Ambos"
        />
        {TEXT_FILTERS.map((f) => (
          <Select
            key={f.key}
            label={f.label}
            value={filters[f.key]}
            onChange={(v) => setFilter(f.key, v)}
            options={labelOptionsFor(f.key, options[f.key] ?? [])}
            blankLabel={f.blankLabel}
          />
        ))}
      </div>
    </Card>
  );
}
