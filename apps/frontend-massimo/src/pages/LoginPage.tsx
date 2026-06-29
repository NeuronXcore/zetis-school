import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ZetisAvatar } from "../components/ZetisAvatar";

// Page de connexion Massimo (Étape 6).
export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("massimo");
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
        className="w-full max-w-sm rounded-2xl border border-zetis-border bg-zetis-surface p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <ZetisAvatar size={44} />
          <div>
            <p className="text-lg font-bold">Salut Massimo&nbsp;!</p>
            <p className="text-xs text-zetis-muted">Connecte-toi pour commencer</p>
          </div>
        </div>

        <label className="mb-3 block text-sm">
          <span className="text-zetis-muted">Identifiant</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zetis-border bg-zetis-bg px-3 py-2 outline-none focus:border-zetis-accent"
            autoComplete="username"
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="text-zetis-muted">Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zetis-border bg-zetis-bg px-3 py-2 outline-none focus:border-zetis-accent"
            autoComplete="current-password"
          />
        </label>

        {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-zetis-accent px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Connexion…" : "Je me connecte"}
        </button>
      </form>
    </div>
  );
}
