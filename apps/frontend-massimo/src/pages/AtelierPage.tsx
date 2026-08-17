// L'atelier — la fiche que Massimo fabrique lui-même (addendum ADR-0015, slices 1 et 2).
//
// **Page à part entière, en plein écran** — jamais une quatrième vue de `FicheSubjectPage` (qui
// porte déjà liste + fiche + cours), et JAMAIS dans `ActivityModal` : la modale borne son corps
// avec défilement interne, ce qui rejouerait le défaut que l'ADR-0052 vient de corriger sur les
// mindmaps. C'est une SÉANCE DE TRAVAIL, pas une consultation.
//
// Le plein écran réutilise le patron déjà retenu (ADR-0052) — overlay CSS + état React, jamais
// `requestFullscreen` ; `CloseFullscreenButton` (cible 44 px) ; Échap ; verrou du défilement.
//
// ⚠️ **La colonne ne montre que les étapes OFFERTES.** Les six sont implémentées depuis
// l'ADR-0055 (2026-08-14), mais la ⑥ est **conditionnelle** : elle n'apparaît que si ZETIS a
// détecté une occasion. Elle n'est **pas rendue grisée** — l'addendum §10 l'interdit : une étape
// visible mais morte est une promesse que le produit ne tient pas.
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FICHE_BUDGETS,
  type FicheCandidate,
  type FicheDraft,
  type FicheDraftDetail,
  type FicheFeedback,
  type FicheSection,
} from "@zetis/types";
import { CloseFullscreenButton } from "@zetis/ui";
import {
  AtelierIncomplet,
  fetchCandidates,
  finishDraft,
  openDraft,
  reviewDraft,
  saveDraft,
  transcribeForDraft,
} from "../lib/atelier";
import { isDictationSupported, startRecording, type Recording } from "../lib/dictation";
import { speak } from "../lib/speech";

// Les trois étapes ouvertes, dans l'ordre de la fiche. `bulle` est ce que ZETIS DIT — le
// relationnel ; tout le référentiel (candidates, termes, comparaisons) est ÉCRIT, jamais parlé :
// l'audio est linéaire et volatil, une fiche est spatiale et persistante (§5 bis).
const ETAPES: { id: FicheSection; num: string; titre: string; bulle: string }[] = [
  {
    id: "points_cles",
    num: "①",
    titre: "🔑 À retenir",
    bulle: "Ton cours fait plusieurs pages. Une fiche, c'est cinq idées. Lesquelles tu gardes ?",
  },
  {
    id: "essentiel",
    num: "②",
    titre: "⭐ L'essentiel",
    bulle: "En deux phrases, avec tes mots : c'est quoi, cette leçon ?",
  },
  {
    id: "definitions",
    num: "③",
    titre: "📖 Les mots à connaître",
    bulle: "Je te donne les mots. À toi de dire ce qu'ils veulent dire.",
  },
  {
    id: "erreurs_a_eviter",
    num: "④",
    titre: "⚠️ Les pièges",
    // 🔴 ZETIS ne propose pas une IDÉE, il rappelle un FAIT de Massimo — c'est la seule
    // section qu'il peut pré-remplir sans enfreindre la règle 7 (§8). D'où « je me souviens »
    // et pas « je te conseille » : la nuance est toute la différence.
    bulle: "Je me souviens de ce sur quoi tu t'es trompé. On en met sur ta fiche ?",
  },
  {
    id: "mini_exemple",
    num: "⑤",
    titre: "💡 Un exemple",
    bulle: "Un exemple, c'est ce qui fait qu'on comprend. Tu en as un en tête ?",
  },
  {
    id: "mnemonique",
    num: "⑥",
    titre: "🎩 Mnemonics",
    // 🔴 **Le ridicule est une QUALITÉ ici, et c'est le seul endroit de la fiche.** Un mnémonique
    // bête se retient mieux — et il faut le lui dire, sinon il cherchera quelque chose de sérieux.
    bulle: "Il y a une liste à retenir. Invente ton truc — plus c'est bête, mieux ça marche !",
  },
];

// ⚠️ **L'étape ⑥ n'est PAS toujours offerte** (§10) : elle n'apparaît que si ZETIS a détecté une
// occasion. Elle n'est pas non plus rendue GRISÉE — une étape visible mais morte est une promesse
// que le produit ne tient pas. Le compteur doit donc suivre les étapes OFFERTES, jamais `ETAPES`.
function etapesOffertes(occasion: boolean): typeof ETAPES {
  return occasion ? ETAPES : ETAPES.filter((e) => e.id !== "mnemonique");
}

// ~60 caractères par ligne sur la fiche A5. Sert à dire la place RESTANTE, jamais un compteur.
const CARS_PAR_LIGNE = 60;

export function AtelierPage() {
  const { slug = "", lessonId = "" } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<FicheDraftDetail | null>(null);
  // Accordéon : une seule étape dépliée à la fois. Le plan reste visible, le travail reste
  // concentré (spec § gabarit de la colonne).
  const [ouverte, setOuverte] = useState<FicheSection>("points_cles");
  const [error, setError] = useState<string | null>(null);
  const [retour, setRetour] = useState<FicheFeedback | null>(null);
  const [gardees, setGardees] = useState<number[]>([]);
  const [seche, setSeche] = useState<FicheSection | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  // Étape ① — le choix
  const [candidates, setCandidates] = useState<FicheCandidate[]>([]);
  const [slots, setSlots] = useState(5);
  const [choisis, setChoisis] = useState<string[]>([]);
  const choisisRef = useRef<string[]>([]);

  // Étape ② — le champ libre
  const [essentiel, setEssentiel] = useState("");
  const essentielRef = useRef("");
  const [amorce, setAmorce] = useState<string | null>(null);

  // Étape ③ — l'hybride : ZETIS donne le terme, Massimo écrit la définition
  const [termes, setTermes] = useState<string[]>([]);
  const [definitions, setDefinitions] = useState<Record<string, string>>({});
  const definitionsRef = useRef<Record<string, string>>({});

  // Étape ④ — les pièges : ZETIS propose depuis ses ERREURS mesurées, Massimo confirme
  const [piegesProposes, setPiegesProposes] = useState<FicheCandidate[]>([]);
  const [pieges, setPieges] = useState<string[]>([]);
  const piegesRef = useRef<string[]>([]);

  // ── Étapes ⑤ et ⑥ (ADR-0055) ────────────────────────────────────────────────
  const [miniExemple, setMiniExemple] = useState("");
  const miniExempleRef = useRef("");
  const [mnemoMoyen, setMnemoMoyen] = useState("");
  const mnemoMoyenRef = useRef("");
  const [mnemoSertA, setMnemoSertA] = useState("");
  const mnemoSertARef = useRef("");
  const [amorceExemple, setAmorceExemple] = useState<string | null>(null);

  // Dictée
  const [micro, setMicro] = useState<Recording | null>(null);
  const [transcrit, setTranscrit] = useState(false);

  // Glisse (étape ①)
  const [glisse, setGlisse] = useState<{ texte: string; x: number; y: number } | null>(null);
  const [survole, setSurvole] = useState<number | null>(null);
  const glisseRef = useRef<string | null>(null);

  const retourAuDeck = useCallback(() => navigate(`/fiches/${slug}`), [navigate, slug]);

  // ── Chargement ──────────────────────────────────────────────────────────────
  // 🔴 StrictMode monte DEUX fois en dev, et `annule` n'empêche que la mise à jour d'état — pas
  // le second POST. Les deux requêtes arrivaient ensemble, aucune ne voyait l'autre, et chacune
  // créait son brouillon : 4 brouillons pour 2 leçons, constaté en base le 2026-08-13. Un
  // double-tap sur téléphone produirait exactement la même chose.
  //
  // 🔴 **On mémorise la PROMESSE, pas un drapeau « déjà fait »** — et cette nuance est tout.
  // La première version posait `ouverture.current = lessonId` puis rendait la main au second
  // montage, qui repartait aussitôt. Résultat mesuré à l'écran le 2026-08-13 : le premier
  // montage recevait ses candidates APRÈS son propre démontage (`annule` déjà vrai) et les
  // jetait ; le second n'en demandait aucune. **L'accordéon s'affichait, entièrement creux** —
  // 12 phrases, 4 termes et 2 pièges servis par l'API, zéro à l'écran.
  //
  // En gardant la promesse, les deux montages attendent le MÊME appel : un seul POST, et le
  // survivant remplit l'état. C'est la seule forme qui tienne les deux exigences à la fois.
  const ouverture = useRef<{ lecon: string; promesse: Promise<FicheDraftDetail> } | null>(null);

  useEffect(() => {
    let annule = false;
    const id = Number(lessonId);
    if (!id) return;
    const promesse =
      ouverture.current?.lecon === lessonId ? ouverture.current.promesse : openDraft(id);
    ouverture.current = { lecon: lessonId, promesse };
    (async () => {
      try {
        const d = await promesse;
        if (annule) return;
        setDetail(d);
        // La reprise est ICI : il retrouve exactement ce qu'il avait rempli.
        choisisRef.current = d.draft.points_cles ?? [];
        setChoisis(choisisRef.current);
        essentielRef.current = d.draft.essentiel ?? "";
        setEssentiel(essentielRef.current);
        definitionsRef.current = Object.fromEntries(
          (d.draft.definitions ?? []).map((x) => [x.terme, x.definition]),
        );
        setDefinitions(definitionsRef.current);
        piegesRef.current = d.draft.erreurs_a_eviter ?? [];
        setPieges(piegesRef.current);
        miniExempleRef.current = d.draft.mini_exemple ?? "";
        setMiniExemple(miniExempleRef.current);
        mnemoMoyenRef.current = d.draft.mnemonique?.moyen ?? "";
        setMnemoMoyen(mnemoMoyenRef.current);
        mnemoSertARef.current = d.draft.mnemonique?.sert_a ?? "";
        setMnemoSertA(mnemoSertARef.current);

        const [pc, ess, defs, pgs, ex] = await Promise.all([
          fetchCandidates(d.id, "points_cles").catch(() => null),
          fetchCandidates(d.id, "essentiel").catch(() => null),
          fetchCandidates(d.id, "definitions").catch(() => null),
          fetchCandidates(d.id, "erreurs_a_eviter").catch(() => null),
          // ⑤ n'a pas de candidate — on ne vient chercher que son AMORCE. ⑥ n'en a pas non plus
          // et n'a pas d'amorce : rien à précharger pour elle.
          fetchCandidates(d.id, "mini_exemple").catch(() => null),
        ]);
        if (annule) return;
        if (ex) setAmorceExemple(ex.amorce ?? null);
        if (pc) {
          setCandidates(pc.candidates);
          setSlots(pc.slots);
        }
        if (ess) setAmorce(ess.amorce ?? null);
        if (defs) setTermes(defs.candidates.map((c) => c.texte));
        if (pgs) setPiegesProposes(pgs.candidates);
      } catch (e) {
        console.warn("[atelier] ouverture du brouillon", e); // trace devtools (diagnostic)
        if (!annule) setError("L'atelier n'a pas voulu s'ouvrir. Réessaie dans un instant ✨");
      }
    })();
    // `annule` : StrictMode monte deux fois en dev, et une réponse en retard écraserait l'état.
    return () => {
      annule = true;
    };
  }, [lessonId]);

  // ── Sauvegarde : à chaque geste, parce que l'écran le promet ─────────────────
  const temoin = useRef<number | null>(null);
  const persister = useCallback(async () => {
    if (!detail) return;
    const draft: FicheDraft = {
      ...detail.draft,
      points_cles: choisisRef.current,
      essentiel: essentielRef.current || null,
      // ⚠️ `FicheDefinition` exige terme ET définition non vides, même en brouillon : on ne
      // persiste que ce qui est réellement écrit. Un champ vide n'est pas une donnée.
      definitions: Object.entries(definitionsRef.current)
        .filter(([, d]) => d.trim())
        .map(([terme, definition]) => ({ terme, definition })),
      erreurs_a_eviter: piegesRef.current,
      mini_exemple: miniExempleRef.current || null,
      // Même règle que les définitions : on ne persiste que ce qui est réellement écrit. Un
      // mnémonique sans `moyen` n'est pas une donnée — et le vide est le cas NORMAL (§10).
      mnemonique: mnemoMoyenRef.current.trim()
        ? { moyen: mnemoMoyenRef.current, sert_a: mnemoSertARef.current }
        : null,
    };
    try {
      // 🔴 On garde la RÉPONSE : elle porte `mnemonique_occasion`, recalculé côté serveur. C'est
      // ce qui fait apparaître l'étape ⑥ pendant qu'il choisit ses points-clés, sans dupliquer
      // la règle ici.
      const rendu = await saveDraft(detail.id, draft);
      setDetail((d) => (d ? { ...d, draft, mnemonique_occasion: rendu.mnemonique_occasion } : d));
      setEnregistre(true);
      if (temoin.current) window.clearTimeout(temoin.current);
      temoin.current = window.setTimeout(() => setEnregistre(false), 1600);
    } catch {
      // Silencieux à dessein : une erreur affichée à chaque frappe ferait de l'atelier un champ
      // de mines. L'état reste à l'écran, il repartira au geste suivant.
    }
  }, [detail]);

  useEffect(() => () => void (temoin.current && window.clearTimeout(temoin.current)), []);

  // « On le met en piège ? » — un OUI/NON, pas un glisser : ce n'est pas un placement dans des
  // emplacements, c'est une CONFIRMATION de ce que ZETIS a mesuré. Et retirer une proposition
  // n'efface aucune mesure : l'erreur reste dans son historique, elle ne va pas sur la fiche.
  const basculerPiege = useCallback(
    (texte: string) => {
      const suivant = piegesRef.current.includes(texte)
        ? piegesRef.current.filter((t) => t !== texte)
        : [...piegesRef.current, texte];
      piegesRef.current = suivant;
      setPieges(suivant);
      void persister();
    },
    [persister],
  );


  // ── Échap + verrou du défilement (patron ADR-0052) ───────────────────────────
  useEffect(() => {
    const surEchap = (e: KeyboardEvent) => {
      if (e.key === "Escape") retourAuDeck();
    };
    document.addEventListener("keydown", surEchap);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surEchap);
      document.body.style.overflow = avant;
    };
  }, [retourAuDeck]);

  // ── Étape ① : le glisser-déposer ────────────────────────────────────────────
  const restants = useMemo(
    () => candidates.filter((c) => !choisis.includes(c.texte)),
    [candidates, choisis],
  );

  function appliquerChoix(suivant: string[]) {
    choisisRef.current = suivant;
    setChoisis(suivant);
    setRetour(null);
    void persister();
  }

  function retirer(index: number) {
    appliquerChoix(choisisRef.current.filter((_, i) => i !== index));
  }

  function emplacementSous(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const cible = (el as HTMLElement | null)?.closest?.("[data-emplacement]") as HTMLElement | null;
    if (!cible) return null;
    const i = Number(cible.getAttribute("data-emplacement"));
    return Number.isInteger(i) && !choisisRef.current[i] ? i : null;
  }

  function demarrerGlisse(texte: string, e: ReactPointerEvent) {
    if (choisisRef.current.length >= slots) return;
    e.preventDefault();
    glisseRef.current = texte;
    setGlisse({ texte, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!glisse) return;
    const bouger = (e: PointerEvent) => {
      setGlisse((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      setSurvole(emplacementSous(e.clientX, e.clientY));
    };
    const lacher = (e: PointerEvent) => {
      const cible = emplacementSous(e.clientX, e.clientY);
      const texte = glisseRef.current;
      // Lâcher à côté ne coûte rien et ne dit rien : la phrase retourne au cours.
      if (cible !== null && texte && !choisisRef.current.includes(texte)) {
        const suivant = [...choisisRef.current];
        suivant[cible] = texte;
        appliquerChoix(suivant.filter(Boolean));
      }
      glisseRef.current = null;
      setGlisse(null);
      setSurvole(null);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
    return () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glisse !== null]);

  // ── Étape ② : le champ libre et sa dictée ───────────────────────────────────
  function ecrireEssentiel(valeur: string) {
    essentielRef.current = valeur;
    setEssentiel(valeur);
    // ⚠️ On NE déclenche PAS l'analyse ici. Un correcteur qui commente pendant la frappe est un
    // évaluateur par-dessus l'épaule : l'enfant cesse d'écrire, ou écrit pour plaire (§6).
    setRetour(null);
  }

  async function basculerMicro() {
    if (micro) {
      const audio = await micro.stop();
      setMicro(null);
      if (!detail) return;
      try {
        const { transcript } = await transcribeForDraft(detail.id, audio);
        // Le texte s'AJOUTE à ce qu'il avait : ZETIS ne remplace jamais son travail.
        const suivant = [essentielRef.current, transcript].filter(Boolean).join(" ").trim();
        ecrireEssentiel(suivant.slice(0, FICHE_BUDGETS.essentiel));
        setTranscrit(true);
        void persister();
      } catch (e) {
        console.warn("[atelier] transcription de la dictée", e); // trace devtools (diagnostic)
        // Même repli que le refus de micro juste en dessous : le clavier reste une vraie sortie.
        setError("Je n'ai pas réussi à t'écouter. Tu peux écrire, ça marche aussi ✨");
      }
      return;
    }
    try {
      setMicro(await startRecording());
    } catch {
      setError("Je n'ai pas accès au micro. Tu peux écrire, ça marche aussi.");
    }
  }

  const placeRestante = Math.max(
    0,
    Math.floor((FICHE_BUDGETS.essentiel - essentiel.length) / CARS_PAR_LIGNE),
  );

  // ── Étape ③ : terme donné, définition écrite ────────────────────────────────
  function ecrireDefinition(terme: string, valeur: string) {
    definitionsRef.current = { ...definitionsRef.current, [terme]: valeur };
    setDefinitions(definitionsRef.current);
    setRetour(null);
  }

  // ── Le pied ─────────────────────────────────────────────────────────────────
  const quelqueChose =
    choisis.length > 0 || essentiel.trim().length > 0 || Object.values(definitions).some((d) => d.trim());

  async function regarder() {
    if (!detail) return;
    await persister(); // il regarde l'état RÉEL, pas celui d'il y a trois frappes
    try {
      setGardees([]);
      setRetour(await reviewDraft(detail.id));
    } catch (e) {
      console.warn("[atelier] relecture du brouillon", e); // trace devtools (diagnostic)
      // `persister()` vient de tourner juste au-dessus : ce qu'il a écrit EST enregistré. Le dire
      // est le fait qui compte — sans lui, un enfant croit avoir perdu son travail.
      setError("Je n'ai pas réussi à regarder ta fiche. Ton travail est bien enregistré — réessaie dans un instant ✨");
    }
  }

  async function terminer() {
    if (!detail) return;
    await persister();
    try {
      const fiche = await finishDraft(detail.id);
      // 🔴 **La FICHE, pas le deck** (ADR-0058 §2). Ce bouton et « J'ai fini pour aujourd'hui »
      // atterrissaient au MÊME endroit — deux gestes opposés, une seule destination, alors que
      // l'un crée une fiche et l'autre laisse un brouillon. *La réponse à « c'est fini », c'est
      // la fiche finie*, pas une liste où il faut la retrouver. L'adresse existait déjà
      // (`?fiche=`, adr-0054 §1) ; elle n'était simplement pas utilisée ici.
      navigate(`/fiches/${slug}?fiche=${fiche.id}`);
    } catch (e) {
      console.warn("[atelier] passage brouillon → fiche", e); // trace devtools (diagnostic)
      // ⚠️ Le 422 ne navigue PAS : il dit ce qui manque, et on RESTE dans l'atelier. Il n'est PAS
      // un échec : c'est une étape encore à faire — et c'est le SERVEUR qui l'a écrite pour lui
      // (`AtelierIncomplet`). Tout le reste est une panne, et une panne ne se raconte pas à un
      // enfant : elle part en console, l'écran dit sa propre phrase.
      setError(
        e instanceof AtelierIncomplet
          ? e.message
          : "Ta fiche n'a pas voulu se terminer. Ton travail est bien enregistré — réessaie dans un instant ✨",
      );
    }
  }

  const titre = detail?.lesson_title ?? "Ta fiche";
  // 🔴 **Une entrée par étape d'`ETAPES`, sans exception.** Le 2026-08-14, ce tableau en comptait
  // TROIS pendant qu'`ETAPES` en portait quatre : les pièges étaient rendus, jalonnés, sauvegardés
  // — et invisibles au compteur. Massimo voyait « 2 étapes sur 4 » avec trois étapes remplies.
  // Un compteur qui SOUS-compte est pire qu'un compteur faux : sur un écran qui s'interdit tout
  // reproche, il minimise le travail de l'enfant. Trouvé au doigt sur iPhone, par aucun test.
  const offertes = etapesOffertes(detail?.mnemonique_occasion ?? false);
  const remplies = [
    choisis.length > 0,
    essentiel.trim().length > 0,
    Object.values(definitions).some((d) => d.trim()),
    pieges.length > 0,
    miniExemple.trim().length > 0,
    // ⚠️ Ne compte que si l'étape est OFFERTE — sinon un mnémonique écrit puis devenu
    // « sans occasion » ferait un rempli hors du dénominateur.
    detail?.mnemonique_occasion === true && mnemoMoyen.trim().length > 0,
  ].filter(Boolean).length;

  function apercu(id: FicheSection): string {
    if (id === "points_cles") {
      return choisis.length
        ? `${choisis.length} idée${choisis.length > 1 ? "s" : ""} choisie${choisis.length > 1 ? "s" : ""}`
        : `${candidates.length} phrases à choisir dans ton cours`;
    }
    if (id === "essentiel") {
      return essentiel.trim() ? essentiel.slice(0, 70) : "à écrire avec tes mots — ou à dicter";
    }
    if (id === "definitions") {
      const n = Object.values(definitions).filter((d) => d.trim()).length;
      return n
        ? `${n} mot${n > 1 ? "s" : ""} sur ${termes.length}`
        : `${termes.length} mots à définir`;
    }
    if (id === "mini_exemple") {
      return miniExemple.trim() ? miniExemple.slice(0, 70) : "un exemple à toi — ou à dicter";
    }
    if (id === "mnemonique") {
      // Pas de reproche quand c'est vide : l'étape ne s'affiche QUE s'il y a une occasion, donc
      // « à inventer » est une invitation, jamais un rappel de ce qui manque.
      return mnemoMoyen.trim() ? mnemoMoyen.slice(0, 70) : "à inventer — plus c'est bête, mieux c'est";
    }
    if (pieges.length) return `${pieges.length} piège${pieges.length > 1 ? "s" : ""} sur ta fiche`;
    // 🔴 Aucun piège proposé n'est un état LÉGITIME, pas un manque : il n'a pas encore
    // travaillé cette leçon. On le dit sans reproche et sans décompte.
    return piegesProposes.length
      ? `${piegesProposes.length} à regarder`
      : "rien à signaler pour l'instant";
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-zetis-bg p-3 sm:p-5"
      role="dialog"
      aria-modal
      aria-label={`Fabriquer ma fiche — ${titre}`}
    >
      <CloseFullscreenButton onClick={retourAuDeck} />

      <header className="pr-14">
        <p className="text-xs uppercase tracking-wide text-zetis-muted">
          {detail?.chapter ?? "Ta fiche"}
        </p>
        <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">🧩 {titre}</h1>
        {/* Compte ce qui est COMMENCÉ, jamais ce qui manque (`CLAUDE.md` § Gamification). */}
        <p className="mt-2 text-sm text-zetis-muted" aria-live="polite">
          {remplies} étape{remplies > 1 ? "s" : ""} sur {offertes.length} {remplies > 1 ? "ont" : "a"}{" "}
          quelque chose — et rien ne presse.
        </p>
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400/70 transition-all"
            style={{ width: `${(remplies / offertes.length) * 100}%` }}
          />
        </div>
      </header>

      {error && (
        <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>
      )}

      {/* `select-none` sur TOUTE la colonne : un glisser qui démarre à quelques pixels d'une
          phrase sélectionnait le texte — et sur iPhone, une sélection déclenche la loupe et le
          menu Copier au milieu du travail. */}
      <div className="flex select-none flex-col gap-2">
        {offertes.map((etape) => {
          const depliee = ouverte === etape.id;
          const faite =
            etape.id === "points_cles"
              ? choisis.length > 0
              : etape.id === "essentiel"
                ? essentiel.trim().length > 0
                : etape.id === "definitions"
                  ? Object.values(definitions).some((d) => d.trim())
                  : pieges.length > 0;
          return (
            <section
              key={etape.id}
              className={`rounded-2xl border bg-white/5 ${
                depliee ? "border-cyan-400/40" : "border-white/10"
              }`}
            >
              <button
                type="button"
                onClick={() => setOuverte(depliee ? ("" as FicheSection) : etape.id)}
                aria-expanded={depliee}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                {/* Jalon : ● fait · ◍ en cours · ○ vide */}
                <span className="text-sm text-cyan-200">
                  {faite ? "●" : depliee ? "◍" : "○"} {etape.num}
                </span>
                {/* 🔴 `min-w-0` n'est pas décoratif : sans lui, le `truncate` de l'aperçu ne peut
                    PAS mordre — un élément flex refuse de rétrécir sous la largeur de son
                    contenu. Mesuré sur iPhone le 2026-08-13 : la ligne poussait à 402 px dans un
                    conteneur de 375, et la page se laissait tirer de côté au doigt. */}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-100">{etape.titre}</span>
                  {/* Repliée, l'étape montre un APERÇU de son contenu — pas seulement un ✓ —
                      ou une amorce de sens quand elle est vide. */}
                  {!depliee && (
                    <span className="block truncate text-xs text-zetis-muted">
                      {apercu(etape.id)}
                    </span>
                  )}
                </span>
                <span className="text-slate-400">{depliee ? "⌄" : "›"}</span>
              </button>

              {depliee && (
                <div className="border-t border-white/10 p-4">
                  <div className="mb-4 flex items-start gap-2">
                    <p className="flex-1 text-sm text-slate-200">🪐 {etape.bulle}</p>
                    <button
                      type="button"
                      // Toujours sur un GESTE, et **muet pendant l'enregistrement** : sans
                      // écouteurs, sa voix repartirait droit dans le micro Whisper (§5 bis).
                      onClick={() => void speak(etape.bulle)}
                      disabled={micro !== null}
                      aria-label="Écouter ZETIS"
                      className="rounded-full border border-white/15 px-2 py-1 text-sm disabled:opacity-30"
                    >
                      🔊
                    </button>
                  </div>

                  {etape.id === "points_cles" && (
                    <EtapeChoix
                      slots={slots}
                      choisis={choisis}
                      restants={restants}
                      survole={survole}
                      glisseEnCours={glisse !== null}
                      onRetirer={retirer}
                      onGlisser={demarrerGlisse}
                    />
                  )}

                  {etape.id === "essentiel" && (
                    <EtapeEssentiel
                      valeur={essentiel}
                      amorce={amorce}
                      placeRestante={placeRestante}
                      enregistrement={micro !== null}
                      transcrit={transcrit}
                      onChange={ecrireEssentiel}
                      onBlur={() => void persister()}
                      onMicro={() => void basculerMicro()}
                    />
                  )}

                  {etape.id === "definitions" && (
                    <EtapeDefinitions
                      termes={termes}
                      definitions={definitions}
                      onChange={ecrireDefinition}
                      onBlur={() => void persister()}
                    />
                  )}

                  {etape.id === "erreurs_a_eviter" && (
                    <EtapePieges
                      proposes={piegesProposes}
                      retenus={pieges}
                      onBasculer={basculerPiege}
                    />
                  )}

                  {/* ⑤ — même nature qu'`essentiel` : un champ libre avec son amorce. Un exemple
                      ne se choisit pas dans le cours, il s'invente. */}
                  {etape.id === "mini_exemple" && (
                    <EtapeChampLibre
                      valeur={miniExemple}
                      amorce={amorceExemple}
                      lignes={3}
                      placeholder="Par exemple…"
                      max={FICHE_BUDGETS.miniExemple}
                      onChange={(v) => {
                        miniExempleRef.current = v.slice(0, FICHE_BUDGETS.miniExemple);
                        setMiniExemple(miniExempleRef.current);
                      }}
                      onBlur={() => void persister()}
                    />
                  )}

                  {/* ⑥ — deux champs d'UNE ligne, et aucune amorce : ZETIS n'oriente pas
                      l'invention. Le §10 : le meilleur mnémonique est celui que Massimo invente. */}
                  {etape.id === "mnemonique" && (
                    <div className="flex flex-col gap-3">
                      <EtapeChampLibre
                        valeur={mnemoMoyen}
                        amorce={null}
                        lignes={2}
                        placeholder="Mais Où Est Donc Ornicar…"
                        max={FICHE_BUDGETS.mnemoMoyen}
                        onChange={(v) => {
                          mnemoMoyenRef.current = v.slice(0, FICHE_BUDGETS.mnemoMoyen);
                          setMnemoMoyen(mnemoMoyenRef.current);
                        }}
                        onBlur={() => void persister()}
                      />
                      <label className="text-xs text-zetis-muted">
                        Ça sert à retenir quoi ?
                        <EtapeChampLibre
                          valeur={mnemoSertA}
                          amorce={null}
                          lignes={1}
                          placeholder="les conjonctions de coordination"
                          max={FICHE_BUDGETS.mnemoSertA}
                          onChange={(v) => {
                            mnemoSertARef.current = v.slice(0, FICHE_BUDGETS.mnemoSertA);
                            setMnemoSertA(mnemoSertARef.current);
                          }}
                          onBlur={() => void persister()}
                        />
                      </label>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setSeche(etape.id)}
                    className="mt-4 text-sm text-zetis-muted underline"
                  >
                    Je sèche sur cette étape
                  </button>
                  {/* 🔴 PAR ÉTAPE, pas une fois pour la fiche. Réponse jamais déçue, aucune
                      relance, aucune confirmation : si dire « je ne sais pas » est gratuit, il le
                      dit — sinon il recopie son cours (règle 4 du §5). */}
                  {seche === etape.id && (
                    <p className="mt-2 text-sm text-slate-300">
                      C'est bon, ça arrive. Tu peux passer à une autre étape ou revenir demain —
                      ce que tu as déjà fait t'attendra ici.
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {retour && (
        <section className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="mb-2 text-sm font-semibold text-emerald-100">🪐 J'ai regardé.</p>
          <ul className="mb-3 flex flex-col gap-1">
            {retour.reussites.map((r) => (
              <li key={r} className="text-sm text-slate-100">
                ⭐ {r}
              </li>
            ))}
          </ul>
          {retour.remarques.map((r, i) =>
            gardees.includes(i) ? (
              <p key={i} className="text-sm text-slate-300">
                ✓ Gardée. C'est ta fiche.
              </p>
            ) : (
              <div
                key={i}
                className="mb-2 rounded-xl border border-white/10 bg-white/5 p-3 last:mb-0"
              >
                <p className="text-sm text-slate-100">{r.message}</p>
                {r.piste && <p className="mt-1 text-sm text-cyan-200">{r.piste}</p>}
                {/* Le dernier mot est à Massimo : un clic, silencieux, aucune confirmation. */}
                <button
                  type="button"
                  onClick={() => setGardees((g) => [...g, i])}
                  className="mt-2 text-sm text-zetis-muted underline"
                >
                  Je garde ma phrase
                </button>
              </div>
            ),
          )}
        </section>
      )}

      <footer className="flex flex-col gap-2 pb-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void regarder()}
            disabled={!quelqueChose}
            className="rounded-xl bg-zetis-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            ZETIS, regarde ma fiche
          </button>
          <button
            type="button"
            onClick={() => void terminer()}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100"
          >
            C'est fini, je la garde
          </button>
          {/* Sortie sans confirmation : la fiche reste « commencée », ce n'est pas un abandon. */}
          <button
            type="button"
            onClick={retourAuDeck}
            className="px-2 py-2 text-sm text-zetis-muted"
          >
            J'ai fini pour aujourd'hui
          </button>
        </div>
        <p className="text-xs text-zetis-muted" aria-live="polite">
          {enregistre
            ? "✓ gardé"
            : "Tout est gardé au fur et à mesure — tu peux fermer et revenir demain."}
        </p>
      </footer>

      {/* Fantôme de la phrase tirée. `pointer-events: none` est OBLIGATOIRE : sans lui, il se
          trouverait sous le doigt au lâcher et masquerait la cible à `elementFromPoint`. */}
      {glisse && (
        <div
          style={{
            position: "fixed",
            left: glisse.x,
            top: glisse.y,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 60,
            maxWidth: "min(90vw, 28rem)",
          }}
          className="rounded-xl border border-cyan-300/70 bg-cyan-500/25 px-3 py-1.5 text-sm text-cyan-50 shadow-lg"
        >
          {glisse.texte}
        </div>
      )}
    </div>
  );
}

// ── Étape ① — je choisis ───────────────────────────────────────────────────────

function EtapeChoix({
  slots,
  choisis,
  restants,
  survole,
  glisseEnCours,
  onRetirer,
  onGlisser,
}: {
  slots: number;
  choisis: string[];
  restants: FicheCandidate[];
  survole: number | null;
  glisseEnCours: boolean;
  onRetirer: (i: number) => void;
  onGlisser: (texte: string, e: ReactPointerEvent) => void;
}) {
  return (
    <>
      <ol className="mb-4 flex flex-col gap-2">
        {Array.from({ length: slots }, (_, i) => {
          const texte = choisis[i];
          return (
            <li key={i}>
              {texte ? (
                <div className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-2">
                  <span className="text-xs text-cyan-200">{i + 1}</span>
                  <span className="flex-1 text-sm text-slate-100">{texte}</span>
                  {/* Le SEUL clic de cette étape : retirer. Poser se fait au glisser. */}
                  <button
                    type="button"
                    onClick={() => onRetirer(i)}
                    aria-label={`Retirer l'idée ${i + 1}`}
                    // 44 px : la cible tactile du projet (cf. `CloseFullscreenButton`).
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 text-sm text-slate-300"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  data-emplacement={i}
                  className={`rounded-xl border border-dashed p-2 text-sm transition ${
                    survole === i
                      ? "border-cyan-300 bg-cyan-400/15 text-cyan-100"
                      : glisseEnCours
                        ? "border-cyan-400/40 text-slate-300"
                        : "border-white/15 text-zetis-muted"
                  }`}
                >
                  {i + 1}. {survole === i ? "dépose ici" : "un emplacement libre"}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Les phrases de ton cours
      </h3>
      <p className="mb-2 text-xs text-zetis-muted">
        Glisse une phrase sur un emplacement. Pour en retirer une, clique sur sa croix.
      </p>
      {/* ⚠️ Les phrases non retenues NE SONT PAS FAUSSES : elles sont vraies mais secondaires.
          C'est ce qui rend le choix formateur — et ce qui interdit tout signe de « mauvaise
          réponse » ici.

          🔴 `max-h-72` n'est pas un réglage esthétique. Mesuré le 2026-08-13 : sans plafond, les
          12 phrases poussaient les étapes ② et ③ à y=1310 et y=1392 pour une hauteur visible de
          1095 — **sous la pliure**. Massimo ne pouvait pas savoir qu'elles existaient. Or la spec
          promet exactement l'inverse : « une seule étape dépliée, **le plan reste visible** ».
          Au-delà du plafond, ce sont les PHRASES qui défilent, dans leur propre cadre — jamais la
          colonne. Même correction que la banque de nœuds de l'ADR-0052.

          Un plafond en `rem` et non en `vh` : le viewport n'est pas le conteneur (ADR-0052 §2). */}
      <div className="flex max-h-44 flex-col gap-2 overflow-y-auto sm:max-h-72">
        {restants.length === 0 && (
          <p className="text-sm text-zetis-muted">Tu les as toutes placées.</p>
        )}
        {restants.map((c) => (
          <button
            key={c.index}
            type="button"
            // Glisser par POINTEUR (souris ET doigt) — le HTML5 `draggable` ne se déclenche pas
            // au doigt sur iPhone. `touch-none` empêche la page de défiler pendant qu'on tire.
            onPointerDown={(e) => onGlisser(c.texte, e)}
            disabled={choisis.length >= slots}
            className="cursor-grab touch-none select-none rounded-xl border border-white/10 bg-white/5 p-2 text-left text-sm text-slate-200 transition hover:border-cyan-400/40 active:cursor-grabbing disabled:opacity-40"
          >
            {c.texte}
          </button>
        ))}
      </div>
    </>
  );
}

// ── Étape ② — le champ libre ───────────────────────────────────────────────────

/**
 * Champ libre GÉNÉRIQUE des étapes ⑤ et ⑥ (ADR-0055).
 *
 * ⚠️ **Volontairement distinct d'`EtapeEssentiel`** : celle-là porte la dictée, la barre de
 * budget et son vocabulaire (« il te reste de la place pour 2 lignes »). Les fusionner
 * demanderait de rendre optionnelles la moitié de ses props — `CLAUDE.md` n° 7, une abstraction
 * prématurée coûte plus qu'elle ne rapporte. À rouvrir si une troisième surface apparaît.
 *
 * 🔴 **Jamais de compteur de caractères** : la coupe est silencieuse, comme partout ailleurs sur
 * cet écran. « 412 / 600 » est une notation déguisée.
 */
function EtapeChampLibre({
  valeur,
  amorce,
  lignes,
  placeholder,
  max,
  onChange,
  onBlur,
}: {
  valeur: string;
  amorce: string | null;
  lignes: number;
  placeholder: string;
  max: number;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <textarea
      value={valeur || (amorce ?? "")}
      onChange={(e) => onChange(e.target.value.slice(0, max))}
      onBlur={onBlur}
      rows={lignes}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 placeholder:text-zetis-muted"
    />
  );
}

function EtapeEssentiel({
  valeur,
  amorce,
  placeRestante,
  enregistrement,
  transcrit,
  onChange,
  onBlur,
  onMicro,
}: {
  valeur: string;
  amorce: string | null;
  placeRestante: number;
  enregistrement: boolean;
  transcrit: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  onMicro: () => void;
}) {
  const plein = placeRestante === 0;
  return (
    <>
      {/* Règle 1 des champs libres : JAMAIS de zone vide. L'amorce ne dit rien du contenu — elle
          enlève seulement le premier pas, qui est ce qui fait recopier le cours. */}
      {amorce && <p className="mb-1 text-sm text-zetis-muted">{amorce}</p>}
      <textarea
        value={valeur}
        onChange={(e) => onChange(e.target.value.slice(0, FICHE_BUDGETS.essentiel))}
        onBlur={onBlur}
        rows={4}
        aria-label="L'essentiel, avec tes mots"
        placeholder="…"
        className="w-full select-text rounded-xl border border-white/15 bg-slate-900/60 p-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {/* Le budget se montre comme de la PLACE, jamais « 412 / 600 », jamais de rouge. */}
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400/60"
            style={{ width: `${Math.min(100, (valeur.length / FICHE_BUDGETS.essentiel) * 100)}%` }}
          />
        </div>
        <span className="text-xs text-zetis-muted">
          {plein
            ? "ta fiche est pleine — et c'est très bien"
            : `il te reste de la place pour ${placeRestante} ligne${placeRestante > 1 ? "s" : ""}`}
        </span>
        {isDictationSupported() && (
          <button
            type="button"
            onClick={onMicro}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              enregistrement
                ? "border-rose-400/60 text-rose-200"
                : "border-white/15 text-slate-200"
            }`}
          >
            {enregistrement ? "⏹ J'ai fini de parler" : "🎙️ Le dire à voix haute"}
          </button>
        )}
      </div>
      {enregistrement && (
        <p className="mt-2 text-xs text-zetis-muted">
          Je t'écoute — je me tais pendant que tu parles.
        </p>
      )}
      {transcrit && !enregistrement && (
        <p className="mt-2 text-xs text-zetis-muted">
          Voilà ce que j'ai entendu. Corrige-le si j'ai mal compris.
        </p>
      )}
      <p className="mt-2 text-xs text-zetis-muted">ZETIS ne dit rien pendant que tu écris.</p>
    </>
  );
}

// ── Étape ③ — ZETIS donne le mot, Massimo écrit la définition ──────────────────

function EtapeDefinitions({
  termes,
  definitions,
  onChange,
  onBlur,
}: {
  termes: string[];
  definitions: Record<string, string>;
  onChange: (terme: string, v: string) => void;
  onBlur: () => void;
}) {
  if (termes.length === 0) {
    return (
      <p className="text-sm text-zetis-muted">
        Je n'ai pas trouvé de mot à définir dans cette leçon.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {termes.map((terme) => (
        <div key={terme}>
          <label className="mb-1 block text-sm font-medium text-cyan-200" htmlFor={`def-${terme}`}>
            {terme}
          </label>
          <input
            id={`def-${terme}`}
            value={definitions[terme] ?? ""}
            onChange={(e) => onChange(terme, e.target.value.slice(0, 300))}
            onBlur={onBlur}
            placeholder="c'est…"
            className="w-full select-text rounded-xl border border-white/15 bg-slate-900/60 p-2 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
          />
        </div>
      ))}
      <p className="text-xs text-zetis-muted">
        Je te donne le mot, tu dis ce qu'il veut dire. C'est ta phrase que tu réviseras.
      </p>
    </div>
  );
}

/**
 * Étape ④ — les pièges, proposés depuis ses ERREURS mesurées.
 *
 * 🔴 **La `raison` porte tout.** Sans elle, « Attention à : les fractions » est un conseil sorti
 * de nulle part — exactement ce que la règle 7 interdit. Avec elle, c'est sa propre mesure qu'on
 * lui rend, et il reste seul juge de ce qui va sur sa fiche.
 *
 * Un OUI/NON, pas un glisser : il n'y a rien à placer, il y a quelque chose à confirmer.
 */
function EtapePieges({
  proposes,
  retenus,
  onBasculer,
}: {
  proposes: FicheCandidate[];
  retenus: string[];
  onBasculer: (texte: string) => void;
}) {
  if (proposes.length === 0) {
    return (
      <p className="text-sm text-zetis-muted">
        Je n'ai rien noté sur cette leçon pour l'instant — pas de piège à mettre. Ça viendra en
        travaillant.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {proposes.map((p) => {
        const pris = retenus.includes(p.texte);
        return (
          <button
            key={p.index}
            type="button"
            onClick={() => onBasculer(p.texte)}
            aria-pressed={pris}
            /* 44 px de haut minimum : cible tactile du projet (mesurée à 36 px et corrigée le
               2026-08-13 sur la croix de l'étape ①). */
            className={`flex min-h-[44px] items-center gap-3 rounded-xl border p-3 text-left ${
              pris ? "border-amber-400/60 bg-amber-400/10" : "border-white/15 bg-slate-900/40"
            }`}
          >
            <span className="text-lg">{pris ? "⚠️" : "○"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-slate-100">{p.texte}</span>
              {p.raison && (
                <span className="block text-xs text-zetis-muted">{p.raison}</span>
              )}
            </span>
          </button>
        );
      })}
      <p className="text-xs text-zetis-muted">
        Tu choisis ce qui va sur ta fiche. Ce que tu laisses ici, je le garde quand même pour te le
        reproposer plus tard.
      </p>
    </div>
  );
}
