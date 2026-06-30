import { type FormEvent, type ReactNode, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

// Écran de démarrage + connexion ZETIS, partagé par les deux frontends.
// L'auth étant par app (chaque app n'accepte que son rôle), le sélecteur de profil
// REDIRIGE vers l'autre frontend (`otherAppUrl`) au lieu de tenter une connexion locale.

interface LoginScreenProps {
  role: "massimo" | "papa";
  /** URL du frontend de l'autre profil (redirection croisée). */
  otherAppUrl: string;
  /** Wordmark de marque injecté par l'app (ex. `<LogoZetis />`). Fallback texte sinon. */
  brand?: ReactNode;
}

const ROLES = {
  massimo: { name: "MASSIMO", sub: "ESPACE ÉLÈVE", user: "massimo" },
  papa: { name: "PAPA", sub: "ESPACE PARENT", user: "papa" },
} as const;

// Icônes de marque sous le wordmark (apprendre, progresser, comprendre, suivre, réussir, échanger).
const BRAND_ICONS = [BookIcon, TargetIcon, BrainIcon, BarsIcon, TrophyIcon, ChatIcon];

export function LoginScreen({ role, otherAppUrl, brand }: LoginScreenProps) {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const me = ROLES[role];
  const other = role === "massimo" ? ROLES.papa : ROLES.massimo;

  const [username, setUsername] = useState<string>(me.user);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#000012] px-4 py-8 text-white md:px-8">
      {/* Halos lumineux d'arrière-plan */}
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-[120px]" />

      <div className="relative flex w-full max-w-7xl flex-col items-center gap-8 lg:flex-row lg:items-stretch lg:justify-center lg:gap-12">
        {/* Panneau de marque — emblème + wordmark ZETIS vectoriel qui s'assemble à l'arrivée. */}
        <div className="flex w-full flex-col items-center justify-center gap-6 lg:flex-1">
          <img
            src="/zetis-emblem.png"
            alt=""
            aria-hidden
            className="w-44 object-contain drop-shadow-[0_0_45px_rgba(99,102,241,0.35)] [mask-image:radial-gradient(closest-side,black_82%,transparent_100%)] sm:w-52 lg:w-60"
          />
          {brand ?? (
            <span className="text-4xl font-bold uppercase tracking-[0.35em] text-cyan-200 [text-shadow:0_0_14px_rgba(79,216,255,0.55)]">
              ZETIS
            </span>
          )}
          <div className="flex items-center gap-4 text-cyan-200/70">
            {BRAND_ICONS.map((Icon, i) => (
              <Icon key={i} className="h-5 w-5" />
            ))}
          </div>
        </div>

        {/* Carte de connexion */}
        <div className="flex w-full max-w-md flex-col justify-center rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl md:p-8">
          <h2 className="text-center text-xl font-medium tracking-[0.2em] text-slate-100">
            BIENVENUE SUR{" "}
            <span className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text font-bold text-transparent">
              ZETIS
            </span>
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Connecte-toi pour accéder à ton espace d'apprentissage intelligent.
          </p>

          {/* Sélecteur de profil */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div
              aria-current="true"
              className="flex items-center gap-3 rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-4 py-3"
            >
              <PersonIcon className="h-5 w-5 text-cyan-300" />
              <div className="text-left">
                <p className="text-sm font-semibold">{me.name}</p>
                <p className="text-[10px] tracking-wider text-slate-400">{me.sub}</p>
              </div>
            </div>
            <a
              href={otherAppUrl}
              className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-3 transition-colors hover:border-white/25 hover:bg-white/5"
            >
              <PersonIcon className="h-5 w-5 text-slate-400" />
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-200">{other.name}</p>
                <p className="text-[10px] tracking-wider text-slate-500">{other.sub}</p>
              </div>
            </a>
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <Field icon={<PersonIcon className="h-4 w-4" />}>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Identifiant"
                autoComplete="username"
                className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
            </Field>

            <Field
              icon={<LockIcon className="h-4 w-4" />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-slate-500 transition-colors hover:text-slate-300"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  <EyeIcon className="h-4 w-4" open={showPassword} />
                </button>
              }
            >
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                autoComplete="current-password"
                className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
            </Field>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-400">
                <input type="checkbox" defaultChecked className="accent-cyan-400" />
                Se souvenir de moi
              </label>
              <span className="cursor-default text-cyan-300/70" title="Identifiants gérés par Papa">
                Mot de passe oublié&nbsp;?
              </span>
            </div>

            {error && (
              <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-900/30 transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              {busy ? "Connexion…" : "Se connecter"}
              {!busy && <ArrowIcon className="h-4 w-4" />}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-white/10" />
            ou
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            disabled
            title="Bientôt disponible"
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 opacity-70"
          >
            <AppleIcon className="h-4 w-4" />
            Se connecter avec Apple
            <span className="ml-1 text-[10px] text-slate-500">(bientôt)</span>
          </button>

          <p className="mt-5 text-center text-xs text-slate-500">
            Besoin d'aide&nbsp;? <span className="text-cyan-300/80">Contacte-nous</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* — Sous-composants présentation — */

function Field({
  icon,
  trailing,
  children,
}: {
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 focus-within:border-cyan-400/50">
      <span className="text-slate-500">{icon}</span>
      <div className="flex-1">{children}</div>
      {trailing}
    </div>
  );
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ className, open }: { className?: string; open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
      {!open && <line x1="3" y1="3" x2="21" y2="21" strokeLinecap="round" />}
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.4 12.6c0-2 1.6-3 1.7-3.1-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.2 2-1.4 2.4-.4 6 1 8 .7 1 1.4 2.1 2.4 2 1-.1 1.3-.6 2.5-.6s1.5.6 2.6.6c1 0 1.7-1 2.3-2 .5-.7.8-1.5 1-2-.1 0-2.1-.8-2.1-3.7ZM14.6 6.3c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9 0 1.8-.4 2.3-1.1Z" />
    </svg>
  );
}

/* — Icônes de marque (sous le wordmark) — */
function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M12 6c-1.5-1-4-1.5-6.5-1.3v12C8 16.5 10.5 17 12 18m0-12c1.5-1 4-1.5 6.5-1.3v12C16 16.5 13.5 17 12 18m0-12v12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TargetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}
function BrainIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M9 6a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 5 11a2.5 2.5 0 0 0 1.5 2.3A2.5 2.5 0 0 0 9 18V6Z" strokeLinejoin="round" />
      <path d="M15 6a2.5 2.5 0 0 1 2.5 2.5A2.5 2.5 0 0 1 19 11a2.5 2.5 0 0 1-1.5 2.3A2.5 2.5 0 0 1 15 18V6Z" strokeLinejoin="round" />
      <path d="M12 6v12" />
    </svg>
  );
}
function BarsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className}>
      <path d="M6 18v-4M12 18V8M18 18v-7" />
    </svg>
  );
}
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={className}>
      <path d="M7 5h10v4a5 5 0 0 1-10 0V5Z" />
      <path d="M7 7H4.5a2.5 2.5 0 0 0 2.5 3M17 7h2.5a2.5 2.5 0 0 1-2.5 3M10 15v3M14 15v3M8.5 19h7" strokeLinecap="round" />
    </svg>
  );
}
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={className}>
      <path d="M5 6h14v9H9l-4 3V6Z" />
      <path d="M9 10.5h6" strokeLinecap="round" />
    </svg>
  );
}
