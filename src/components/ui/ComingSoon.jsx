import { Hammer } from "lucide-react";

export function ComingSoon({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 py-20 text-slate-400">
      <Hammer size={28} />
      <p className="text-sm font-medium">{label} — en construcción</p>
    </div>
  );
}
