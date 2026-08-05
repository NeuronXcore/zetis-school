import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ContentRequest } from "@zetis/types";
import { DemandesPage } from "./DemandesPage";

vi.mock("../lib/contentRequests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/contentRequests")>()),
  fetchContentRequests: vi.fn(),
  setContentRequestStatus: vi.fn(),
}));
import { fetchContentRequests, setContentRequestStatus } from "../lib/contentRequests";

vi.mock("../lib/notionRequests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/notionRequests")>()),
  fetchNotionRequests: vi.fn(),
  resolveNotionRequest: vi.fn(),
}));
import { fetchNotionRequests, resolveNotionRequest } from "../lib/notionRequests";

vi.mock("../lib/production", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/production")>()),
  produceForRequest: vi.fn(),
  fetchProductionRun: vi.fn(),
}));
import { fetchProductionRun, produceForRequest } from "../lib/production";

// La modale charge l'année active/les chapitres — stubée (elle n'est pas le sujet de ces tests).
// ⚠️ Elle expose quand même `onDone` : c'est par là que remonte le verdict serveur `needs_lesson`,
// et une modale stubée muette rendrait ce chemin intestable.
vi.mock("../components/demandes/NotionRequestActionModal", () => ({
  NotionRequestActionModal: (p: {
    mode: string;
    onDone: (r?: { needsLesson: boolean; label: string }) => void;
  }) => (
    <div data-testid="notion-modal" data-mode={p.mode}>
      <button type="button" onClick={() => p.onDone({ needsLesson: true, label: "Thalès" })}>
        stub-done-orpheline
      </button>
      <button type="button" onClick={() => p.onDone({ needsLesson: false, label: "Thalès" })}>
        stub-done-rattachee
      </button>
    </div>
  ),
}));

const REQ: ContentRequest = {
  id: 5,
  skill_id: 116,
  skill_name: "Figure de style",
  subject_id: 1,
  subject_name: "Français",
  content_kind: "fiche",
  status: "pending",
  source: "chat_orchestrator",
  created_at: "2026-07-30T10:00:00Z",
  producible: true,
  blocked_reason: null,
  active_run: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DemandesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(setContentRequestStatus).mockResolvedValue(REQ);
  vi.mocked(fetchNotionRequests).mockResolvedValue([]);
  vi.mocked(resolveNotionRequest).mockResolvedValue({} as never);
});

describe("DemandesPage", () => {
  it("groupe par matière et affiche notion + type", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([REQ]);
    renderPage();
    expect(await screen.findByText("Figure de style")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Français" })).toBeTruthy();
    expect(screen.getByText(/🗒️ Fiche/)).toBeTruthy();
    // Lien vers la Couverture filtrée sur la matière (produire là-bas, pas ici).
    const link = screen.getByRole("link", { name: /Produire dans la Couverture/ });
    expect(link.getAttribute("href")).toBe("/couverture?subject=1");
  });

  it("« Fait » trie via le module content_requests et retire la ligne", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([REQ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Fait" }));
    expect(setContentRequestStatus).toHaveBeenCalledWith(5, "done");
    await waitFor(() => expect(screen.getByText(/Aucune demande en attente/)).toBeTruthy());
  });

  it("🔒 relit la file quand Papa REVIENT sur l'onglet", async () => {
    // Le parcours que cette page crée elle-même : « Écrire le cours → » envoie Papa sur Programme,
    // il écrit le cours, il revient. Sans cette relecture il retrouvait la MÊME ligne, comme si
    // son geste n'avait servi à rien — alors que le serveur, lui, a déjà refermé la demande.
    vi.mocked(fetchContentRequests).mockResolvedValueOnce([REQ]).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText("Figure de style")).toBeTruthy();

    fireEvent(window, new Event("focus"));

    await waitFor(() => expect(screen.getByText(/Aucune demande en attente/)).toBeTruthy());
  });

  it("état vide quand aucune demande", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Aucune demande en attente/)).toBeTruthy();
  });

  it("section hors-programme : « Créer la leçon » ouvre la modale, « Ignorer » écarte", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    vi.mocked(fetchNotionRequests).mockResolvedValue([
      { id: 9, text: "le verbe être en espagnol", status: "pending", subject_id: null, created_at: "x" },
    ]);
    renderPage();
    expect(await screen.findByText(/le verbe être en espagnol/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /À ajouter au programme/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Créer la leçon" }));
    expect(screen.getByTestId("notion-modal").getAttribute("data-mode")).toBe("lesson");
  });

  it("« Ignorer » une notion hors-programme appelle resolveNotionRequest(dismissed)", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    vi.mocked(fetchNotionRequests).mockResolvedValue([
      { id: 9, text: "pythagore", status: "pending", subject_id: null, created_at: "x" },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Ignorer" }));
    expect(resolveNotionRequest).toHaveBeenCalledWith(9, "dismissed");
  });


  // --- « + Programme » dit ce qu'il ne fait pas (constat du 2026-08-03) -----------------------

  it("signale une notion ajoutée que ZETIS ne pourra pas produire", async () => {
    // ⚠️ « + Programme » crée une notion ORPHELINE : aucune leçon ne la porte, donc
    // `equip_notion` renvoie `has_lesson=false` et rien ne sera JAMAIS généré pour elle. Le
    // bouton, lui, se lit « traité ». Le constat vient du serveur (`needs_lesson`), pas d'une
    // déduction du front.
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    vi.mocked(fetchNotionRequests).mockResolvedValue([
      { id: 9, text: "Thalès", status: "pending", subject_id: null, created_at: "x" },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "+ Programme" }));
    fireEvent.click(screen.getByRole("button", { name: "stub-done-orpheline" }));

    expect(await screen.findByText(/ZETIS ne produira rien pour elle/)).toBeInTheDocument();
    // Le geste qui répare est à côté du constat — sinon il désigne un problème sans issue.
    expect(screen.getByRole("link", { name: /rattacher dans le Programme/ })).toHaveAttribute(
      "href",
      "/programme",
    );
  });

  // --- « Produire » et le refus DIT de la capsule (ADR-0036 §3 et §6) -------------------------

  it("« Produire » affiche l'avancement et NE retire PAS la ligne", async () => {
    // ⚠️ Le cœur du test est la dernière assertion. Retirer la ligne rejouerait exactement le
    // mensonge que le §4 tue : rien n'est fermé tant que le contenu n'est pas SERVABLE, et le
    // worker n'a même pas commencé. La demande disparaîtra d'elle-même, plus tard, sur un fait.
    //
    // ⚠️ Le libellé doit dire l'ATTENTE, pas la génération : un lot part en file (concurrence 1,
    // un seul GPU) et ZETIS ne génère encore RIEN. La barre montre la vie, le libellé dit la
    // vérité — c'est cette distinction que le test tient.
    //
    // ⚠️ **Assertions sur le SENS, plus sur la chaîne exacte** (2026-08-05). Le texte était recopié
    // ici (« En file d'attente… ») alors qu'il a désormais une source unique — `EN_FILE_LABEL` —
    // et une variante (`ARRETE_LABEL`) quand aucun worker n'écoute. Un verrou sur la chaîne aurait
    // interdit la variante sans rien protéger de plus : ce qui compte est qu'on ne dise jamais
    // « génération » d'un lot qui n'a pas commencé, et c'est ce que la deuxième assertion tient.
    vi.mocked(fetchContentRequests).mockResolvedValue([REQ]);
    vi.mocked(produceForRequest).mockResolvedValue({ id: 99, status: "queued", scope_kind: "fiche" } as never);
    vi.mocked(fetchProductionRun).mockResolvedValue({ id: 99, status: "queued" } as never);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Produire" }));
    expect(produceForRequest).toHaveBeenCalledWith(5);

    expect(await screen.findByText(/en file d'attente/i)).toBeTruthy();
    expect(screen.queryByText(/génération/i)).toBeNull();
    // ⚠️ **Aucun pourcentage sur un lot qui n'a pas démarré.** C'est LE défaut du 2026-08-05 :
    // `pct ?? 0` refabriquait le chiffre que `useRunProgress` refuse de donner, et quatre lots
    // arrêtés ont affiché « 0 % » six heures durant sous un libellé pourtant honnête. Papa lit la
    // case du pourcentage avant le libellé.
    expect(screen.queryByText(/\d+\s*%/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Produire" })).toBeNull();
    expect(screen.getByText("Figure de style")).toBeTruthy();
    expect(screen.queryByText(/Aucune demande en attente/)).toBeNull();
  });

  it("retrouve un lot en cours au RETOUR sur la page, sans l'avoir mémorisé", async () => {
    // ⚠️ Le cœur du chantier du 2026-08-05. La page gardait les lots lancés dans son propre état :
    // la quitter effaçait la barre et rendait le bouton « Produire », comme si rien n'avait été
    // lancé. Papa recliquait — quatre lots identiques sur la même notion en une matinée.
    //
    // Ici, RIEN n'a été cliqué : le composant est monté à froid, exactement comme au retour d'une
    // navigation. Le lot vient du serveur (`active_run`), et c'est la seule raison pour laquelle
    // la barre est là. Un état de page ne pourrait pas produire ce rendu.
    // ⚠️ Le fichier ne remet pas les mocks à zéro entre les cas : sans ce nettoyage, l'assertion
    // « personne n'a cliqué » compterait l'appel du test précédent et échouerait pour une raison
    // qui n'a rien à voir avec ce qu'elle vérifie.
    vi.mocked(produceForRequest).mockClear();
    vi.mocked(fetchContentRequests).mockResolvedValue([
      {
        ...REQ,
        active_run: {
          id: 99,
          status: "running",
          trigger: "manual",
          authorized_by: "parent_direct",
          chapter_id: null,
          scope_skill_id: 116,
          scope_kind: "fiche",
          scope_skill_name: "Figure de style",
          total_notions: 1,
          done_notions: 0,
          progress_pct: 0,
          created_at: "2026-08-05T09:00:00Z",
          started_at: new Date(Date.now() - 8000).toISOString(),
          finished_at: null,
        },
      },
    ]);
    vi.mocked(fetchProductionRun).mockResolvedValue({ id: 99, status: "running" } as never);
    renderPage();

    // Pas de bouton « Produire » : une production tourne déjà, le relancer ne produirait rien.
    expect(await screen.findByText("Figure de style")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Produire" })).toBeNull();
    expect(produceForRequest).not.toHaveBeenCalled();

    // ⚠️ Et l'avancement REPREND : le lot a démarré il y a 8 s, l'estimation est ancrée sur
    // `started_at`, pas sur le montage du composant. Un pourcentage à 1 % signifierait qu'elle
    // repart de zéro — le défaut exact que Papa a signalé (« revenir remet tout à zéro »).
    const pct = await screen.findByText(/^\d+%$/);
    expect(Number(pct.textContent!.replace("%", ""))).toBeGreaterThan(10);
  });

  it("la fin du lot relit la file — la ligne s'en va sur un FAIT, pas sur le clic", async () => {
    // Le serveur a refermé la demande (§4) : le rechargement la trouve absente. C'est la seule
    // façon dont la ligne a le droit de disparaître.
    vi.mocked(fetchContentRequests).mockResolvedValueOnce([REQ]).mockResolvedValue([]);
    vi.mocked(produceForRequest).mockResolvedValue({ id: 99, status: "queued", scope_kind: "fiche" } as never);
    vi.mocked(fetchProductionRun).mockResolvedValue({ id: 99, status: "done" } as never);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Produire" }));
    await waitFor(() => expect(screen.getByText(/Aucune demande en attente/)).toBeTruthy(), {
      timeout: 4000,
    });
  });

  it("🔒 une demande que le palier BLOQUE n'offre pas « Produire » — elle dit pourquoi", async () => {
    // Le cul-de-sac du 2026-08-04 : « Accord du COD — 📖 Cours » en régime Manuel. Le bouton était
    // offert, les deux lots ont fini `done` en produisant zéro, et Papa ne l'a appris qu'au
    // Journal. ⚠️ `producible` reste `true` : c'est bien le TYPE qui est productible et la
    // SITUATION qui ne l'est pas — si ce test passait avec `producible: false`, il ne prouverait
    // que l'ancien verdict.
    vi.mocked(fetchContentRequests).mockResolvedValue([
      {
        ...REQ,
        content_kind: "cours",
        producible: true,
        blocked_reason: "Cours à écrire — dans le réglage actuel, c'est vous qui rédigez les cours.",
      },
    ]);
    renderPage();

    expect(await screen.findByText(/Cours à écrire/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Produire" })).toBeNull();
    // Le geste qui répare, à côté du constat.
    expect(screen.getByRole("link", { name: /Écrire le cours/ })).toHaveAttribute(
      "href",
      "/programme?subject=1",
    );
    // ⚠️ Le triage reste offert : Papa doit pouvoir clore une demande qu'il ne servira pas.
    expect(screen.getByRole("button", { name: "Fait" })).toBeTruthy();
  });

  it("sans motif de blocage, le bouton est bien là", async () => {
    // La contre-épreuve : si l'écran retirait « Produire » dans les deux cas, le verrou serait
    // vert pour la mauvaise raison.
    vi.mocked(fetchContentRequests).mockResolvedValue([
      { ...REQ, content_kind: "cours", producible: true, blocked_reason: null },
    ]);
    renderPage();

    expect(await screen.findByRole("button", { name: "Produire" })).toBeTruthy();
  });

  it("une capsule n'offre pas « Produire » — elle dit où l'écrire", async () => {
    // ⚠️ `producible` vient du SERVEUR : le front ne déduit pas la liste des générateurs du type.
    // Et c'est un CONSTAT avec son geste à côté, pas un bouton grisé qui désigne un cul-de-sac.
    vi.mocked(fetchContentRequests).mockResolvedValue([
      { ...REQ, content_kind: "capsule", producible: false },
    ]);
    renderPage();

    expect(await screen.findByText("Figure de style")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Produire" })).toBeNull();
    expect(screen.getByRole("link", { name: /À écrire toi-même/ })).toHaveAttribute(
      "href",
      "/capsules",
    );
  });

  it("un lancement en échec le dit et réarme le bouton", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([REQ]);
    vi.mocked(produceForRequest).mockRejectedValue(new Error("Ollama est éteint"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Produire" }));
    expect(await screen.findByText("Ollama est éteint")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Produire" })).not.toBeDisabled();
  });

  it("ne crie pas au loup quand une leçon porte déjà la notion", async () => {
    // Un avertissement systématique s'apprend à s'ignorer. Le serveur calcule, le front obéit.
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    vi.mocked(fetchNotionRequests).mockResolvedValue([
      { id: 9, text: "Thalès", status: "pending", subject_id: null, created_at: "x" },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "+ Programme" }));
    fireEvent.click(screen.getByRole("button", { name: "stub-done-rattachee" }));

    await waitFor(() => expect(screen.queryByTestId("notion-modal")).toBeNull());
    expect(screen.queryByText(/ZETIS ne produira rien/)).toBeNull();
  });
});
