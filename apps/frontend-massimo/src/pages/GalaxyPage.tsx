import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { ProgressRing } from "../components/ProgressRing";
import { CloseFullscreenButton } from "../components/galaxy/CloseFullscreenButton";
import { GalaxySearch } from "../components/galaxy/GalaxySearch";
import { NotionActionPanel } from "../components/galaxy/NotionActionPanel";
import { SearchEmptyToast } from "../components/galaxy/SearchEmptyToast";
import { ProgressSparkline } from "../components/galaxy/ProgressSparkline";
import { SubjectConstellations } from "../components/galaxy/SubjectConstellations";
import { useGalaxy } from "../hooks/useGalaxy";
import { REASON_LABEL } from "../lib/gamification";
import type { GalaxyStatus } from "@zetis/types";
import {
  GalaxyFallbackList,
  GalaxyLegend,
  hasWebGL,
  maxNodesFor,
  searchMatches,
  statusCounts,
} from "@zetis/ui/galaxy";

// Page Ma Galaxie (`/galaxy`) = ZETIS Galaxy (ADR-0024, renommée par l'addendum du 2026-07-31).
//
// La Galaxy n'est pas une page de plus : elle EST la surface de progression. L'ancienne section
// « par matière », qui affichait des pourcentages MOCKÉS, a disparu — la galaxie est la donnée
// réelle qu'elle attendait. XP, badges et activité récente sont conservés autour du canvas.
//
// La route s'appelait `/progression` jusqu'au 2026-07-31 : un mot d'adulte hérité du mock que
// cette page remplaçait, alors qu'elle ne mesure rien. Renommage, pas ajout — `/progression`
// ne survit qu'en redirection permanente (`App.tsx`), et la surface reste UNIQUE.
//
// Ce que cette page ne fera jamais : un pourcentage de maîtrise, un classement de matières,
// une couleur d'échec, ou un capital qu'on peut perdre. Une étoile allumée ne s'éteint pas
// parce que Massimo n'est pas venu.

// Three.js (~600 Ko–1 Mo) n'entre dans le bundle que si Massimo ouvre une constellation.
// ⚠️ Le sous-chemin `/canvas` est indispensable : importer depuis `@zetis/ui/galaxy`
// (le baril léger) suffirait à embarquer Three.js au démarrage malgré le `lazy()`.
const GalaxyCanvas = lazy(() =>
  import("@zetis/ui/galaxy/canvas").then((m) => ({ default: m.GalaxyCanvas })),
);

/** La recherche porte sur une constellation ouverte, jamais sur la galaxie entière : chercher
 *  parmi toutes les matières renverrait des étoiles qu'on ne peut pas atteindre d'ici. */
const EMPTY_MATCHES = new Set<string>();

/** Un point d'étoile. Positions ÉCRITES À LA MAIN et non générées : un semis aléatoire produit
 *  des grumeaux et des trous, là où un ciel se compose. */
const star = (x: number, y: number, r: number, color: string) =>
  `radial-gradient(${r}px ${r}px at ${x}px ${y}px, ${color}, transparent)`;

/** Champ LOINTAIN — dense, fin, il dérive lentement et ne scintille pas. */
const STARS_FAR = [
  star(30, 24, 1.6, "rgba(255,255,255,.85)"), star(128, 62, 1.1, "rgba(255,255,255,.6)"),
  star(206, 18, 2, "rgba(200,220,255,.9)"), star(84, 96, 1.2, "rgba(255,255,255,.55)"),
  star(232, 104, 1.5, "rgba(220,235,255,.7)"), star(172, 44, 1, "rgba(255,255,255,.5)"),
  star(12, 78, 1.3, "rgba(255,255,255,.6)"), star(58, 52, 1, "rgba(210,225,255,.5)"),
  star(100, 12, 1.4, "rgba(255,255,255,.7)"), star(150, 112, 1.1, "rgba(235,242,255,.55)"),
  star(190, 80, 1.7, "rgba(255,255,255,.75)"), star(248, 40, 1.2, "rgba(215,230,255,.6)"),
  star(66, 122, 1, "rgba(255,255,255,.45)"), star(118, 88, 1.5, "rgba(240,246,255,.65)"),
  star(216, 66, 1, "rgba(255,255,255,.5)"), star(44, 8, 1.2, "rgba(225,236,255,.6)"),
].join(",");

/** Champ PROCHE — moins nombreux, plus gros, et c'est lui qui scintille. */
const STARS_NEAR = [
  star(22, 40, 2.2, "rgba(255,255,255,.95)"), star(96, 74, 1.8, "rgba(226,238,255,.9)"),
  star(158, 20, 2.4, "rgba(255,255,255,1)"), star(74, 12, 1.6, "rgba(210,228,255,.8)"),
  star(140, 86, 2, "rgba(255,255,255,.9)"), star(182, 56, 1.7, "rgba(235,243,255,.85)"),
  star(48, 90, 2.1, "rgba(255,255,255,.9)"),
].join(",");

export function GalaxyPage() {
  const galaxy = useGalaxy();
  const [searchParams, setSearchParams] = useSearchParams();
  const [webgl] = useState(hasWebGL);
  // État mis en évidence par les KPI. `null` = tout est montré.
  const [highlightStatus, setHighlightStatus] = useState<GalaxyStatus | null>(null);
  // Plein écran : les constellations vont se densifier, une vignette ne suffira plus.
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  }));
  const width = viewport.w;

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Échap sort du plein écran, et le corps ne défile pas derrière l'overlay.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const { summary, consolidated, constellation, notion, fullGraph, timeline } = galaxy;
  const levelProgress = summary
    ? Math.round((summary.xp_into_level / summary.xp_for_next) * 100)
    : 0;

  // Un filtre ne survit pas au changement de constellation : il porterait sur des étoiles
  // qui ne sont plus à l'écran.
  const subjectSlug = constellation?.subject.slug ?? null;
  useEffect(() => {
    setHighlightStatus(null);
    setQuery("");
  }, [subjectSlug]);

  // Recherche locale : aucune requête, la réponse suit la frappe. Une recherche en cours
  // remplace le filtre par état — deux mises en évidence simultanées seraient illisibles.
  const matchedIds = useMemo(
    () => (constellation ? searchMatches(constellation.nodes, query) : new Set<string>()),
    [constellation, query],
  );
  const searching = query.trim().length > 0;

  // Annonce « rien trouvé », APRÈS une pause de frappe. Sans ce délai, taper « épicentre »
  // ferait clignoter le message à chaque lettre intermédiaire qui ne correspond encore à
  // rien. Le message s'efface tout seul : il informe, il ne demande rien.
  const [emptyQuery, setEmptyQuery] = useState<string | null>(null);
  useEffect(() => {
    if (!searching || matchedIds.size > 0) {
      setEmptyQuery(null);
      return;
    }
    const show = window.setTimeout(() => setEmptyQuery(query.trim()), 450);
    return () => window.clearTimeout(show);
  }, [searching, matchedIds, query]);

  useEffect(() => {
    if (!emptyQuery) return;
    const hide = window.setTimeout(() => setEmptyQuery(null), 2800);
    return () => window.clearTimeout(hide);
  }, [emptyQuery]);

  // Une seule étoile trouvée → son panneau s'ouvre TOUT SEUL : Massimo a déjà dit ce qu'il
  // cherchait en le tapant, lui demander de cliquer dessus ensuite serait redondant.
  //
  // À PLUSIEURS correspondances, on n'ouvre rien : en choisir une serait arbitraire, et
  // ouvrir la mauvaise coûte plus cher que le clic qu'on aurait épargné. Le halo et le
  // cadrage suffisent à le laisser choisir.
  const autoOpenedRef = useRef<number | null>(null);
  useEffect(() => {
    if (matchedIds.size !== 1) return;
    const skillId = Number([...matchedIds][0].replace("skill-", ""));
    if (!Number.isFinite(skillId) || autoOpenedRef.current === skillId) return;
    autoOpenedRef.current = skillId;
    galaxy.openNotion(skillId);
  }, [matchedIds, galaxy]);

  // Effacer la recherche referme ce qu'elle avait ouvert — mais jamais un panneau que
  // Massimo avait ouvert lui-même en cliquant avant de chercher.
  useEffect(() => {
    if (searching) return;
    if (autoOpenedRef.current !== null) {
      autoOpenedRef.current = null;
      galaxy.closeNotion();
    }
  }, [searching, galaxy]);

  const counts = useMemo(
    () => (constellation ? statusCounts(constellation.nodes) : null),
    [constellation],
  );

  // Deep link `?subject=` — c'est par là que l'Accueil envoie Massimo quand il touche une
  // étoile ou trouve une notion : on ouvre DIRECTEMENT la bonne constellation. Le paramètre
  // est retiré en `replace` (patron `RevisionPage`) pour que le retour retombe sur la galaxie
  // et non sur une page qui se ré-ouvrirait toute seule.
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !galaxy.subjects) return;
    const slug = searchParams.get("subject");
    if (!slug) return;
    deepLinkedRef.current = true;
    galaxy.openSubject(slug);
    setFullscreen(true);
    setSearchParams({}, { replace: true });
  }, [galaxy, galaxy.subjects, searchParams, setSearchParams]);

  // Revenir à la galaxie referme le plein écran : il n'y a plus de constellation à agrandir.
  useEffect(() => {
    if (!constellation) setFullscreen(false);
  }, [constellation]);

  // Plafond adaptatif (ADR-0024 §6) : au-delà, on ne rend que les amas et Massimo déplie
  // un chapitre à la demande. Les valeurs sont provisoires, à mesurer sur les 3 appareils.
  const capped = useMemo(() => {
    if (!constellation) return null;
    const limit = maxNodesFor(width);
    if (constellation.nodes.length <= limit) return { ...constellation, truncated: false };
    const chapters = constellation.nodes.filter((n) => n.kind === "chapter");
    return { ...constellation, nodes: chapters, edges: [], truncated: true };
  }, [constellation, width]);

  // Le MÊME plafond, appliqué à la galaxie complète (addendum ADR-0024 §C : « il s'applique tel
  // quel »). Un graphe global rassemble bien plus de nœuds qu'une constellation : il mord
  // beaucoup plus tôt. Au-delà, on replie sur matières + chapitres — les notions restent
  // atteignables en ENTRANT dans une constellation, elles ne disparaissent pas.
  // ⚠️ Les valeurs (40 / 90 / 150) sont provisoires et mesurées sur aucun appareil réel : c'est
  // une dette ouverte de l'ADR-0024 §6, hors de ce chantier. Ne pas les « ajuster » au jugé.
  // ⚠️ Remplacé le 2026-07-31 : la vue d'arrivée n'affiche plus TOUT le graphe.
  //
  // Elle montre le **système solaire** — le cœur (cerveau) et les matières en orbite, rien
  // d'autre. Le graphe complet posé par simulation de forces produisait un amas où le cerveau
  // était à moitié enseveli et les libellés se chevauchaient (constaté au rendu réel). Les
  // notions restent atteignables en ENTRANT dans une constellation : elles ne disparaissent
  // pas, elles cessent d'être servies toutes en même temps.
  //
  // Effet de bord heureux : 8 planètes au lieu de 60 nœuds — le plafond adaptatif
  // (`GALAXY_MAX_NODES`, dette ADR-0024 §6) ne mord plus jamais sur cet écran.
  const solarSystem = useMemo(() => {
    if (!fullGraph) return null;
    const keep = new Set(
      fullGraph.nodes.filter((n) => n.kind === "root" || n.kind === "subject").map((n) => n.id),
    );
    const nodes = fullGraph.nodes.filter((n) => keep.has(n.id));
    const edges = fullGraph.edges.filter((e) => keep.has(e.source) && keep.has(e.target));

    // Les matières ENCORE VIDES ont aussi leur planète.
    //
    // `GET /api/student/galaxy/all` les exclut volontairement (« un soleil sans planète
    // n'apprend rien et encombre la vue ») — ce raisonnement valait pour un graphe dense. Dans
    // un système solaire il s'inverse : la carte de l'année doit montrer TOUTES les planètes,
    // y compris celles qui ne sont pas encore allumées. Une matière absente se lirait comme
    // une matière qui n'existe pas ; une planète éteinte se lit comme « pas encore ».
    //
    // `GET /api/student/galaxy` (overview), déjà chargé, les sert toutes — `0/0` compris. Le
    // clic reste honnête : la constellation d'une matière vide annonce « 🌱 Les étoiles de
    // cette matière arrivent bientôt. »
    for (const subject of galaxy.subjects ?? []) {
      const id = `subject-${subject.subject_id}`;
      if (keep.has(id)) continue;
      nodes.push({ id, kind: "subject", label: subject.name, subject_slug: subject.slug });
      edges.push({ source: "root", target: id, type: "structure" });
    }
    return { nodes, edges };
  }, [fullGraph, galaxy.subjects]);

  /**
   * Le bandeau de planètes, rendu AU-DESSUS du graphe quel que soit l'écran.
   *
   * Il est permanent — et pas seulement sur le système solaire — parce qu'il sert deux fois :
   * entrer dans une matière depuis la galaxie, et **changer de matière** sans repasser par
   * elle. La planète de la matière ouverte porte son anneau : le bandeau dit aussi où on est.
   *
   * ⚠️ UN SEUL CLIC ouvre la constellation. Une version intermédiaire demandait un premier tap
   * pour « viser » puis un second pour entrer : ça ajoutait un geste que personne n'avait
   * demandé, et toucher une matière sans voir son graphe se lit comme un clic qui n'a pas
   * marché.
   */
  const subjectBand =
    galaxy.subjects && galaxy.subjects.length > 0 ? (
      // Cadre au fond SPATIAL : les planètes flottent dans l'espace, elles ne sont pas posées
      // sur un panneau d'interface. Trois couches — nébuleuses, champ d'étoiles qui dérive,
      // et le contenu par-dessus. Tout est en CSS pur : aucun chunk 3D pour un décor.
      <div className="relative mb-3 overflow-hidden rounded-2xl border border-zetis-border bg-zetis-bg p-3">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 motion-safe:animate-[zetis-nebula_14s_ease-in-out_infinite]"
          style={{
            background: `
              radial-gradient(420px 180px at 12% 20%, rgba(99,102,241,.30), transparent 70%),
              radial-gradient(380px 170px at 68% 85%, rgba(217,70,239,.22), transparent 70%),
              radial-gradient(300px 150px at 92% 15%, rgba(34,211,238,.20), transparent 72%)`,
          }}
        />
        {/* Bande laiteuse : une diagonale plus dense que le reste du champ. C'est elle qui fait
            lire « Voie lactée » plutôt que « ciel uniforme » — un semis régulier n'a pas de
            structure, donc pas de galaxie. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(104deg, transparent 26%, rgba(214,228,255,.14) 44%, rgba(236,240,255,.2) 52%, rgba(214,228,255,.12) 60%, transparent 76%)",
            filter: "blur(6px)",
          }}
        />
        {/* Deux champs d'étoiles à vitesses différentes : la parallaxe donne la profondeur.
            Le second SCINTILLE (opacité pulsée), le premier non — si tout clignote ensemble,
            le fond se met à respirer d'un bloc et attire l'œil plus que les planètes. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80 motion-safe:animate-[zetis-starfield_90s_linear_infinite]"
          style={{
            // Étoiles de tailles inégales : à points identiques, le champ se lit comme une
            // trame imprimée et non comme un ciel.
            backgroundImage: STARS_FAR,
            // ⚠️ La largeur DOIT égaler le trajet du keyframe (`-260px`), sinon la boucle saute.
            backgroundSize: "260px 130px",
            backgroundRepeat: "repeat",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 motion-safe:animate-[zetis-twinkle_3.4s_ease-in-out_infinite]"
          style={{
            backgroundImage: STARS_NEAR,
            backgroundSize: "190px 95px",
            backgroundRepeat: "repeat",
          }}
        />
        <div className="relative">
          {/* Le titre est DANS le cadre : dehors, il flottait au-dessus d'un bloc spatial sans
              lui appartenir. Il reste vrai dans les deux écrans — depuis une constellation,
              toucher une autre matière y entre aussi. */}
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-zetis-muted">
            Ta galaxie — touche une matière pour entrer dedans
          </p>
          <SubjectConstellations
            subjects={galaxy.subjects}
            onOpen={galaxy.openSubject}
            variant="band"
            selectedSlug={constellation?.subject.slug ?? null}
          />
        </div>
      </div>
    ) : null;

  // En plein écran, le canvas prend tout ce qui reste sous le titre et au-dessus des KPI.
  // En plein écran, la hauteur disponible = fenêtre − bandeau (112) − chrome de la modale.
  const canvasHeight = fullscreen
    ? Math.max(300, viewport.h - 200)
    : width < 640
      ? 400
      : 540;

  // Un clic dans le vide : il referme le panneau s'il est ouvert, sinon il agrandit.
  // Deux gestes distincts sur le même geste physique, mais jamais ambigus — on ne peut pas
  // « agrandir » alors qu'une notion attend d'être lue.
  const onBackgroundClick = () => {
    if (notion) galaxy.closeNotion();
    else if (!fullscreen) setFullscreen(true);
  };

  const graphBox =
    constellation && capped ? (
      <div className="min-h-0 overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface">
        {constellation.nodes.length === 0 ? (
          <p className="p-6 text-sm text-zetis-muted">
            🌱 Les étoiles de cette matière arrivent bientôt.
          </p>
        ) : webgl ? (
          <Suspense
            fallback={<p className="p-6 text-sm text-zetis-muted">Ta constellation arrive…</p>}
          >
            <GalaxyCanvas
              nodes={capped.nodes}
              edges={capped.edges}
              selectedId={notion ? `skill-${notion.skill_id}` : null}
              highlightStatus={searching ? null : highlightStatus}
              matchedIds={matchedIds}
              onNodeClick={(n) => n.skill_id && galaxy.openNotion(n.skill_id)}
              onBackgroundClick={onBackgroundClick}
              height={canvasHeight}
            />
          </Suspense>
        ) : (
          // Repli sans WebGL : la progression ne devient jamais inaccessible.
          <div className="h-full overflow-y-auto p-4">
            <GalaxyFallbackList
              nodes={constellation.nodes}
              edges={constellation.edges}
              highlightStatus={highlightStatus}
              onNodeClick={(n) => n.skill_id && galaxy.openNotion(n.skill_id)}
            />
          </div>
        )}
      </div>
    ) : null;

  // Planètes CSS : ÉTAT D'ATTENTE du chunk 3D et REPLI sans WebGL (addendum ADR-0024 §C).
  // Elles ne disparaissent pas du code — elles cessent d'être un écran à part entière.
  const planets = (
    <div className="p-4">
      {galaxy.subjects === null ? (
        <p className="text-sm text-zetis-muted">Ta galaxie se dessine…</p>
      ) : (
        <SubjectConstellations subjects={galaxy.subjects} onOpen={galaxy.openSubject} />
      )}
    </div>
  );

  const search = (
    <GalaxySearch
      value={query}
      onChange={setQuery}
      matchCount={searching ? matchedIds.size : null}
    />
  );

  const legend = (
    <GalaxyLegend
      counts={counts ?? undefined}
      active={highlightStatus}
      onToggle={(status) =>
        setHighlightStatus((current) => (current === status ? null : status))
      }
    />
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Ma galaxie"
        subtitle="Chaque étoile est une notion. Plus tu apprends, plus ta galaxie s'allume."
      />

      {/* XP / niveau / progrès de la semaine — conservés (ADR-0024 §1) */}
      <section className="flex flex-wrap items-center gap-6 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
        <ProgressRing value={levelProgress} size={84} />
        <div>
          <p className="text-lg font-bold">Niveau {summary?.level ?? 1}</p>
          <p className="text-sm text-zetis-muted">
            {summary?.xp_into_level ?? 0} / {summary?.xp_for_next ?? 100} XP vers le niveau{" "}
            {(summary?.level ?? 1) + 1}
          </p>
          <p className="mt-1 text-xs text-zetis-muted">{summary?.total_xp ?? 0} XP au total</p>
        </div>
        <div className="ml-auto flex gap-6 text-center">
          <div>
            <p className="text-2xl font-bold text-zetis-accent-2">{consolidated ?? 0}</p>
            <p className="text-xs text-zetis-muted">
              notion{(consolidated ?? 0) > 1 ? "s" : ""} consolidée
              {(consolidated ?? 0) > 1 ? "s" : ""} cette semaine
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-300">{summary?.badges.length ?? 0}</p>
            <p className="text-xs text-zetis-muted">badges gagnés</p>
          </div>
        </div>
      </section>

      {/* ── Écran 1 : LA GALAXIE COMPLÈTE, toutes matières ──
          Vue par défaut depuis le 2026-07-31 (addendum ADR-0024 §C). C'est la brique livrée le
          2026-07-28 pour l'Accueil : elle n'a pas été supprimée, elle a changé d'adresse.
          `/galaxy` paie donc Three.js à l'ouverture — c'est sa raison d'être. Tout le gain du
          §B consistait à sortir ce coût de la page d'ATTERRISSAGE, pas du produit. */}
      {!constellation && (
        <section className="mt-6">
          {galaxy.subjects !== null && galaxy.subjects.length === 0 ? (
            <p className="rounded-2xl border border-zetis-border bg-zetis-surface p-5 text-sm text-zetis-muted">
              🌱 Tes premières étoiles arriveront avec tes premières leçons.
            </p>
          ) : (
            <>
              {/* Les mêmes sphères CSS que l'écran d'attente, en ligne. Au doigt, une planète
                  de quelques pixels perdue dans le graphe est inatteignable — le bandeau est
                  la cible large. Aucun chunk 3D ici : ces globes sont en CSS pur. */}
              {subjectBand}

              <div className="overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface">
                {webgl && solarSystem && solarSystem.nodes.length > 0 ? (
                  <Suspense fallback={planets}>
                    <GalaxyCanvas
                      nodes={solarSystem.nodes}
                      edges={solarSystem.edges}
                      // Les matières sont POSÉES sur leurs orbites, pas placées par un moteur
                      // de forces : c'est une composition, pas un équilibre.
                      layout="orbit"
                      matchedIds={EMPTY_MATCHES}
                      highlightStatus={null}
                      selectedId={null}
                      // Dans la galaxie entière, TOUT mène à une matière : un amas ou le
                      // soleil ne sont pas des destinations, mais chaque nœud porte son
                      // `subject_slug` — un clic ouvre la bonne constellation sans second
                      // aller-retour serveur.
                      onNodeClick={(n) => n.subject_slug && galaxy.openSubject(n.subject_slug)}
                      onBackgroundClick={() => {}}
                      height={canvasHeight}
                    />
                  </Suspense>
                ) : (
                  // Les planètes CSS ne sont plus un ÉCRAN : elles sont l'état d'attente
                  // pendant le chargement du chunk 3D, et le repli sans WebGL. Elles gardent
                  // ainsi leur raison d'être d'origine — ne pas payer Three.js — là où elle a
                  // encore un sens.
                  planets
                )}
              </div>

              {/* Le rail de puces qui vivait ici a été RETIRÉ : le bandeau de planètes au-dessus
                  rend le même service (entrée par matière au doigt) et montre en plus les
                  matières encore vides, que les puces filtraient. Deux rangées pour la même
                  intention encadraient le graphe sans rien ajouter. */}

              {/* La frise suit le graphe : c'est un élément de progression, sa place est ici. */}
              {timeline && timeline.points.length > 1 && (
                <ProgressSparkline timeline={timeline} className="mt-3" />
              )}
            </>
          )}
        </section>
      )}

      {/* ── Écran 2 : une constellation ──
          Masqué en plein écran : deux `GalaxyCanvas` montés = deux contextes WebGL pour
          rien, et le navigateur en limite le nombre. */}
      {constellation && capped && !fullscreen && (
        <section className="mt-6">
          {/* Le bandeau reste ici : c'est le sélecteur de matière. Sans lui, changer de matière
              obligerait à revenir à la galaxie d'abord — un aller-retour pour un geste que
              Massimo fait souvent. La planète ouverte porte son anneau. */}
          {subjectBand}

          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={galaxy.closeSubject}
              className="rounded-xl border border-zetis-border bg-zetis-surface px-3.5 py-2 text-sm font-bold hover:bg-zetis-surface-2"
            >
              ← Ma galaxie
            </button>
            <h3 className="text-lg font-bold">{constellation.subject.name}</h3>
          </div>

          {galaxy.error && <p className="mb-3 text-sm text-zetis-muted">{galaxy.error}</p>}

          <div className="mb-3">{search}</div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            {graphBox}
            {notion && <NotionActionPanel notion={notion} onClose={galaxy.closeNotion} />}
          </div>

          {capped.truncated && (
            <p className="mt-3 text-xs text-zetis-muted">
              Beaucoup d'étoiles ici — touche un chapitre pour l'ouvrir.
            </p>
          )}

          {legend}
          <p className="mt-3 text-sm text-zetis-muted">
            {highlightStatus
              ? "Touche à nouveau le même repère pour revoir toute la constellation."
              : "Touche le fond pour ouvrir en grand. Touche une étoile pour voir ce que tu peux faire."}
          </p>
        </section>
      )}

      {/* ── Plein écran : la constellation prend toute la page, les KPI restent ── */}
      {fullscreen && constellation && capped && (
        <div
          // Plein écran DANS LA PAGE : la sidebar et le bandeau restent visibles, Massimo
          // garde ses repères et peut partir ailleurs sans d'abord refermer.
          className="fixed bottom-0 left-60 right-0 top-24 z-50 flex flex-col gap-2 bg-zetis-bg p-3 sm:top-28 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Constellation ${constellation.subject.name} en plein écran`}
        >
          <CloseFullscreenButton onClick={() => setFullscreen(false)} />
          {/* Titre et recherche sur UNE ligne : la hauteur économisée va à la constellation,
              qui est la raison d'ouvrir en grand. */}
          <div className="flex flex-wrap items-center gap-3 pr-14">
            <h3 className="text-lg font-bold">{constellation.subject.name}</h3>
            <div className="ml-auto w-full sm:w-auto">{search}</div>
          </div>

          {/* La colonne du panneau n'est réservée QUE s'il y a un panneau. */}
          <div
            className={
              "grid min-h-0 flex-1 gap-4 " + (notion ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1")
            }
          >
            {graphBox}
            {notion && <NotionActionPanel notion={notion} onClose={galaxy.closeNotion} />}
          </div>

          {/* Les KPI restent : c'est la lecture de la constellation, pas un ornement. */}
          <div className="shrink-0">{legend}</div>
        </div>
      )}

      {/* Badges */}
      {summary && summary.badges.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 font-bold">Tes badges</h3>
          <div className="flex flex-wrap gap-2">
            {summary.badges.map((b) => (
              <span
                key={b.code}
                className="flex items-center gap-1.5 rounded-full border border-zetis-border bg-zetis-surface px-3 py-1.5 text-sm"
              >
                <span className="text-base">{b.icon}</span>
                {b.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Activité récente */}
      {summary && summary.recent.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 font-bold">Activité récente</h3>
          <ul className="space-y-2">
            {summary.recent.map((e, i) => (
              <li
                key={`${e.reason}-${i}`}
                className="flex items-center justify-between rounded-xl border border-zetis-border bg-zetis-surface px-4 py-2.5 text-sm"
              >
                <span>{REASON_LABEL[e.reason] ?? e.reason}</span>
                <span className="font-semibold text-zetis-accent-2">+{e.amount} XP</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Hors des deux branches : le message doit survivre au passage en plein écran. */}
      {emptyQuery && <SearchEmptyToast query={emptyQuery} />}
    </div>
  );
}
