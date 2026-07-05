import { useEffect, useState } from "react";
import { useAuth } from "@zetis/auth";
import { PROFILE } from "../data/mock";
import { fetchGamificationSummary } from "../lib/gamification";
import { NeuralCubes } from "./NeuralCubes";
import { NeuralLinks } from "./NeuralLinks";

// Header global de l'interface Massimo : bannière ZETIS compacte (recadrée) +
// oscilloscope animé + avatar/niveau/XP/Déconnexion en superposition.
// Affiché en haut de toutes les pages (cf. MassimoLayout).
export function MassimoBannerHeader() {
  const { user, logout } = useAuth();
  const [level, setLevel] = useState(PROFILE.level);
  const [totalXp, setTotalXp] = useState(PROFILE.xp);

  // Niveau / XP en direct (gamification), avec repli sur le mock PROFILE.
  useEffect(() => {
    let active = true;
    fetchGamificationSummary()
      .then((s) => {
        if (!active) return;
        setLevel(s.level);
        setTotalXp(s.total_xp);
      })
      .catch(() => {
        /* on garde le repli PROFILE */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="relative h-24 shrink-0 overflow-hidden border-b border-zetis-border bg-[#000010] sm:h-28">
      {/* Lueur centrale douce. */}
      <div className="pointer-events-none absolute left-1/2 top-[40%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(98,199,255,0.18),transparent_70%)]" />

      {/* Réseau neuronal : lignes du cercle vers les bords (sous l'emblème). */}
      <NeuralLinks />

      {/* Emblème : cercle + livre extrait de la bannière (les traînées d'onde,
          hors du cercle, ne sont plus visibles → plus d'oscilloscope). */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[40%] h-[5.25rem] w-[5.25rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          backgroundImage: "url(/zetis-banner.png)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "356px 107px",
          backgroundPosition: "-136px -2px",
        }}
      />

      {/* Cubes neuronaux + halo autour du cercle. */}
      <NeuralCubes />

      <div className="relative flex h-full items-center justify-between px-5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md">
          <img
            src="/massimo-avatar.png"
            alt=""
            aria-hidden
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-cyan-400/60"
          />
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-100">Massimo</p>
            <p className="text-xs text-slate-300">
              Niveau {level} · {totalXp} XP
            </p>
          </div>
          {user && (
            <button
              type="button"
              onClick={logout}
              className="ml-1 rounded-lg px-2 py-1 text-xs text-slate-300 transition-colors hover:text-white"
            >
              Déconnexion
            </button>
          )}
        </div>

        <p className="hidden text-sm text-slate-200 drop-shadow sm:block">
          Aujourd'hui — prêt à apprendre&nbsp;?
        </p>
      </div>
    </header>
  );
}
