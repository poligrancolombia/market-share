import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { DuckDBProvider, useDuckDB } from "../lib/duckdb";
import { deriveKey, exportKeyToB64, importKeyFromB64, AuthError } from "../lib/crypto";

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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[var(--shadow-card)]"
        >
          <div className="mb-5 flex flex-col items-center gap-2 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-navy-900 text-white shadow-[var(--shadow-glow)]">
              <KeyRound size={20} />
            </span>
            <h1 className="text-[15px] font-semibold text-brand-navy-900">Market Share — Acceso</h1>
            <p className="text-[12.5px] text-slate-500">Ingresa la contraseña para ver el mercado de educación superior.</p>
          </div>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13.5px] text-brand-navy-900 outline-none focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan-100"
          />
          {wrongPassword && (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-rose-600">
              <ShieldAlert size={13} /> Contraseña incorrecta.
            </p>
          )}
          <button
            type="submit"
            disabled={!password || checking}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-navy-900 py-2.5 text-[13.5px] font-semibold text-white transition-opacity disabled:opacity-50"
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
