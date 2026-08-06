import { describe, expect, it } from "vitest";

// 🔒 VERROU DU §9 DE L'ADR-0041 — une seule source pour estimer un travail migré.
//
// ## Ce que ce test empêche, et pourquoi il est LEXICAL
//
// Avant ce chantier, 23 surfaces Papa estimaient chacune dans leur coin. La rédaction d'un cours
// portait **cinq** durées différentes selon l'écran d'où on la lançait (45 / 42 / 50 / 50 / 22 s),
// `equip_notion` en portait **quatre** (90 / 90 / 60 / 69 s) — et **une seule** avait jamais été
// mesurée.
//
// Le commentaire de `SubjectDetailRow` avait vu le risque et s'en protégeait en RECOPIANT la
// valeur du Conseil : « deux estimations différentes pour le même travail se contrediraient à
// l'écran ». Une valeur copiée diverge au premier correctif, et c'est arrivé — le 2026-08-06, un
// équipement de **11 ms** a fait dérouler dix secondes de pipeline à la page du Conseil pendant
// que l'en-tête, qui MESURE, disait juste. Les deux surfaces se sont contredites en direct.
//
// Aucun test de rendu n'aurait attrapé ça : chaque composant était juste **tout seul**. Le défaut
// ne vit que dans l'écart entre deux fichiers, donc le verrou se pose sur les fichiers.

// ⚠️ `import.meta.glob` de Vite plutôt que `node:fs` : le tsconfig de Papa ne porte pas les
// types Node, et les ajouter pour un test lexical serait payer une dépendance pour rien.
// Les clés sont relatives à CE fichier (`../…`), on les normalise en chemins depuis `src/`.
const SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const FICHIERS: [string, string][] = Object.entries(SOURCES)
  .filter(([chemin]) => !/\.test\.tsx?$/.test(chemin))
  .map(([chemin, src]) => [chemin.replace(/^\.\./, ""), src]);

/** Les constantes de durée légitimes, avec le motif qui les autorise. Toute AUTRE est un retour
 *  du défaut — et si un travail cesse d'être estimé localement, sa ligne part d'ici. */
const AUTORISEES: Record<string, string> = {
  WORK_ESTIMATION_MS:
    "LA source unique — la seule durée jamais mesurée (69 s/notion, 2026-08-02, reconfirmée 77 s le 2026-08-06)",
  MISSION_MS:
    "composition pur-DB sans LLM : l'ADR-0041 §4 l'exclut EXPLICITEMENT de la file, donc le §9 ne la vise pas",
  GEN_MS: "génération d'un rapport de Conseil — producteur NON migré en slice A",
  GEN_EXPECTED_MS: "quiz — producteur NON migré en slice A",
  POLL_MS: "période de sondage, pas une estimation de durée",
  AUTO_CLOSE_MS: "fermeture d'une annonce, pas une estimation de durée",
  RENDER_JOB_TIMEOUT: "garde-fou de worker, pas une estimation",
  // ⚠️ Ces deux-là sont des DURÉES estimées, et elles restent — mais elles vivent déjà dans UN
  // seul fichier (`lib/production.ts`), et `SCOPE_MS` réutilise `GENERATION_MS` au lieu de la
  // recopier. C'est exactement la forme visée. Elles couvrent les producteurs que la slice A n'a
  // pas migrés (cours, fiche, quiz, mindmap, cartes) : **elles meurent en slice C**, quand ces
  // producteurs entreront dans la file à leur tour.
  GENERATION_MS: "durées par pièce des producteurs NON migrés — centralisées, à supprimer en slice C",
  SCOPE_MS: "dérivée de GENERATION_MS (aucune recopie) — à supprimer en slice C",
};

describe("§9 — une seule estimation pour un travail migré", () => {
  it("🔒 aucun composant Papa ne déclare sa propre durée d'ÉQUIPEMENT", () => {
    // On cherche une DÉCLARATION, pas une mention en commentaire : les commentaires de ce
    // chantier parlent abondamment d'`EQUIP_MS` pour expliquer pourquoi elle n'est plus là.
    const coupables = FICHIERS.filter(([, src]) =>
      /^\s*(const|let)\s+EQUIP_MS\b/m.test(src),
    ).map(([f]) => f);

    expect(coupables, "l'équipement s'estime en UN endroit — `WORK_ESTIMATION_MS`").toEqual([]);
  });

  it("🔒 toute durée qui PILOTE UNE BARRE est nommée et justifiée", () => {
    // ⚠️ **Le test porte sur l'usage, pas sur le nom.** Une première version listait toute
    // constante `*_MS` et attrapait un fondu, un toast, un seuil et un plafond de sondage —
    // aucun n'estime un travail. Une durée n'est dangereuse que **quand elle pilote une barre de
    // progression** : c'est là, et seulement là, qu'elle peut contredire une autre surface.
    const trouvees: string[] = [];
    for (const [f, src] of FICHIERS) {
      // Le 2ᵉ argument de `useEstimatedProgress(active, duree, ancre?)`.
      for (const m of src.matchAll(/useEstimatedProgress\(\s*[^,]+,\s*([^,)\n]+)/g)) {
        const arg = m[1].trim();
        const noms = arg.match(/[A-Z][A-Z0-9_]*_MS\b|[A-Z][A-Za-z0-9_]*_META\b/g) ?? [];
        const litteral = /\b\d{4,}\b/.test(arg);
        const toutesConnues = noms.length > 0 && noms.every((n) => n in AUTORISEES);
        if (litteral || !toutesConnues) trouvees.push(f);
      }
    }

    // 🔴 **Un CLIQUET, pas un feu vert.** La slice A n'a migré QU'`equip_notion` ; les autres
    // producteurs estiment encore en dur, et c'est écrit noir sur blanc ci-dessous plutôt que
    // laissé à la mémoire de quelqu'un. Ce test n'exige pas zéro — il exige que **la liste ne
    // GRANDISSE pas**. Elle fondra en slice C, quand ces producteurs entreront dans la file.
    //
    // Ajouter une barre estimée en dur fait rougir ce test : c'est le but.
    const DETTE_SLICE_C = [
      "/components/ChampionMissionModal.tsx",
      "/components/couverture/ChapterProductionModal.tsx",
      "/components/demandes/NotionRequestActionModal.tsx",
      "/components/programme/LessonContentModal.tsx",
      "/components/programme/LessonsPanel.tsx",
      "/components/programme/OrphanNotionsPanel.tsx",
      "/components/programme/SkillsBackfillModal.tsx",
      "/components/srs-cards/SubjectSection.tsx",
      "/pages/CapsulesPilotagePage.tsx",
      "/pages/CouverturePage.tsx",
      "/pages/ProgrammePage.tsx",
      // Repli `|| 30000` de `SCOPE_MS` — même classe, même échéance.
      "/hooks/useRunProgress.ts",
    ];

    const nouvelles = [...new Set(trouvees)]
      .filter((f) => !DETTE_SLICE_C.includes(f))
      .sort();
    expect(
      nouvelles,
      "cette barre estime avec une durée en dur : fais-lui lire `WORK_ESTIMATION_MS`. " +
        "La dette existante est inscrite dans DETTE_SLICE_C et n'a pas le droit de grandir",
    ).toEqual([]);

    // Contre-épreuve : la dette inscrite doit être RÉELLE. Une entrée périmée ferait passer ce
    // test pour la mauvaise raison, et masquerait la prochaine.
    const reelles = new Set(trouvees);
    expect(
      DETTE_SLICE_C.filter((f: string) => !reelles.has(f)),
      "cette dette est réglée — retire sa ligne de DETTE_SLICE_C",
    ).toEqual([]);
  });

  it("🔒 les trois surfaces d'équipement lisent la MÊME constante", () => {
    // L'en-tête, la page du Conseil et le dépliage de Progression lancent tous le même travail.
    // C'est très exactement le trio qui s'était mis à diverger.
    for (const cible of [
      "/components/ProductionBar.tsx",
      "/pages/ConseilClasseIAPage.tsx",
      "/components/progression/SubjectDetailRow.tsx",
    ]) {
      const entree = FICHIERS.find(([f]) => f === cible);
      expect(entree, `${cible} introuvable — le verrou vise un fichier qui n'existe plus`).toBeDefined();
      expect(entree![1], cible).toContain("WORK_ESTIMATION_MS");
    }
  });
});
