import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { DuckDBProvider, useDuckDB } from "../lib/duckdb";
import { deriveKey, exportKeyToB64, importKeyFromB64, AuthError } from "../lib/crypto";
import logo from "../assets/logo.png";

// solo vive mientras la pestaña siga abierta (a diferencia de localStorage,
// que persistiría la llave indefinidamente) -- evita pedir la contraseña de
// nuevo en cada recarga sin dejarla guardada permanentemente en el navegador.
const SESSION_KEY = "msh_dk";

// vive DENTRO de <DuckDBProvider> para poder leer su estado -- si el error es
// un AuthError (la llave no desencriptó los datos reales), avisa para volver
// a pedir la contraseña; si carga bien, guarda la llave de la sesión.
function AuthWatcher({ onAuthError, onSuccess, children }) {
  const { error, ready } = useDuckDB();
  useEffect(() => {
    if (error instanceof AuthError) onAuthError();
  }, [error, onAuthError]);
  useEffect(() => {
    if (ready) onSuccess();
  }, [ready, onSuccess]);
  return children;
}

export function AuthGate({ children }) {
  const [key, setKey] = useState(null);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // si ya se validó la contraseña en esta pestaña, no volver a pedirla.
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return;
    importKeyFromB64(stored)
      .then(setKey)
      .catch(() => sessionStorage.removeItem(SESSION_KEY));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setChecking(true);
    setWrongPassword(false);
    setKey(await deriveKey(password));
  }

  function handleAuthError() {
    sessionStorage.removeItem(SESSION_KEY);
    setChecking(false);
    setWrongPassword(true);
    setKey(null);
  }

  async function handleSuccess() {
    if (key) sessionStorage.setItem(SESSION_KEY, await exportKeyToB64(key));
  }

  if (!key) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-[var(--shadow-card-hover)]"
        >
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <img src={logo} alt="Politécnico Grancolombiano" className="h-14 w-auto" />
            <div>
              <h1 className="text-[16px] font-bold tracking-tight text-brand-navy-900">Market Share — Acceso</h1>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">Ingresa la contraseña para ver el mercado de educación superior.</p>
            </div>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 pr-10 text-[13.5px] text-brand-navy-900 outline-none transition-all focus:border-brand-cyan focus:bg-white focus:ring-[3px] focus:ring-brand-cyan-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              tabIndex={-1}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-navy-700"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {wrongPassword && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-rose-600">
              <ShieldAlert size={13} /> Contraseña incorrecta.
            </p>
          )}
          <button
            type="submit"
            disabled={!password || checking}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy-900 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_-3px_rgb(15_56_90_/_0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgb(15_56_90_/_0.55)] disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {checking && <Loader2 size={14} className="animate-spin" />}
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <DuckDBProvider decryptKey={key}>
      <AuthWatcher onAuthError={handleAuthError} onSuccess={handleSuccess}>
        {children}
      </AuthWatcher>
    </DuckDBProvider>
  );
}
