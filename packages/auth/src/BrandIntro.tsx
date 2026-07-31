import { useCallback, useEffect, useRef, useState } from "react";

// Intro de marque ZETIS, plein écran, commune aux deux frontends.
// Jouée une fois par session (cf. `introGate`), au-dessus de la page de connexion
// qui est déjà montée derrière : la sortie en fondu révèle le login sans à-coup.
//
// Règle d'or : l'intro ne doit JAMAIS empêcher de se connecter. Autoplay refusé,
// fichier absent, décodage impossible → on rend la main immédiatement.

interface BrandIntroProps {
  /** Appelé quand l'intro est terminée ou coupée (l'overlay peut être démonté). */
  onDone: () => void;
}

// Les lettres atteignent leur pic de netteté vers 5,9 s puis l'animation les efface
// en fondu. On enchaîne en fondu doux vers le poster (= cette même image) à cet instant,
// pour que le wordmark ZETIS reste affiché. (Le poster est la frame ~177.)
const FREEZE_AT_SECONDS = 5.9;
const HOLD_MS = 600; // temps de lecture du wordmark figé avant de sortir
const FADE_OUT_MS = 500; // doit rester aligné sur `duration-500` ci-dessous
// Garde-fou : si la vidéo se bloque (réseau, décodage), on passe au poster et on sort.
const MAX_WAIT_MS = 8000;

export function BrandIntro({ onDone }: BrandIntroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [settled, setSettled] = useState(false); // fondu vers le poster
  const [leaving, setLeaving] = useState(false); // fondu de sortie de l'overlay

  // `onDone` peut changer d'identité entre deux rendus : on le lit par ref pour ne
  // pas relancer les minuteries, et on garde un verrou anti double-appel.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  const leave = useCallback(() => setLeaving(true), []);

  // Lecture de l'animation à l'arrivée. Un refus de lecture (politique d'autoplay,
  // onglet en arrière-plan) ne coupe pas l'intro : on bascule sur le poster, qui suit
  // ensuite le chemin de sortie normal. `cancelled` neutralise le premier montage du
  // StrictMode en dev, dont le `play()` est interrompu par le second (AbortError).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      setSettled(true);
      return;
    }
    let cancelled = false;
    v.currentTime = 0;
    v.play().catch(() => {
      if (!cancelled) setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filet de sécurité : jamais d'overlay bloqué sur une vidéo qui ne progresse pas.
  useEffect(() => {
    if (settled) return;
    const t = setTimeout(() => setSettled(true), MAX_WAIT_MS);
    return () => clearTimeout(t);
  }, [settled]);

  // N'importe quelle touche coupe l'intro (le bouton « Passer » couvre la souris).
  useEffect(() => {
    const onKeyDown = () => leave();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leave]);

  // Wordmark figé affiché un court instant, puis sortie.
  useEffect(() => {
    if (!settled || leaving) return;
    const t = setTimeout(leave, HOLD_MS);
    return () => clearTimeout(t);
  }, [settled, leaving, leave]);

  // Fin du fondu de sortie → l'overlay peut être démonté.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(finish, FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [leaving, finish]);

  return (
    <div
      onClick={leave}
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#000010] px-6 py-10 transition-opacity duration-500 ease-in-out ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Halos lumineux d'arrière-plan (mêmes teintes que la page de connexion). */}
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-[120px]" />

      <div className="relative w-full max-w-4xl">
        <video
          ref={videoRef}
          src="/zetis-logo.mp4"
          poster="/zetis-logo.png"
          autoPlay
          muted
          playsInline
          preload="auto"
          onTimeUpdate={(e) => {
            // Avant le fondu final de l'animation, on enchaîne en douceur sur le poster.
            if (!settled && e.currentTarget.currentTime >= FREEZE_AT_SECONDS) {
              setSettled(true);
              e.currentTarget.pause();
            }
          }}
          onEnded={() => setSettled(true)}
          onError={() => setSettled(true)}
          aria-label="ZETIS — ton savoir, ton évolution"
          className={`block h-full w-full object-contain drop-shadow-[0_0_45px_rgba(99,102,241,0.3)] [mask-image:radial-gradient(78%_54%_at_50%_50%,black_42%,transparent_100%)] transition-opacity duration-700 ease-in-out ${
            settled ? "opacity-0" : "opacity-100"
          }`}
        />
        {/* Poster figé (lettres nettes) en fondu d'entrée. */}
        <img
          src="/zetis-logo.png"
          alt=""
          aria-hidden
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain drop-shadow-[0_0_45px_rgba(99,102,241,0.3)] [mask-image:radial-gradient(78%_54%_at_50%_50%,black_42%,transparent_100%)] transition-opacity duration-700 ease-in-out ${
            settled ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <button
        type="button"
        onClick={leave}
        className="absolute bottom-6 right-6 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-400 transition-colors hover:border-white/25 hover:text-slate-200"
      >
        Passer
      </button>
    </div>
  );
}
