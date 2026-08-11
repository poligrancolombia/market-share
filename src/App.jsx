import { useState } from "react";
import { BarChart3, LineChart, Swords, Table2, Telescope, Layers, UserSquare2, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import logo from "./assets/logo.png";
import { useDuckDB } from "./lib/duckdb";
import { AuthGate } from "./components/AuthGate";
import { FiltersProvider } from "./state/FiltersContext";
import { FiltersPanel } from "./components/FiltersPanel";
import { Tabs } from "./components/ui/Tabs";
import { Historico } from "./tabs/Historico";
import { Explorador } from "./tabs/Explorador";
import { Panorama } from "./tabs/Panorama";
import { MercadoCompetencia } from "./tabs/MercadoCompetencia";
import { PerfilIES } from "./tabs/PerfilIES";
import { Oferta } from "./tabs/Oferta";
import { Validacion } from "./tabs/Validacion";

const TAB_DEFS = [
  { id: "historico", label: "Histórico", icon: Table2, Component: Historico },
  { id: "explorador", label: "Explorador", icon: Telescope, Component: Explorador },
  { id: "panorama", label: "Panorama", icon: BarChart3, Component: Panorama },
  { id: "competencia", label: "Mercado Competencia", icon: Swords, Component: MercadoCompetencia },
  { id: "perfil-ies", label: "Perfil IES", icon: UserSquare2, Component: PerfilIES },
  { id: "oferta", label: "Oferta", icon: Layers, Component: Oferta },
  { id: "validacion", label: "Validación", icon: LineChart, Component: Validacion },
];

function StatusBar() {
  const { ready, error, message } = useDuckDB();
  const Icon = error ? AlertTriangle : ready ? CheckCircle2 : Loader2;
  const tone = error ? "border-rose-200 bg-rose-50 text-rose-700" : ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <div className={`mb-6 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium ${tone}`}>
      <Icon size={15} className={!ready && !error ? "animate-spin" : ""} />
      {message}
    </div>
  );
}

function Shell() {
  const [tab, setTab] = useState("historico");
  const { ready } = useDuckDB();
  const active = TAB_DEFS.find((t) => t.id === tab);
  const ActiveComponent = active?.Component;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8 lg:px-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-navy-900 text-white shadow-[var(--shadow-glow)]">
            <BarChart3 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-brand-navy-900">Market Share — Educación Superior</h1>
            <p className="text-[13px] text-slate-500">SNIES 2016-2025, mercado nacional completo · Politécnico Grancolombiano vs. competencia</p>
          </div>
        </div>
        <img src={logo} alt="Politécnico Grancolombiano" className="h-10 w-auto shrink-0" />
      </header>

      <StatusBar />

      <div className="mb-6">
        <FiltersProvider>
          <FiltersPanel />

          <div className="mt-8">
            <Tabs tabs={TAB_DEFS} active={tab} onChange={setTab} />
            <div className="pt-6">{ready && ActiveComponent && <ActiveComponent />}</div>
          </div>
        </FiltersProvider>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}
