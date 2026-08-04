import { useEffect, useState } from "react";
import { ShieldCheck, Layers } from "lucide-react";
import { useDuckDB } from "../lib/duckdb";
import { useFilters, whereBase, TEXT_FILTERS } from "../state/FiltersContext";
import { fmt, pct } from "../lib/format";
import { Card } from "../components/ui/Card";
import { KpiTile } from "../components/ui/KpiBadge";

function describeSegment(filters) {
  const parts = [`Métrica: ${filters.metrica === "matriculados" ? "Matriculados" : "Primer Curso"}`, `Año: ${filters.anio || "Todos"}`];
  if (filters.semestre) parts.push(`Semestre: ${filters.semestre}`);
  for (const { key, label } of TEXT_FILTERS) {
    if (filters[key]) parts.push(`${label}: ${filters[key]}`);
  }
  return parts.join(" · ");
}

function KVTable({ title, rows, labelCol, labelHeader }) {
  return (
    <div>
      <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5 text-left">{labelHeader}</th>
              <th className="px-3 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5">{r[labelCol] ?? "Sin dato"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Validacion() {
  const { query, poliName } = useDuckDB();
  const { filters } = useFilters();
  const [general, setGeneral] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [breakdowns, setBreakdowns] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await query(`
        SELECT metrica,
               SUM(valor)::DOUBLE AS total,
               SUM(CASE WHEN institucion = '${poliName.replace(/'/g, "''")}' THEN valor ELSE 0 END)::DOUBLE AS poli
        FROM v_mercado GROUP BY metrica
      `);
      if (!cancelled) setGeneral(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, poliName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const where = whereBase(filters);
      const [resumenRows, porAnio, porNivel, porModalidad, porSector, porSexo, porInst] = await Promise.all([
        query(`
          SELECT COUNT(*)::DOUBLE AS n, SUM(valor)::DOUBLE AS total,
                 COUNT(DISTINCT institucion)::DOUBLE AS insts, COUNT(DISTINCT programa_academico)::DOUBLE AS progs,
                 SUM(CASE WHEN institucion = '${poliName.replace(/'/g, "''")}' THEN valor ELSE 0 END)::DOUBLE AS poli
          FROM v_mercado WHERE ${where}
        `),
        query(`SELECT anio, SUM(valor)::DOUBLE AS total FROM v_mercado WHERE ${where} GROUP BY anio ORDER BY anio`),
        query(`SELECT nivel_formacion, SUM(valor)::DOUBLE AS total FROM v_mercado WHERE ${where} GROUP BY nivel_formacion ORDER BY total DESC`),
        query(`SELECT metodologia, SUM(valor)::DOUBLE AS total FROM v_mercado WHERE ${where} GROUP BY metodologia ORDER BY total DESC`),
        query(`SELECT sector_ies, SUM(valor)::DOUBLE AS total FROM v_mercado WHERE ${where} GROUP BY sector_ies ORDER BY total DESC`),
        query(`SELECT sexo, SUM(valor)::DOUBLE AS total FROM v_mercado WHERE ${where} GROUP BY sexo ORDER BY total DESC`),
        query(`SELECT institucion, SUM(valor)::DOUBLE AS total FROM v_mercado WHERE ${where} GROUP BY institucion ORDER BY total DESC LIMIT 10`),
      ]);
      if (!cancelled) {
        setResumen(resumenRows[0]);
        setBreakdowns({ porAnio, porNivel, porModalidad, porSector, porSexo, porInst });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters, poliName]);

  return (
    <div className="flex flex-col gap-5">
      <Card
        icon={ShieldCheck}
        title="Totales generales"
        subtitle="Todo el histórico 2016-2024, sin ningún filtro — para cruzar contra SNIES u otra fuente externa."
      >
        {!general ? (
          <div className="py-8 text-center text-sm text-slate-400">Cargando…</div>
        ) : (
          <div className="overflow-x-auto scroll-thin rounded-xl ring-1 ring-slate-200/70">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-1.5 text-left">Métrica</th>
                  <th className="px-3 py-1.5 text-right">Total nacional (2016-2024)</th>
                  <th className="px-3 py-1.5 text-right">Total Poli</th>
                  <th className="px-3 py-1.5 text-right">Participación Poli</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {general.map((r) => (
                  <tr key={r.metrica}>
                    <td className="px-3 py-1.5">{r.metrica === "matriculados" ? "Matriculados" : "Primer Curso"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.poli)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.total ? pct(r.poli / r.total) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card icon={Layers} title="Segmento actual" subtitle={describeSegment(filters)}>
        {!resumen || !breakdowns ? (
          <div className="py-8 text-center text-sm text-slate-400">Cargando…</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <KpiTile label={filters.metrica === "matriculados" ? "Total matriculados" : "Total primer curso"} value={fmt(resumen.total)} />
              <KpiTile label="Total Poli" value={fmt(resumen.poli)} accent />
              <KpiTile label="Participación Poli" value={resumen.total ? pct(resumen.poli / resumen.total) : "—"} />
              <KpiTile label="Instituciones" value={fmt(resumen.insts)} />
              <KpiTile label="Programas" value={fmt(resumen.progs)} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <KVTable title="Por año" rows={breakdowns.porAnio} labelCol="anio" labelHeader="Año" />
              <KVTable title="Por nivel de formación" rows={breakdowns.porNivel} labelCol="nivel_formacion" labelHeader="Nivel de formación" />
              <KVTable title="Por modalidad" rows={breakdowns.porModalidad} labelCol="metodologia" labelHeader="Modalidad" />
              <KVTable title="Por sector" rows={breakdowns.porSector} labelCol="sector_ies" labelHeader="Sector" />
              <KVTable title="Por sexo" rows={breakdowns.porSexo} labelCol="sexo" labelHeader="Sexo" />
              <KVTable title="Top 10 instituciones" rows={breakdowns.porInst} labelCol="institucion" labelHeader="Institución" />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
