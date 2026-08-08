import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DiagnosticPage } from "./DiagnosticPage";
import type { DiagnosticListItem, DiagnosticQuiz, DiagnosticResult } from "../lib/diagnostic";

vi.mock("../lib/diagnostic", () => ({
  fetchDiagnostics: vi.fn(),
  fetchDiagnosticQuiz: vi.fn(),
  submitDiagnostic: vi.fn(),
  fetchMonResultat: vi.fn(),
}));
import { fetchDiagnostics, fetchDiagnosticQuiz, submitDiagnostic } from "../lib/diagnostic";

const LISTE: DiagnosticListItem[] = [
  {
    quiz_id: 7,
    title: "Diagnostic — Français",
    subject: "Français",
    subject_slug: "francais",
    questions_count: 2,
    taken_at: null,
    last_attempt_id: null,
    measured_at: null,
  },
];

const QUIZ: DiagnosticQuiz = {
  quiz_id: 7,
  title: "Diagnostic — Français",
  subject: "Français",
  questions: [
    { id: 1, prompt: "Q1 ?", choices: ["A", "B"], skill_id: 3, skill_name: "Temps du récit" },
  ],
};

const RESULTAT: DiagnosticResult = {
  attempt_id: 42,
  quiz_id: 7,
  subject: "Français",
  completed_at: "2026-07-05T10:00:00+00:00",
  strengths: ["Temps du récit"],
  gaps: [{ skill_id: 9, skill_name: "Accord du participe passé" }],
};

/** La page porte un `<Link>` vers `/missions` : sans contexte Router, l'écran de résultat lève. */
function afficher() {
  return render(
    <MemoryRouter>
      <DiagnosticPage />
    </MemoryRouter>,
  );
}

async function allerJusquAuResultat() {
  afficher();
  // Depuis l'ADR-0044, le diagnostic jamais mesuré est la PROPOSITION de la zone A : on le lance
  // par son bouton, plus en cliquant une ligne de liste — la liste plate n'existe plus.
  fireEvent.click(await screen.findByRole("button", { name: /Commencer/ }));
  fireEvent.click(await screen.findByLabelText("A", { exact: false }));
  fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));
  await screen.findByText(/C'est noté/);
}

describe("DiagnosticPage — l'écran de résultat", () => {
  beforeEach(() => {
    vi.mocked(fetchDiagnostics).mockResolvedValue(LISTE);
    vi.mocked(fetchDiagnosticQuiz).mockResolvedValue(QUIZ);
    vi.mocked(submitDiagnostic).mockResolvedValue(RESULTAT);
  });

  /** 🔴 LE VERROU LEXICAL de l'ADR-0044 Décision 5.
   *
   * ⚠️ **Ce qu'il NE PEUT PAS voir, et il faut le savoir en le lisant** : il balaie le TEXTE
   * rendu. Un pourcentage affiché autrement qu'en clair — dans une image, une largeur de barre,
   * un `aria-label`, un attribut `title` — lui échapperait. Il est le second d'une PAIRE : son
   * jumeau comportemental (`test_diagnostic_resultat_eleve.py`) garantit que le nombre n'arrive
   * même pas du serveur, ce qui rend l'affichage impossible quelle que soit sa forme.
   */
  it("n'affiche AUCUN pourcentage — ce que la spec prescrit depuis l'étape 14", async () => {
    await allerJusquAuResultat();

    expect(document.body.textContent).not.toMatch(/\d\s*%/);
    expect(screen.queryByText(/Score/i)).toBeNull();
    expect(screen.queryByText(/note/i)?.textContent).not.toMatch(/\d/);
  });

  it("montre les forces et les prochaines étapes — l'anti-test-à-vide du verrou", async () => {
    // Sans ces deux assertions, un écran de résultat VIDE passerait le verrou ci-dessus.
    await allerJusquAuResultat();

    expect(screen.getByText("Temps du récit")).toBeTruthy();
    expect(screen.getByText(/Accord du participe passé/)).toBeTruthy();
  });

  it("🔴 ne propose QU'UN SEUL diagnostic en tête, quel qu'en soit le nombre servi", async () => {
    // Le verrou de la Décision 1. Décor non dégénéré : cinq diagnostics à passer, dans TROIS
    // matières — avec un seul, « il n'y en a qu'un en tête » serait vrai par accident.
    vi.mocked(fetchDiagnostics).mockResolvedValue([
      { ...LISTE[0], quiz_id: 1, measured_at: null },
      { ...LISTE[0], quiz_id: 2, measured_at: "2026-03-15T10:00:00Z" },
      { ...LISTE[0], quiz_id: 3, subject_slug: "svt", subject: "SVT", measured_at: null },
      { ...LISTE[0], quiz_id: 4, subject_slug: "svt", subject: "SVT", measured_at: null },
      { ...LISTE[0], quiz_id: 5, subject_slug: "anglais", subject: "Anglais", measured_at: null },
    ]);
    afficher();

    await waitFor(() => expect(screen.getByText(/Si tu préfères autre chose/)).toBeTruthy());
    // Un seul « Commencer → » visible : les autres sont repliés dans leurs matières.
    expect(screen.getAllByRole("button", { name: /Commencer/ })).toHaveLength(1);
    // Et la sortie existe — sans elle, la proposition serait un ordre.
    expect(screen.getByText(/Je préfère autre chose/)).toBeTruthy();
  });

  it("🔴 sépare le FAIT du À-FAIRE — zone C sans non-passé, zone B sans passé", async () => {
    // Le verrou de la Décision 3, et la correction littérale du défaut nommé par la relecture :
    // `taken` ne changeait qu'un mot dans une liste plate.
    vi.mocked(fetchDiagnostics).mockResolvedValue([
      { ...LISTE[0], quiz_id: 1, title: "À passer" },
      { ...LISTE[0], quiz_id: 2, title: "À passer aussi", subject_slug: "svt", subject: "SVT" },
      {
        ...LISTE[0],
        quiz_id: 3,
        title: "Déjà passé",
        taken_at: "2026-07-12T09:00:00Z",
        last_attempt_id: 7,
      },
    ]);
    afficher();

    const zoneC = await screen.findByText(/Déjà mesuré avec toi/);
    const bloc = zoneC.parentElement?.textContent ?? "";
    expect(bloc).toContain("Déjà passé");
    expect(bloc).toContain("tu l'as passé le");
    // Aucun non-passé ne s'est glissé dans la zone C, et le passé n'apparaît pas comme à faire.
    expect(screen.queryByText("Déjà passé")?.closest("section")).toBeNull();
    expect(screen.getByText(/1 diagnostic$/)).toBeTruthy(); // la zone B ne compte QUE le non-passé
  });

  it("« tout est à jour » et « rien encore » sont deux vides DIFFÉRENTS", async () => {
    vi.mocked(fetchDiagnostics).mockResolvedValue([
      { ...LISTE[0], taken_at: "2026-07-12T09:00:00Z", last_attempt_id: 7 },
    ]);
    const { unmount } = afficher();
    await waitFor(() => expect(screen.getByText(/Tout est à jour/)).toBeTruthy());
    expect(screen.queryByText(/Si tu préfères autre chose/)).toBeNull();
    unmount();

    // L'autre vide NOMME Papa — sans ça, Massimo est devant un cul-de-sac sans acteur.
    vi.mocked(fetchDiagnostics).mockResolvedValue([]);
    afficher();
    await waitFor(() => expect(screen.getByText(/Rien à mesurer pour l'instant/)).toBeTruthy());
    expect(screen.getByText(/Papa prépare les diagnostics/)).toBeTruthy();
  });

  it("🔴 le choix de Massimo REMONTE dans la carte, et la carte CHANGE DE REGISTRE", async () => {
    // Le garde-fou du « petit mensonge » : la phrase de recommandation dit pourquoi ZETIS
    // conseille CELUI-LÀ. La servir sur un diagnostic que Massimo a pris de lui-même ferait
    // revendiquer à ZETIS un conseil qu'il n'a pas donné.
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(fetchDiagnostics).mockResolvedValue([
      { ...LISTE[0], quiz_id: 1, title: "Proposé par ZETIS", measured_at: null },
      {
        ...LISTE[0],
        quiz_id: 2,
        title: "Choisi par Massimo",
        subject: "SVT",
        subject_slug: "svt",
        measured_at: "2026-03-15T10:00:00Z",
      },
    ]);
    afficher();

    // 1. Au départ : ZETIS propose, avec sa phrase de recommandation.
    await waitFor(() => expect(screen.getByText(/ZETIS te propose/i)).toBeTruthy());
    expect(screen.getByText(/C'est celle où il en apprendra le plus sur toi/)).toBeTruthy();

    // 2. Massimo déplie sa matière et choisit.
    fireEvent.click(screen.getByRole("button", { name: /SVT/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Choisir/ }));

    // 3. La carte porte son choix, sous un AUTRE registre.
    await waitFor(() => expect(screen.getByText(/Ton choix/i)).toBeTruthy());
    expect(screen.queryByText(/ZETIS te propose/i)).toBeNull();
    expect(screen.getByText("Dernière mesure : il y a un moment.")).toBeTruthy();
    // 🔴 Aucune phrase de recommandation sur un diagnostic que ZETIS n'a pas recommandé.
    expect(screen.queryByText(/il en apprendra le plus sur toi/)).toBeNull();
    expect(screen.queryByText(/commence à dater/)).toBeNull();

    // 4. La proposition de ZETIS est retournée en zone B — la carte n'en porte jamais deux.
    //    (`LISTE[0]` est en Français ; le choix est en SVT.)
    expect(screen.getByRole("button", { name: /Français/ })).toBeTruthy();

    // 5. Le chemin est réversible.
    fireEvent.click(screen.getByRole("button", { name: /Revenir à ce que ZETIS propose/ }));
    await waitFor(() => expect(screen.getByText(/ZETIS te propose/i)).toBeTruthy());
    expect(screen.getByText(/C'est celle où il en apprendra le plus sur toi/)).toBeTruthy();
  });

  it("écrit « 1er juillet », pas « 1 juillet » — défaut vu à l'écran", async () => {
    // `toLocaleDateString("fr-FR")` rend « 1 juillet ». Aucun test ne l'aurait signalé : c'est la
    // relecture visuelle du 2026-08-08 qui l'a attrapé, sur une vraie passation du 1er juillet.
    vi.mocked(fetchDiagnostics).mockResolvedValue([
      { ...LISTE[0], taken_at: "2026-07-01T09:00:00Z", last_attempt_id: 7 },
      { ...LISTE[0], quiz_id: 9, taken_at: "2026-07-12T09:00:00Z", last_attempt_id: 8 },
    ]);
    afficher();

    await waitFor(() => expect(screen.getByText(/1er juillet/)).toBeTruthy());
    // Et le cas ordinaire ne gagne pas de suffixe au passage.
    expect(screen.getByText(/· tu l'as passé le 12 juillet$/)).toBeTruthy();
  });

  it("garde « Refaire ↻ » pour un diagnostic déjà passé, « Commencer → » sinon", async () => {
    // Le seul changement visible de la Session A : le libellé se décide sur `taken_at`, plus
    // sur un booléen `taken`. Aucun test ne couvrait cette page — c'était une dette ouverte.
    vi.mocked(fetchDiagnostics).mockResolvedValue([
      LISTE[0],
      { ...LISTE[0], quiz_id: 8, title: "Diagnostic — Maths", taken_at: "2026-07-01T09:00:00Z" },
    ]);
    afficher();

    await waitFor(() => expect(screen.getByText("Commencer →")).toBeTruthy());
    expect(screen.getByText("Refaire ↻")).toBeTruthy();
  });
});
