import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@zetis/ui";

import { type AuthUser, fetchMe, login, logout } from "../lib/auth";
import { DEFAULT_API_URL, getApiUrl, setApiUrl } from "../lib/storage";

export function Options() {
  const [apiUrl, setUrl] = useState(DEFAULT_API_URL);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setUrl(await getApiUrl());
      setUser(await fetchMe());
    })();
  }, []);

  async function saveUrl(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const clean = apiUrl.trim().replace(/\/+$/, "");
      // Backend distant : on demande la permission d'hôte (geste utilisateur).
      if (!/^http:\/\/localhost:8000/.test(clean)) {
        const origin = new URL(clean).origin + "/*";
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (!granted) throw new Error("Permission d’accès au backend refusée.");
      }
      await setApiUrl(clean);
      setUrl(clean);
      setNotice({ kind: "ok", text: "URL du backend enregistrée." });
    } catch (err) {
      setNotice({ kind: "err", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  async function doLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const me = await login(username, password);
      setUser(me);
      setPassword("");
      setNotice({ kind: "ok", text: `Connecté en tant que ${me.username}.` });
    } catch (err) {
      setNotice({ kind: "err", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  async function doLogout() {
    await logout();
    setUser(null);
    setNotice({ kind: "ok", text: "Déconnecté." });
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold">ZETIS Clip — Options</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Outil de capture réservé à Papa. Les sources capturées arrivent en attente de validation.
        </p>
      </header>

      {notice && (
        <p
          className={
            notice.kind === "ok"
              ? "rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary"
              : "rounded-lg border border-papa-warn/40 bg-papa-warn/10 px-3 py-2 text-sm text-papa-warn"
          }
        >
          {notice.text}
        </p>
      )}

      <form className="flex flex-col gap-2" onSubmit={saveUrl}>
        <h2 className="text-sm font-semibold">Backend ZETIS</h2>
        <input
          className="w-full px-3 py-2 text-sm"
          value={apiUrl}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={DEFAULT_API_URL}
        />
        <Button type="submit" variant="outline" disabled={busy}>
          Enregistrer l’URL
        </Button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Connexion Papa</h2>
        {user ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm">
            <span>
              Connecté : <strong>{user.username}</strong>
            </span>
            <Button size="sm" variant="ghost" onClick={() => void doLogout()}>
              Se déconnecter
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={doLogin}>
            <input
              className="w-full px-3 py-2 text-sm"
              placeholder="Identifiant"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 text-sm"
              type="password"
              placeholder="Mot de passe"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" disabled={busy || !username || !password}>
              Se connecter
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Erreur inconnue";
}
