// Aperçu au survol d'un jour (ADR-0025 Amdt 8 §D12).
//
// 🔴 **Ce fichier existe surtout pour UN verrou : le registre.** Le commanditaire a demandé, le
// 2026-08-17, un « cadre rouge » sur les jours passés dont un devoir n'est pas fait, avec la
// notion de « retard ». Le §7 l'interdit en toutes lettres — *« aucun rouge, aucun "en retard",
// aucun compteur d'arriéré »* — et le `CLAUDE.md` impose « à reprendre ». Après discussion, il a
// tranché POUR l'ambre et « à reprendre ».
//
// Le prochain qui voudra du rouge butera ici, et lira pourquoi.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { type AgendaItemStudent } from "@zetis/types";
import { AgendaDayToast } from "./AgendaDayToast";

const HIER = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function item(over: Partial<AgendaItemStudent> = {}): AgendaItemStudent {
  return {
    id: 1,
    label: "Exercices 12 à 18",
    subject: { id: 1, slug: "mathematiques", name: "Mathématiques", color: "#60a5fa" },
    due_on: HIER,
    kind: "devoir",
    done: false,
    created_by: "parent",
    edited_by_parent: false,
    lesson_id: null,
    chapter_id: null,
    revisable_cards: 0,
    ...over,
  };
}

const ANCRE = { left: 100, top: 300, bottom: 360, width: 44, height: 60 } as DOMRect;

function toast(over: Partial<React.ComponentProps<typeof AgendaDayToast>> = {}) {
  return render(
    <AgendaDayToast date={HIER} ancre={ANCRE} items={[]} traces={[]} {...over} />,
  );
}

describe("AgendaDayToast", () => {
  it("🔴 VERROU INVERSÉ §D17 — « En retard » est désormais DIT ; le rouge reste interdit", () => {
    // 🔴 **Test INVERSÉ le 2026-08-17**, dans la même journée que son écriture.
    //
    // ~~« un passé non fait dit "à reprendre", JAMAIS "en retard" » — le §7 l'interdit en toutes
    // lettres (*« aucun rouge, aucun "en retard", aucun compteur d'arriéré »*) et le CLAUDE.md
    // impose « notion à renforcer » / « à reprendre », jamais « échec ». C'est la doctrine
    // pédagogique du produit, celle qui a coûté le retrait de la série le 2026-07-27.~~
    //
    // Le commanditaire avait d'abord demandé « cadre rouge » + « retard », puis **écarté
    // lui-même le mot** au profit de l'ambre et de « à reprendre » (§D14) après que la doctrine
    // lui a été posée. Il l'a ensuite **redemandé explicitement**, sous forme de badge.
    // Révocation écrite au §D17 — pas un effet de bord.
    //
    // ⚠️ **Un test inversé qui ne dit pas pourquoi est un test perdu** (jurisprudence de
    // l'Amendement 7). L'ancienne raison reste ci-dessus, barrée.
    const { container } = toast({ items: [item({ done: false })] });

    // Le mot est désormais AFFIRMÉ, en badge.
    expect(screen.getByText(/^En retard$/i)).toBeInTheDocument();
    // Et « à reprendre » SURVIT sur la ligne de l'item : le badge nomme l'état du jour, le mot
    // nomme ce qu'il reste à faire. Les deux registres cohabitent, ils ne se remplacent pas.
    expect(screen.getByText(/à reprendre/i)).toBeInTheDocument();

    // 🔴 **CE QUI RESTE INTERDIT, et n'a PAS été révoqué : le ROUGE.**
    // Seul le MOT a changé de statut. Ni classe Tailwind rouge, ni rouge en dur.
    expect(container.innerHTML).not.toMatch(
      /(?:text|bg|border|ring)-(?:red|rose)-\d|#[a-f]?[0-9a-f]{0,2}0000|rgba?\(\s*2[0-5]\d\s*,\s*[0-5]?\d\s*,\s*[0-5]?\d/i,
    );
    // L'ambre porte le signal, badge compris — cadre du badge inclus (demandé le 2026-08-17 :
    // sans bordure, la pastille se fondait dans le fond hachuré du toast).
    expect(container.innerHTML).toMatch(/amber-\d/);
    const badge = screen.getByText(/^En retard$/i);
    expect(badge.className).toMatch(/border-amber-\d/);

    // 🔴 Et le reste du champ lexical du reproche reste banni : « oublié », « manqué », « raté ».
    // Le §7 n'a été entamé QUE sur « en retard ».
    expect(container.textContent).not.toMatch(/oubli|manqu|rat[ée]\b|pas fait|nul|échec/i);
  });

  it("🔴 VERROU GÉOMÉTRIQUE — la dérive du fond n'est JAMAIS parallèle aux rayures", () => {
    // 🔴 **Le défaut que ce verrou existe pour attraper était INVISIBLE À TOUT AUTRE TEST.**
    // La première version animait `background-position: 0 0 → 14px 14px`. La classe était
    // juste, les keyframes existaient, le navigateur déclarait l'animation `running` avec la
    // bonne durée — et **rien ne bougeait, jamais**.
    //
    // Motif : la trame est un `repeating-linear-gradient(45deg, …)`, dont les rayures sont
    // perpendiculaires à l'axe du dégradé. Une translation de (dx, dy) décale la phase de
    // `dx·sin45 − dy·cos45`. Avec dx = dy, ce décalage vaut **exactement zéro** : le motif se
    // superpose à lui-même.
    //
    // Aucune assertion sur le DOM ne pouvait le voir. Seule l'arithmétique le dit — alors on la
    // rejoue ici, sur le CSS réel.
    // ⚠️ `new URL(..., import.meta.url)` échoue sous Vitest (« The URL must be of scheme
    // file ») : le module est servi par Vite, pas depuis le disque. Le `cwd` de la suite est
    // la racine de l'app — c'est le chemin fiable.
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const bloc = /@keyframes agenda-reprendre-derive\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    const arrivee = /background-position:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(bloc);
    expect(arrivee, "keyframes `agenda-reprendre-derive` introuvable").not.toBeNull();

    const [dx, dy] = [Number(arrivee![1]), Number(arrivee![2])];
    const phase = Math.abs(dx * Math.SQRT1_2 - dy * Math.SQRT1_2);
    // 🔴 Une phase nulle = une animation qui ne produit RIEN.
    expect(phase).toBeGreaterThan(1);

    // Et la couture au bouclage reste imperceptible : la phase doit tomber près d'un multiple
    // du pas de la trame (7 px), sans quoi le motif sauterait tous les 12 s.
    const reste = phase % 7;
    expect(Math.min(reste, 7 - reste)).toBeLessThan(1);
  });

  it("🔴 le cadre RESPIRE et le fond DÉRIVE — deux animations, aucune ne clignote", () => {
    const boite = toast({ items: [item({ done: false })] }).container
      .firstElementChild as HTMLElement;
    // Le fond : linéaire, sans temps fort. Le cadre : `ease-in-out`, amplitude faible.
    expect(boite.className).toMatch(/agenda-reprendre-derive_12s_linear_infinite/);
    expect(boite.className).toMatch(/agenda-retard-respire_3s_ease-in-out_infinite/);
    // 🔴 Deux animations qui pulseraient ensemble feraient un stroboscope.
    expect(boite.className).not.toMatch(/pulse|ping|bounce|blink|flash/i);
    expect(boite.className).toMatch(/motion-safe:/);
  });

  it("🔴 les DEUX registres sont nommés — sinon le lecteur les fusionne", () => {
    // La liste des échéances n'avait PAS de titre, alors que le bloc des traces en avait un.
    // L'œil rattachait donc « Ce que tu as travaillé » aux échéances juste au-dessus, et sur un
    // jour portant une échéance non faite le toast semblait se contredire — *« ce que tu as
    // travaillé, non puisque non fait »* (commanditaire, 2026-08-17).
    //
    // Les deux blocs disent des choses différentes et ne coïncident pas : le 11 août, l'école
    // demandait français + SVT, et Massimo a travaillé maths + anglais.
    render(
      <AgendaDayToast
        date={HIER}
        ancre={ANCRE}
        items={[item({ done: false })]}
        traces={[{ slug: "anglais", name: "Anglais", color: "#a78bfa" }]}
      />,
    );
    expect(screen.getByText(/Ce que ZETIS te demandait/i)).toBeInTheDocument();
    expect(screen.getByText(/Travaillé|Ce que tu as travaillé/i)).toBeInTheDocument();
  });

  it("le registre du haut se conjugue au présent sur un jour à venir", () => {
    render(
      <AgendaDayToast
        date={DEMAIN}
        ancre={ANCRE}
        items={[item({ due_on: DEMAIN })]}
        traces={[]}
      />,
    );
    expect(screen.getByText(/Ce que ZETIS te demande$/i)).toBeInTheDocument();
  });

  it("🔴 le fond DÉRIVE, il ne clignote pas — et il se fige sous prefers-reduced-motion", () => {
    // Un fond qui pulse est une ALARME, et l'alarme est le registre refusé au §D14 avec le rouge
    // et le mot « retard ». La dérive est linéaire, continue, sans pic d'intensité.
    const boite = toast({ items: [item({ done: false })] }).container
      .firstElementChild as HTMLElement;

    // `motion-safe:` → l'animation n'existe pas sous `prefers-reduced-motion`.
    expect(boite.className).toMatch(/motion-safe:/);
    // Linéaire et infinie : aucune accélération, aucun rebond, aucun temps fort.
    expect(boite.className).toMatch(/linear_infinite/);
    // 🔴 Aucun vocabulaire de clignotement — c'est la garde qui empêche le glissement.
    expect(boite.className).not.toMatch(/pulse|ping|bounce|blink|flash/i);
    // La trame de fond est AMBRE, comme le cadre — jamais une autre famille.
    expect(boite.style.backgroundImage).toMatch(/251, ?191, ?36/);
  });

  it("un passé ENTIÈREMENT fait ne parle pas de rattrapage", () => {
    const { container } = toast({ items: [item({ done: true })] });
    expect(container.textContent).not.toMatch(/à reprendre/i);
    expect(container.innerHTML).not.toMatch(/amber-\d/);
    // Ni fond animé : un jour soldé n'a rien à signaler.
    expect((container.firstElementChild as HTMLElement).style.backgroundImage).toBe("");
    // « fini » et non « fait le … » : aucune date de complétion, aucun horodatage.
    expect(container.textContent).toMatch(/fini/);
  });

  it("un jour À VENIR non fait ne parle pas de rattrapage — il n'y a rien à rattraper", () => {
    const { container } = toast({
      date: DEMAIN,
      items: [item({ done: false, due_on: DEMAIN })],
    });
    expect(container.textContent).not.toMatch(/à reprendre/i);
  });

  it("🔴 le toast RÉPOND toujours, même sur un jour totalement vide", () => {
    // Il rendait `null` : sur un mois ordinaire, 18 jours sur 31 sont vides, et le survol ne
    // répondait donc rien sur 58 % de la grille — *« les toasts au survol ont disparu »*.
    // Le dépôt avait déjà tranché l'inverse pour le panneau (addendum §17) : un vide CONFIRMÉ
    // est une réponse, un silence n'en est pas une.
    // 🔴 LA MÊME phrase au passé et à venir, et la MÊME que le panneau (§D15) : elle vient
    // d'une constante partagée, seul moyen de tenir « deux surfaces le disent pareil ».
    // ⚠️ Assertions sur le CONTENEUR de chaque rendu, pas sur `screen` : deux rendus dans un
    // même test laissent deux occurrences dans le document, et `getByText` échoue sur le
    // doublon — un faux rouge qui ne dit rien du code.
    expect(toast({ items: [], traces: [] }).container.textContent).toMatch(
      /Rien de prévu ce jour-là/i,
    );
    expect(
      toast({ date: DEMAIN, items: [], traces: [] }).container.textContent,
    ).toMatch(/Rien de prévu ce jour-là/i);
  });

  it("🔴 VERROU §D12 — le toast ne porte AUCUNE mesure", () => {
    const { container } = toast({
      items: [item({ done: true }), item({ id: 2, done: false })],
      traces: [{ slug: "svt", name: "SVT", color: "#34d399" }],
    });
    expect(container.textContent).not.toMatch(/\d+\s*(fois|minute|min\b|XP|%)/i);
    // Ni « 1 sur 2 », ni « 1/2 » : aucun compteur d'avancement.
    expect(container.textContent).not.toMatch(/\d+\s*(sur|\/)\s*\d+/);
  });

  it("🔴 le toast n'intercepte jamais le clic qui ouvre le jour", () => {
    // `pointer-events: none` — sans lui, il s'interposerait sous le curseur et provoquerait un
    // `mouseleave` sur la cellule, donc un clignotement. C'est aussi pourquoi la « porte » du
    // rattrapage NOMME le geste au lieu de le porter.
    const { container } = toast({ items: [item()] });
    expect((container.firstElementChild as HTMLElement).className).toMatch(/pointer-events-none/);
    expect(container.querySelectorAll("button, a")).toHaveLength(0);
  });
});

// ── §D19 — « Un aperçu tient dans la place qu'il a » ────────────────────────────────────────────
//
// 🔴 **Ces trois verrous existent parce que jsdom ne peut PAS les écrire naïvement.**
// jsdom ne met rien en page : `getBoundingClientRect` y rend des zéros. Un test qui se contenterait
// de rendre le toast et de lire `style.top` mesurerait donc une hauteur de 0 — et passerait
// **identiquement sur le code fautif et sur le corrigé**. C'est exactement le piège du test de
// dérive de fond de cette même journée : une classe CSS vérifiée sur une animation qui n'animait
// rien. La hauteur est donc **injectée**, et les chiffres ci-dessous sont ceux mesurés à l'écran le
// 2026-08-17 sur la bande (toast 469 px, fenêtre 856, cellule 328–419, `top` calculé à −149).
describe("AgendaDayToast — placement (§D19)", () => {
  /** Rend le toast en lui imposant une hauteur, jsdom étant incapable d'en produire une. */
  function haut(hauteur: number, ancre: Partial<DOMRect>): HTMLElement {
    const vrai = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.getAttribute?.("role") === "tooltip") {
        return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 250, height: hauteur,
          toJSON: () => ({}) } as DOMRect;
      }
      return vrai.call(this);
    };
    try {
      const { container } = toast({
        ancre: { left: 100, width: 44, height: 60, ...ancre } as DOMRect,
        items: [item()],
      });
      return container.firstElementChild as HTMLElement;
    } finally {
      Element.prototype.getBoundingClientRect = vrai;
    }
  }

  const FENETRE = 856;
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", { value: FENETRE, configurable: true });
  });

  it("🔴 VERROU — un toast trop grand pour la place au-dessus ne sort JAMAIS par le haut", () => {
    // La géométrie EXACTE du défaut : bande à 328 px du haut, toast de 469 px. Le code fautif
    // décidait du côté avec `ancre.top > 220` — un seuil qui SUPPOSAIT la hauteur — et ne
    // rabattait rien ensuite. Résultat mesuré : `top` à **−149**, c'est-à-dire la date et le
    // badge « En retard » hors écran (*« je ne lis pas retard »*).
    const boite = haut(469, { top: 328, bottom: 419 });
    const sommet = parseFloat(boite.style.top);
    expect(sommet).toBeGreaterThanOrEqual(8);
    expect(sommet + 469).toBeLessThanOrEqual(FENETRE);
    // 🔴 Le placement par le BAS a été retiré : `bottom` ne doit pas revenir. Deux propriétés
    // opposées posées ensemble se contrediraient en silence, et c'est `bottom` qui gagnerait.
    expect(boite.style.bottom).toBe("");
  });

  it("le placement AU-DESSUS existe encore quand il y a la place", () => {
    // Sans ce verrou, le correctif se réduirait à « toujours en dessous » — ce qui couvrirait
    // les sections sous la bande à chaque survol.
    const boite = haut(120, { top: 328, bottom: 419 });
    expect(parseFloat(boite.style.top)).toBe(328 - 8 - 120);
  });

  it("un toast plus grand que la fenêtre se coupe par le BAS, jamais par le haut", () => {
    // On perd la fin des traces ; on ne perd jamais le jour dont le toast parle.
    const boite = haut(900, { top: 328, bottom: 419 });
    expect(parseFloat(boite.style.top)).toBe(8);
    expect(boite.style.maxHeight).toBe(`${FENETRE - 16}px`);
  });
});
