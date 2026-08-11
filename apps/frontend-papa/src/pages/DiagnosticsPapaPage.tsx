import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SubjectFilterChips } from "@zetis/ui";
import type {
  DiagnosticApercu,
  DiagnosticPortee,
  DiagnosticRailEntry,
  DiagnosticRelecture,
  DiagnosticResult,
} from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { DiagnosticIcon } from "../components/DiagnosticIcon";
import { BandeauInstrument } from "../components/diagnostic/BandeauInstrument";
import { RailPassations } from "../components/diagnostic/RailPassations";
import { PanneauPassation, PanneauSansMesure } from "../components/diagnostic/PanneauPassation";
import { LancerDiagnosticDialog } from "../components/diagnostic/LancerDiagnosticDialog";
import {
  compteFocus,
  filtrerJamaisGenere,
  filtrerRail,
  libelleFocus,
  matieresNonMesurees,
  type DiagnosticFocus,
} from "../components/diagnostic/focus";
import {
  fetchApercu,
  fetchPortee,
  fetchRelecture,
  fetchResultDetail,
  rejectDiagnostic,
  validateDiagnostic,
} from "../lib/diagnostic";

// Page Papa « Diagnostic » (adr-0043) — refonte complète.
//
// Elle répond à UNE question, dans cet ordre et sans sauter d'étape : *cette mesure, qu'a-t-elle
// mesuré, qu'a-t-elle ouvert, et qu'est-ce que ZETIS en a fait ?* Une passation est une **mesure
// datée** : la page la traite comme un instrument, pas comme un bulletin.
//
// Ce qu'elle S'INTERDIT, et pourquoi :
//
// - **aucun score avant le 3ᵉ cran du témoin** — il n'en existe pas ;
// - **aucun compteur de jours d'attente côté Massimo, aucune relance** — l'attente est une
//   information pour Papa, pas une pression sur l'enfant ;
// - **aucun classement de matières**, aucun « meilleur / moins bon » ;
// - **aucune note globale de l'élève** — un diagnostic mesure des notions, pas un enfant
//   (adr-0028 §9, non rouvert) ;
// - **aucune interpolation** dans la portée ;
// - **aucune modification de contenu** — la page lit et oriente ; produire a ses pages.
//
// ⚠️ **Deux appels seulement au chargement** (`/apercu`), puis un couple `détail + portée` par
// sélection. La portée n'est pas préchargée pour toutes les matières : c'est une liste, pas un
// agrégat borné, et le dashboard précharge pour une raison qui ne vaut pas ici (adr-0028 §1).

export function DiagnosticsPapaPage() {
  const [apercu, setApercu] = useState<DiagnosticApercu | null>(null);
  // 🔴 **La matière s'amorce depuis l'URL** (addendum ADR-0041, décision 4 amendée). Sans cette
  // lecture, `/diagnostics?subject=3` déposait Papa sur « Toutes » : le lien du Journal aurait
  // promis une matière et livré la page par défaut — un lien qui ment, pire que pas de lien.
  //
  // ⚠️ **Un AMORÇAGE, pas une synchronisation.** Le paramètre sert d'état initial ; ensuite la
  // pastille de matière est maîtresse et l'URL ne la suit pas. Synchroniser dans les deux sens
  // ferait de la barre d'adresse une seconde source de vérité pour un filtre qui n'en demande pas,
  // et rendrait le retour arrière du navigateur imprévisible.
  //
  // ⚠️ 🔴 **`?focus=<quiz_id>` AMORCE la sélection du rail** (adr-0051 D1) — c'est la destination du
  // « Voir → » de la file de relecture, qui rendait `null` faute d'une page capable d'ouvrir un
  // diagnostic précis. Même règle que `?subject=` : un AMORÇAGE, pas une synchronisation.
  //
  // ⚠️ **Le mot `focus` était déjà pris ICI** par le filtre du bandeau (adr-0045 D2). C'est le
  // paramètre d'URL qui garde le nom — la convention `?subject=&focus=` vaut pour les six familles
  // et ne s'excepte pas — et l'état local qui a été renommé `filtre`. Inventer `?passation=` aurait
  // coûté une exception permanente pour épargner un renommage de trois lignes.
  const [parametres] = useSearchParams();
  const [subjectId, setSubjectId] = useState<number | null>(() => {
    const brut = Number(parametres.get("subject"));
    return Number.isInteger(brut) && brut > 0 ? brut : null;
  });
  const [quizAmorce] = useState<number | null>(() => {
    const brut = Number(parametres.get("focus"));
    return Number.isInteger(brut) && brut > 0 ? brut : null;
  });
  // Matière présélectionnée quand la modale est ouverte par « Remesurer cette matière → »
  // (ADR-0048). `null` pour le bouton de tête, qui n'en vise aucune.
  const [remesurer, setRemesurer] = useState<number | null>(null);
  // Le filtre du bandeau (adr-0045). LOCAL à cette page : un seul consommateur, et `DashboardFocus`
  // est une union fermée du dashboard — l'élargir pour un second usage serait payer une abstraction
  // pour un cas. ⚠️ **Renommé de `focus` à `filtre` par l'adr-0051** : le mot `focus` désigne
  // désormais l'objet visé par l'URL, comme sur les cinq autres pages de pilotage.
  const [filtre, setFiltre] = useState<DiagnosticFocus | null>(null);
  const [selection, setSelection] = useState<DiagnosticRailEntry | null>(null);
  const [detail, setDetail] = useState<DiagnosticResult | null>(null);
  const [portee, setPortee] = useState<DiagnosticPortee | null>(null);
  const [relecture, setRelecture] = useState<DiagnosticRelecture | null>(null);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [retraitEnCours, setRetraitEnCours] = useState(false);
  const [verdictEnCours, setVerdictEnCours] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const donnees = await fetchApercu();
      setApercu(donnees);
      // Sélection par défaut : la passation la plus récente. Ouvrir sur du vide obligerait Papa à
      // cliquer pour voir ce qu'il vient chercher.
      //
      // ⚠️ **`?focus=` passe AVANT le défaut, et seulement à la première charge** (`courante ??`) :
      // c'est un amorçage. Un identifiant illisible, ou qui vise un diagnostic hors de l'année
      // active, ne trouve rien et **laisse le défaut reprendre** — un lien périmé ne doit pas
      // produire un écran d'erreur.
      setSelection(
        (courante) =>
          courante ??
          (quizAmorce !== null
            ? donnees.rail.find((e) => e.quiz_id === quizAmorce)
            : undefined) ??
          donnees.rail.find((e) => e.cran === "passe") ??
          donnees.rail[0] ??
          null,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible");
    }
  }, [quizAmorce]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    // ⚠️ `annule` : en StrictMode le montage est joué deux fois, et sans ce drapeau la réponse du
    // premier passage peut écraser celle du second. Piège déjà payé sur le chat (adr-0026).
    let annule = false;
    if (selection === null || selection.attempt_id === null) {
      setDetail(null);
      setPortee(null);
      return;
    }
    const attemptId = selection.attempt_id;
    const matiere = selection.subject_id;
    void (async () => {
      try {
        const [d, p] = await Promise.all([fetchResultDetail(attemptId), fetchPortee(matiere)]);
        if (annule) return;
        setDetail(d);
        setPortee(p);
      } catch (cause: unknown) {
        if (!annule) setError(cause instanceof Error ? cause.message : "Chargement impossible");
      }
    })();
    return () => {
      annule = true;
    };
  }, [selection]);

  // Le questionnaire de la ligne sélectionnée (adr-0051). SÉPARÉ du couple `détail + portée`
  // ci-dessus, parce qu'il ne dépend pas des mêmes conditions : celui-là exige une passation
  // (`attempt_id`), celui-ci n'exige qu'un `quiz_id` — donc il se charge aussi sur les DEUX crans
  // non passés, qui sont précisément ceux qu'on vient relire.
  useEffect(() => {
    let annule = false;
    if (selection === null) {
      setRelecture(null);
      return;
    }
    const quizId = selection.quiz_id;
    setRelecture(null);
    void (async () => {
      try {
        const r = await fetchRelecture(quizId);
        if (!annule) setRelecture(r);
      } catch (cause: unknown) {
        if (!annule) setError(cause instanceof Error ? cause.message : "Lecture impossible");
      }
    })();
    return () => {
      annule = true;
    };
  }, [selection]);

  // ⚠️ Les deux filtres se COMPOSENT, dans cet ordre : la pastille de matière, puis le focus. Le
  // rail ne se re-trie jamais — l'ordre vient du serveur, et deux tris pour la même liste
  // finiraient par se contredire.
  const nonMesurees = useMemo(
    () => (apercu ? matieresNonMesurees(apercu) : new Set<number>()),
    [apercu],
  );

  const railVisible = useMemo(() => {
    const parMatiere = (apercu?.rail ?? []).filter(
      (e) => subjectId === null || e.subject_id === subjectId,
    );
    return filtrerRail(parMatiere, filtre, nonMesurees);
  }, [apercu, subjectId, filtre, nonMesurees]);

  // 🔴 Le bloc « Jamais généré » FAIT PARTIE du rail : il subit les mêmes filtres. Il était passé
  // BRUT jusqu'ici, donc filtrer sur une matière laissait apparaître les quatre autres.
  const jamaisGenereVisible = useMemo(
    () => filtrerJamaisGenere(apercu?.jamais_genere ?? [], filtre, subjectId),
    [apercu, filtre, subjectId],
  );

  const basculerFocus = useCallback((cible: DiagnosticFocus) => {
    setFiltre((courant) => (courant === cible ? null : cible));
  }, []);

  /** Le geste secondaire des deux crans non passés — « Refuser ce lot » / « Retirer la proposition ».
   *
   *  🔴 **La ligne SORT du rail**, elle ne recule pas d'un cran : `apercu` exclut
   *  `validation_status == "rejected"`. Et `charger()` conserve la sélection courante — garder
   *  celle-ci laisserait le panneau sur une ligne absente, exactement le défaut que ce chantier
   *  refuse de reproduire. D'où le `setSelection(null)` AVANT le rechargement, qui rend la main au
   *  choix par défaut. */
  /** « Laisser passer » — le verdict PRINCIPAL du cran « chez toi » (adr-0051 Décision 2).
   *
   *  🔴 **Le même patron optimiste que `retirer`, et pour la même raison** : la ligne change de
   *  cran (`genere` → `propose`), et `charger()` conserve la sélection courante. La garder
   *  laisserait le panneau afficher « chez toi · à relire » sur un diagnostic qui vient de partir
   *  chez Massimo — un écran qui ment sur ce qu'il montre. D'où le `setSelection(null)` AVANT le
   *  rechargement, exactement comme au retrait.
   *
   *  ⚠️ **Aucune confirmation.** Valider est réversible (« Retirer la proposition » existe et
   *  n'a aucune précondition d'état) ; rejeter ne l'est pas, et c'est lui qui porte le dialogue.
   *  Même arbitrage que la file de relecture (adr-0039 §Actions). */
  const laisserPasser = useCallback(
    async (entree: DiagnosticRailEntry) => {
      setVerdictEnCours(true);
      try {
        await validateDiagnostic(entree.quiz_id);
        setSelection(null);
        await charger();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Validation impossible");
      } finally {
        setVerdictEnCours(false);
      }
    },
    [charger],
  );

  const retirer = useCallback(
    async (entree: DiagnosticRailEntry) => {
      setRetraitEnCours(true);
      try {
        await rejectDiagnostic(entree.quiz_id);
        setSelection(null);
        await charger();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Retrait impossible");
      } finally {
        setRetraitEnCours(false);
      }
    },
    [charger],
  );

  /** La jauge « lecture la plus ancienne » désigne UNE passation : elle l'ouvre.
   *
   *  L'appariement est EXACT et non heuristique : `jauges.plus_ancienne_lecture.date` et le `date`
   *  de la ligne viennent du même `attempt.completed_at.isoformat()` côté serveur, et ni l'une ni
   *  l'autre ne le reformate. */
  const ouvrirPlusAncienne = useMemo(() => {
    const lecture = apercu?.jauges.plus_ancienne_lecture;
    if (!apercu || !lecture) return null;
    const entree = apercu.rail.find(
      (e) => e.cran === "passe" && e.subject === lecture.subject && e.date === lecture.date,
    );
    if (!entree) return null;
    return () => {
      // 🔴 Les DEUX filtres tombent avant de sélectionner. Sans ça, la jauge pourrait ouvrir un
      // panneau dont la ligne n'est pas dans le rail — le défaut pré-existant qu'on refuse de
      // reproduire par une porte neuve.
      setFiltre(null);
      setSubjectId(null);
      setSelection(entree);
    };
  }, [apercu]);

  if (error !== null && apercu === null) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="rounded-lg bg-papa-warn/15 px-3 py-2 text-sm text-papa-warn">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={<DiagnosticIcon size="header" breathing />}
        title="Diagnostic"
        subtitle="Chaque passation est une mesure datée. Cette page dit ce qu'elle a mesuré, ce qu'elle a ouvert, et ce que ZETIS en a produit — dans cet ordre, et sans sauter d'étape."
        actions={
          <button
            type="button"
            onClick={() => {
              setRemesurer(null);
              setDialogOuvert(true);
            }}
            className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg"
          >
            Lancer un diagnostic
          </button>
        }
      />

      {apercu && (
        <BandeauInstrument
          jauges={apercu.jauges}
          focus={filtre}
          onFocus={basculerFocus}
          onPlusAncienne={ouvrirPlusAncienne}
        />
      )}

      {/* 🔴 Un focus est un filtre NOMMÉ, jamais une troncature : il dit ce qu'il montre ET comment
          en sortir. Une coupe silencieuse ferait croire à une couverture complète. */}
      {filtre !== null && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-papa-accent/40 bg-papa-accent/10 px-3 py-2 text-sm">
          <span>
            Le rail ne montre que{" "}
            <strong className="font-medium text-papa-accent">
              {libelleFocus(filtre, compteFocus(filtre, railVisible, jamaisGenereVisible))}
            </strong>
            .
          </span>
          <button
            type="button"
            onClick={() => setFiltre(null)}
            className="ml-auto rounded-lg border border-papa-border px-2.5 py-1 text-xs text-papa-muted hover:border-papa-accent hover:text-papa-text"
          >
            Tout revoir ✕
          </button>
        </div>
      )}

      {apercu && (
        <div className="mb-5">
          <SubjectFilterChips
            subjects={apercu.subjects.map((s) => ({ id: s.id, slug: s.slug, name: s.name }))}
            value={subjectId}
            onChange={setSubjectId}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <RailPassations
          entrees={railVisible}
          jamaisGenere={jamaisGenereVisible}
          selection={selection?.cle ?? null}
          onSelect={setSelection}
          filtreActif={subjectId !== null || filtre !== null}
        />

        <div>
          {selection === null ? (
            <div className="rounded-xl border border-dashed border-papa-border bg-papa-surface/50 p-6">
              <p className="font-medium">Rien à lire pour l'instant</p>
              <p className="mt-1 text-sm text-papa-muted">
                Lance un diagnostic : il rejoindra le rail au premier cran, en relecture — pas
                encore chez Massimo.
              </p>
            </div>
          ) : selection.cran !== "passe" ? (
            // 🔴 Deux premiers crans : aucun score, aucun palier, aucune lacune. Il n'en existe pas.
            // Un diagnostic PASSÉ ne passe jamais ici, donc il n'offre jamais « Retirer » — une
            // mesure existante ne se cache pas.
            <PanneauSansMesure
              entree={selection}
              onRetirer={() => void retirer(selection)}
              retraitEnCours={retraitEnCours}
              relecture={relecture}
              onLaisserPasser={() => void laisserPasser(selection)}
              verdictEnCours={verdictEnCours}
            />
          ) : detail ? (
            <PanneauPassation
              detail={detail}
              portee={portee}
              rang={selection.rang}
              subjectSlug={selection.subject_slug}
              relecture={relecture}
              onRemesurer={(sid) => {
                setRemesurer(sid);
                setDialogOuvert(true);
              }}
            />
          ) : (
            <p className="text-sm text-papa-muted">Chargement…</p>
          )}
        </div>
      </div>

      {dialogOuvert && apercu && (
        <LancerDiagnosticDialog
          subjects={apercu.subjects}
          subjectInitial={remesurer}
          onClose={() => setDialogOuvert(false)}
          onTermine={() => {
            setDialogOuvert(false);
            void charger();
          }}
        />
      )}
    </div>
  );
}
