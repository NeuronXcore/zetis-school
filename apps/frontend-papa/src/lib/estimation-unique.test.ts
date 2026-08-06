import { describe, expect, it } from "vitest";

// 🔒 VERROU DU §9 DE L'ADR-0041 — plus aucune durée n'est devinée par un écran.
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
//
// 🔴 **Ce test a changé de nature en slice C, et c'est le fait qui compte.** Il était un CLIQUET —
// « la dette n'a pas le droit de grandir », avec douze fichiers inscrits noir sur blanc. La dette
// est **dissoute** : plus aucune barre Papa ne porte de durée. Il est donc redevenu ce qu'un
// verrou doit être — un interdit, sans liste d'exceptions.

// ⚠️ `import.meta.glob` de Vite plutôt que `node:fs` : le tsconfig de Papa ne porte pas les
// types Node, et les ajouter pour un test lexical serait payer une dépendance pour rien.
// Les clés sont relatives à CE fichier (`../…`), on les normalise en chemins depuis `src/`.
const SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** 🔴 **LE guichet, et le seul.** `useProgressionEstimee` appelle `useEstimatedProgress` avec la
 *  durée que le SERVEUR mesure — c'est la fonction par laquelle toutes les barres passent
 *  désormais. L'exclure du balayage n'est pas une exception concédée : c'est la destination.
 *
 *  ⚠️ Si un jour ce fichier portait un nombre en dur, ce test ne le verrait pas. C'est le prix
 *  d'avoir UN point de passage — et c'est précisément pour ça que ce point de passage n'a le droit
 *  de lire QUE `estimations[jobType]`. */
const GUICHET = "/hooks/useEstimations.ts";

const FICHIERS: [string, string][] = Object.entries(SOURCES)
  .filter(([chemin]) => !/\.test\.tsx?$/.test(chemin))
  .map(([chemin, src]) => [chemin.replace(/^\.\./, ""), src] as [string, string])
  .filter(([chemin]) => chemin !== GUICHET);

/** Les rares durées légitimes, avec le motif qui les autorise.
 *
 *  ⚠️ **Une durée n'entre ici que si elle n'estime AUCUN travail LLM.** Le jour où l'on est tenté
 *  d'y ajouter un producteur, c'est qu'il faut lui donner un `job_type` — pas une ligne ici. */
const AUTORISEES: Record<string, string> = {
  GEN_MS:
    "analyse par matière — producteur LLM SANS trace `ai_jobs`, donc sans `job_type` et sans historique à mesurer. La tracer d'abord ; le §4 ne le demande pas",
  LONG_MS: "seuil de bascule d'un message d'attente, pas une estimation de durée",
  MISSION_MS:
    "composition pur-DB sans LLM : l'ADR-0041 §4 l'exclut EXPLICITEMENT de la file, donc le §9 ne la vise pas",
  POLL_MS: "période de sondage, pas une estimation de durée",
  AUTO_CLOSE_MS: "fermeture d'une annonce, pas une estimation de durée",
  RENDER_JOB_TIMEOUT: "garde-fou de worker, pas une estimation",
};

describe("§9 — plus aucune durée devinée par un écran", () => {
  it("🔒 aucun composant Papa ne déclare sa propre durée d'ÉQUIPEMENT", () => {
    // On cherche une DÉCLARATION, pas une mention en commentaire : les commentaires de ce
    // chantier parlent abondamment d'`EQUIP_MS` pour expliquer pourquoi elle n'est plus là.
    const coupables = FICHIERS.filter(([, src]) =>
      /^\s*(const|let)\s+EQUIP_MS\b/m.test(src),
    ).map(([f]) => f);

    expect(coupables, "l'équipement s'estime côté SERVEUR — `estimated_ms`").toEqual([]);
  });

  it("🔒 AUCUNE barre ne pilote son avancement avec une durée écrite dans le frontend", () => {
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
        const toutesConnues = noms.length === 0 || noms.every((n) => n in AUTORISEES);
        if (litteral || !toutesConnues) trouvees.push(f);
      }
    }

    // 🔴 **ZÉRO, et plus « la liste n'a pas le droit de grandir ».** La slice C a dissous les douze
    // fichiers de `DETTE_SLICE_C` : les durées vivent côté serveur, où elles sont MESURÉES
    // (médiane des exécutions réussies par `job_type`). Une barre qui réintroduirait un nombre ici
    // recréerait la divergence entre écrans que tout ce chantier a servi à fermer.
    expect(
      [...new Set(trouvees)].sort(),
      "cette barre estime avec une durée écrite en dur : passe par `useProgressionEstimee(actif, " +
        '"<job_type>")`, qui lit la mesure du serveur',
    ).toEqual([]);
  });

  it("🔒 les trois surfaces d'équipement lisent la MÊME source — le serveur", () => {
    // L'en-tête, la page du Conseil et le dépliage de Progression lancent tous le même travail.
    // C'est très exactement le trio qui s'était mis à diverger : trois constantes indépendantes
    // pour un seul travail. Elles lisent désormais la durée que le serveur MESURE — `estimated_ms`
    // sur l'item d'activité pour l'en-tête, `estimatedMs` de l'état de travail pour les deux
    // autres, qui sondent `GET /ai/jobs/{id}`.
    // 🔴 **Le verrou vise le 2ᵉ ARGUMENT, pas le fichier.** Première version : un `toContain` sur
    // le nom du champ — resté **VERT sur son sabotage** (2026-08-06), parce que le champ figurait
    // encore dans la CONDITION d'activation et dans un commentaire pendant que la durée, elle,
    // était redevenue `69000`. Cinquième fois que ce motif apparaît dans ce dépôt : un verrou
    // lexical doit viser l'endroit exact où la règle s'applique, jamais le voisinage.
    // ⚠️ **La cible de l'en-tête a changé le 2026-08-07, et pas par commodité.** La BANDE qui
    // remplace la pilule (addendum 2 §20) n'estime plus rien : la maquette tranche que sans
    // granularité il n'y a « aucun chiffre — et aucune case », parce qu'un « — » à cet endroit se
    // lirait encore comme une valeur. L'estimation de l'en-tête vit donc désormais dans son
    // panneau de DÉTAIL, qui affiche bien un `≈ N %` par travail. Le trio est intact : trois
    // surfaces, une seule source, celle que le serveur mesure.
    for (const [cible, champ] of [
      ["/components/ProductionPopover.tsx", "estimated_ms"],
      ["/pages/ConseilClasseIAPage.tsx", "estimatedMs"],
      ["/components/progression/SubjectDetailRow.tsx", "estimatedMs"],
    ] as const) {
      const entree = FICHIERS.find(([f]) => f === cible);
      expect(entree, `${cible} introuvable — le verrou vise un fichier qui n'existe plus`).toBeDefined();

      // Le 2ᵉ argument de chaque appel — celui qui porte la DURÉE. On accepte les parenthèses et
      // le `?.` : `(etat?.estimatedMs ?? 0)`.
      const durees = [
        ...entree![1].matchAll(/useEstimatedProgress\(\s*[^,]+(?:,\s*)([^\n]*?),\s*$/gm),
      ].map((m) => m[1].trim());
      expect(
        durees.length,
        `${cible} : aucun appel à useEstimatedProgress trouvé — le verrou ne mesure plus rien`,
      ).toBeGreaterThan(0);
      expect(
        durees.some((d) => d.includes(champ)),
        `${cible} : la durée passée à la barre doit venir du serveur (\`${champ}\`), pas d'un nombre. Trouvé : ${durees.join(" | ")}`,
      ).toBe(true);
    }
  });

  it("🔒 les tables de durées du frontend sont bien MORTES, pas déplacées", () => {
    // ⚠️ Contre-épreuve du test précédent. Sans elle, on pourrait rassembler les 23 constantes
    // dans un seul fichier `lib/` et croire le §9 satisfait : elles seraient encore des
    // devinettes, simplement regroupées. Ce que le §9 exige, c'est qu'elles n'existent PLUS —
    // le serveur a l'historique de ce que chaque travail a duré, l'écran ne l'a pas.
    const mortes = ["GENERATION_MS", "SCOPE_MS", "KIT_MS_PER_NOTION", "WORK_ESTIMATION_MS"];
    for (const nom of mortes) {
      const survivants = FICHIERS.filter(([, src]) =>
        new RegExp(`^\\s*export\\s+const\\s+${nom}\\b`, "m").test(src),
      ).map(([f]) => f);
      expect(survivants, `${nom} est ressuscitée — les durées vivent côté serveur`).toEqual([]);
    }
  });
});
