import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@zetis/auth";
import { PROFILE } from "../data/mock";
import { fetchGamificationSummary } from "../lib/gamification";
import { HeaderGalaxy } from "./header/HeaderGalaxy";
import "./headerFx.css";

// Header global de l'interface Massimo : bannière ZETIS compacte (recadrée) + la GALAXIE DE
// MASSIMO qui se construit dessous + avatar/niveau/XP/Déconnexion en superposition.
// Affiché en haut de toutes les pages (cf. MassimoLayout).
//
// ⚠️ Le décor génératif d'avant (`NeuralCubes`, 22 cubes ; `NeuralLinks`, 8 liens SVG) a été
// SUPPRIMÉ le 2026-08-04. Il était joli mais ne disait rien, et il maintenait 78 animations
// infinies + ~38 éléments repeints à chaque image, sur les 21 routes, en permanence. Ce qui le
// remplace dit quelque chose de vrai — les notions que Massimo a réellement travaillées — et se
// FIGE au bout de ~3,2 s. Ne pas les réintroduire « pour faire vivant » : c'est la galaxie qui
// fait vivant, maintenant.
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

      {/* La galaxie de Massimo, qui pousse depuis le centre de l'emblème (sous lui). */}
      <HeaderGalaxy />

      {/* Emblème : cercle + livre extrait de la bannière (les traînées d'onde,
          hors du cercle, ne sont plus visibles → plus d'oscilloscope).
          ⚠️ Cadrage verrouillé par un test : `356px 107px` à `-136px -2px`. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[40%] h-[5.25rem] w-[5.25rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          backgroundImage: "url(/zetis-banner.png)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "356px 107px",
          backgroundPosition: "-136px -2px",
          // Translucide depuis le 2026-08-04 : l'emblème fait 84 px opaques posés PILE sur la
          // racine du graphe et ses premières branches — il cachait le point d'où tout part. À
          // 65 %, le cercle et le livre restent lisibles comme forme, et on VOIT la galaxie
          // sortir du logo au lieu de la deviner. Propriété composable : coût nul.
          opacity: 0.65,
        }}
      />

      {/* Halo autour de l'emblème. Conservé quand les cubes sont partis : ses deux animations
          portent sur `opacity` et `transform`, composables — elles ne repeignent rien. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <span className="hfx-halo-glow h-36 w-36" />
        <span className="hfx-halo-ring h-[5.5rem] w-[5.5rem]" />
      </div>

      <div className="relative flex h-full items-center justify-between px-5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md">
          <img
            src="/massimo-avatar.png"
            alt=""
            aria-hidden
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-cyan-400/60"
          />
          {/* Le niveau ouvre la galaxie (ADR-0024 §7) : le bandeau est présent sur toutes
              les pages, c'est l'accès permanent à la progression. */}
          <Link
            to="/galaxy"
            className="rounded-lg px-1 py-0.5 text-left transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            aria-label={`Massimo, niveau ${level}, ${totalXp} XP — voir ma galaxie`}
          >
            <p className="text-sm font-semibold text-slate-100">Massimo</p>
            <p className="text-xs text-slate-300">
              Niveau {level} · {totalXp} XP
            </p>
          </Link>
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
