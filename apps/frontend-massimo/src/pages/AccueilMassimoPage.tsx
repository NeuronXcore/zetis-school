import { Suspense, lazy, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@zetis/auth";
import { useAccueil } from "../hooks/useAccueil";
import { useMotivationWeek } from "../hooks/useMotivationWeek";
import { HomeAgendaBanner } from "../components/agenda/HomeAgendaBanner";
import { HomeGalaxyCard } from "../components/galaxy/HomeGalaxyCard";
import { ProgressSparkline } from "../components/galaxy/ProgressSparkline";
import { RecentGains } from "../components/home/RecentGains";
import { SkyMap } from "../components/home/SkyMap";
import { ZetisHeroSlot } from "../components/home/ZetisHeroSlot";
import { ZetisMessageCard } from "../components/motivation/ZetisMessageCard";
import { WeekDots } from "../components/motivation/WeekDots";
import { WeekGoalPicker } from "../components/motivation/WeekGoalPicker";

// Accueil Massimo — spec `docs/frontend-massimo/page-accueil.md`, recomposée le 2026-07-31
// (addendum ADR-0024, slice B).
//
// Cette page affichait auparavant TROIS nombres inventés tirés de `data/mock.ts` et un bouton
// « Commencer » sans handler : ZETIS félicitait Massimo pour des chiffres qui n'existaient pas.
// Tout ce qui est affiché ici vient du serveur, ou n'est pas affiché.
//
// Ce que l'Accueil ne fait PLUS depuis le 2026-07-31 : le canvas Galaxy 3D (parti dans
// `/galaxy` — l'Accueil ne charge plus Three.js, ni directement ni transitivement) et le
// compteur de révisions en retard (`total_due`, remplacé par `flash_size`) — un compteur de
// retard sur l'écran d'accueil est la pression quotidienne anxiogène qu'interdit `CLAUDE.md`.
//
// Enrichie le même jour (addendum « Accueil vivant ») : « Mon ciel », « Mon chemin » et « Tes
// derniers gains ». La frise, elle, REVIENT — elle avait été emportée par association avec le
// canvas, alors que le coût à annuler était Three.js et pas quelques lignes de SVG.
//
// UNE SEULE ACTION ACCENTUÉE sur la page : « Commencer ». Tout le reste est secondaire ou une
// simple porte. Quand il n'y a pas de mission, la page n'a AUCUNE action accentuée — et c'est
// un état valide, pas un défaut à compenser. Ce qui est ajouté ici se REGARDE : le chemin
// parcouru n'appelle aucun geste, il ne se dispute donc pas avec « Commencer ».
//
// Règle de tenue : AUCUN message technique à l'écran de l'enfant. Un appel qui échoue rend un
// bloc silencieux ou un état serein — jamais un code d'erreur, jamais du rouge.

/** Prénom d'affichage, dérivé du compte connecté (« massimo » → « Massimo »). Repli seulement :
 *  le vrai prénom vient du message d'accueil serveur. */
function displayName(username: string): string {
  return username ? username.charAt(0).toUpperCase() + username.slice(1) : "";
}

// ⚠️ `lazy()` OBLIGATOIRE, et c'est une contrainte d'architecture (ADR-0029 §1) : la modale de
// rejeu charge Three.js. Un import statique ici remettrait 1,37 Mo sur la page d'atterrissage
// sans qu'aucun test ne le voie — `accueil.bundle.test.ts` ne parcourt que les imports
// STATIQUES, précisément pour mesurer ce qui est téléchargé au premier paint.
const GalaxyReplayModal = lazy(() =>
  import("../components/home/GalaxyReplayModal").then((m) => ({ default: m.GalaxyReplayModal })),
);

const SHORTCUT_CLASS =
  "rounded-2xl border border-zetis-border bg-zetis-surface p-4 transition-transform hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100";

export function AccueilMassimoPage() {
  const { user } = useAuth();
  const {
    welcome,
    today,
    reviews,
    capsules,
    subjects,
    xpHistory,
    timeline,
    gamification,
    loading,
    refreshWelcome,
  } = useAccueil();
  // Changer d'engagement change ce que ZETIS a à dire : on le recharge.
  const week = useMotivationWeek(refreshWelcome);
  const elected = today?.elected ?? null;
  const name = welcome?.context.first_name || displayName(user?.username ?? "");

  // Un raccourci sans contenu disponible N'EST PAS RENDU : la ligne se resserre. Pas de carte
  // grisée ici — contrairement au panneau d'actions de la Galaxy, où le grisé documente le
  // catalogue de ce que Papa pourra produire.
  const hasFlash = (reviews?.flash_size ?? 0) > 0;
  const hasCapsules = (capsules?.total ?? 0) > 0;

  // La modale n'est montée qu'après un clic : c'est ce qui garde l'Accueil à zéro Three.js au
  // premier paint, malgré le rejeu 3D qu'elle contient.
  const [replaying, setReplaying] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      {/* ── 1. Salutation + message ZETIS ──────────────────────────────────────────────
          `title` / `subtitle` sont rendus VERBATIM. Si l'appel échoue, la carte n'est pas
          rendue : AUCUNE phrase de secours, aucun bandeau motivationnel générique à côté —
          une phrase fabriquée côté client serait exactement le mensonge que cette page a
          cessé d'afficher, et « garde le cap » serait en plus une relance. */}
      <h1 className="text-2xl font-bold">Bonjour{name ? ` ${name}` : ""} 👋</h1>
      {welcome && (
        <div className="mt-3">
          <ZetisMessageCard message={welcome} />
        </div>
      )}

      {/* Agenda (ADR-0025) — conservé, hors des cinq blocs de la spec.
          ⚠️ Ne pas retirer « pour coller à la maquette » : en phase 0 c'est le seul endroit
          où Massimo VOIT ce qui vient du collège sans y aller. La maquette v2 et la spec ne le
          montrent pas — c'est la doc qui était en retard, arbitré le 2026-07-31. */}
      <div className="mt-4">
        <HomeAgendaBanner />
      </div>

      {/* ── 2. Mission du jour — carte héro, SEUL chemin guidé de la page ───────────────
          `elected: null` n'est pas une erreur : c'est l'état serein prévu par la spec. */}
      <section className="mt-4 rounded-2xl border border-zetis-border bg-zetis-surface p-6">
        {loading && <p className="text-sm text-zetis-muted">Chargement…</p>}

        {!loading && elected && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
              Mission du jour
            </p>
            <h2 className="mt-1 text-xl font-bold">{elected.title}</h2>
            <p className="mt-1 text-sm text-zetis-muted">
              {elected.subject} · {elected.estimated_minutes} min · +{elected.xp_reward} XP
            </p>
            {/* Raison SERVIE telle quelle, jamais recomposée côté client. */}
            {today?.reason && <p className="mt-2 text-sm text-zetis-muted">{today.reason}</p>}
            <Link
              to="/missions"
              state={{ openMissionId: elected.id }}
              className="mt-4 inline-block rounded-xl bg-zetis-accent px-5 py-2.5 font-semibold text-white transition-transform hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              Commencer →
            </Link>
          </>
        )}

        {/* Rien d'obligatoire : la carte héro PERD son bouton plein, et aucun autre bloc n'en
            gagne un à sa place. Une page sans action accentuée est un état valide. */}
        {!loading && !elected && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
              Aujourd'hui
            </p>
            <h2 className="mt-1 text-xl font-bold">Rien d'obligatoire maintenant</h2>
            <p className="mt-2 text-sm text-zetis-muted">
              Tu peux choisir une matière, ou faire une révision rapide.
            </p>
            <Link
              to="/matieres"
              className="mt-3 inline-block text-sm font-bold text-zetis-accent-2 underline-offset-4 hover:underline"
            >
              Choisir une matière →
            </Link>
          </>
        )}
      </section>

      {/* ── 3. Ma Galaxie — REMONTÉE ICI et passée en PLEINE LARGEUR le 2026-07-31 ────
          Elle était en bas, dans une colonne étroite à côté de « Ma semaine » : la galaxie qui
          s'y construisait se voyait à peine. Une animation qu'il faut chercher ne donne pas de
          vie à une page — c'était tout l'objet de l'addendum « la galaxie revient sur
          l'Accueil ». Elle est donc haute, large, et juste après la seule action de la page. */}
      {subjects && <HomeGalaxyCard subjects={subjects} />}

      {/* ── 3. Mon ciel — le chemin parcouru, sans grille ni axe de temps ──────────────
          Une étoile par jour de gain. Voir `SkyMap` : l'absence de grille n'est pas un choix
          graphique, c'est ce qui rend la carte incapable de désigner un jour manqué. */}
      {xpHistory && xpHistory.days.length > 0 && (
        <SkyMap
          days={xpHistory.days}
          onReplay={() => setReplaying(true)}
          className="mt-4"
        />
      )}

      {replaying && (
        <Suspense fallback={null}>
          <GalaxyReplayModal onClose={() => setReplaying(false)} />
        </Suspense>
      )}

      {/* ── 4. Ma semaine ──────────────────────────────────────────────────────────────
          Seule depuis le 2026-07-31 : « Ma Galaxie » lui tenait compagnie ici, elle est
          remontée plus haut pour qu'on la voie. */}
      <div className="mt-4">
        {/* La grille et le geste d'engagement dans la MÊME carte : l'action et son effet au
            même endroit. Sept cases servies par le serveur — le client ne construit aucune
            grille et ne calcule aucune date. */}
        {week.week && (
          <section className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
              Ma semaine
            </p>
            <div className="mt-3">
              <WeekDots week={week.week} />
            </div>
            <WeekGoalPicker
              goalDays={week.week.goal_days}
              onChoose={week.chooseGoal}
              pending={week.pending}
            />
            {week.notice && <p className="mt-2 text-sm text-zetis-muted">{week.notice}</p>}
          </section>
        )}

      </div>

      {/* ── 5. Mon chemin · Tes derniers gains ─────────────────────────────────────────
          Deux lectures du même acquis : la courbe pour l'allure, la liste pour le détail
          immédiat. Les deux se REGARDENT, aucune n'est une action. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {timeline && timeline.points.length > 1 && (
          <section className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
              Mon chemin
            </p>
            {/* ⚠️ SVG maison, AUCUN Three.js : c'est ce qui permet à la frise de revenir ici
                sans rouvrir le motif du §B (test de budget de bundle).
                ⚠️ La série est CREUSE — le composant espace ses points uniformément, donc son
                axe X n'est PAS le temps. Ne jamais l'annoter d'une date. */}
            <ProgressSparkline timeline={timeline} className="mt-3" />
          </section>
        )}

        {gamification && (
          <RecentGains recent={gamification.recent} badges={gamification.badges} />
        )}
      </div>

      {/* ── 6. Trois raccourcis, tous SECONDAIRES (bordure, jamais plein) ──────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {hasFlash && (
          <Link to="/revision" className={SHORTCUT_CLASS}>
            <div className="text-xl">⚡</div>
            <p className="mt-1 font-semibold">Révision éclair</p>
            {/* `flash_size`, PLAFONNÉ SERVEUR — et jamais `total_due`. */}
            <p className="text-xs text-zetis-muted">{reviews?.flash_size} cartes</p>
          </Link>
        )}
        {hasCapsules && (
          <Link to="/capsules" className={SHORTCUT_CLASS}>
            <div className="text-xl">🎬</div>
            <p className="mt-1 font-semibold">Capsule IA</p>
            <p className="text-xs text-zetis-muted">
              {capsules && capsules.new_count > 0
                ? `${capsules.new_count} nouvelle${capsules.new_count > 1 ? "s" : ""}`
                : "Une notion en vidéo"}
            </p>
          </Link>
        )}
        {/* ELI5 est TOUJOURS proposée : elle ne dépend d'aucun contenu préexistant (même règle
            que le panneau d'actions de la Galaxy côté serveur). */}
        <Link to="/eli5" className={SHORTCUT_CLASS}>
          <div className="text-xl">💡</div>
          <p className="mt-1 font-semibold">ELI5</p>
          <p className="text-xs text-zetis-muted">Une notion expliquée simplement</p>
        </Link>
      </div>

      {/* ── 5. Héros ZETIS — SLOT structuré, non rendu (cf. le composant) ─────────────── */}
      <div className="mt-4">
        <ZetisHeroSlot />
      </div>
    </div>
  );
}
