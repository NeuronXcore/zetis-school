import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@zetis/auth";

// Page de connexion Papa (Étape 6).
export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("papa");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-papa-border bg-papa-surface p-6"
      >
        <div className="mb-5">
          <p className="text-lg font-bold">
            ZETIS <span className="text-papa-accent">Papa</span>
          </p>
          <p className="text-xs text-papa-muted">Cockpit de pilotage — connexion</p>
        </div>

        <label className="mb-3 block text-sm">
          <span className="text-papa-muted">Identifiant</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 outline-none focus:border-papa-accent"
            autoComplete="username"
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="text-papa-muted">Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 outline-none focus:border-papa-accent"
            autoComplete="current-password"
          />
        </label>

        {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-papa-accent px-4 py-2.5 font-semibold text-papa-bg disabled:opacity-60"
        >
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
