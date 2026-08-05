import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { DashboardPayload } from "@zetis/types";

vi.mock("../lib/dashboard", () => ({ fetchDashboard: vi.fn() }));
import { fetchDashboard } from "../lib/dashboard";

import { useDashboard } from "./useDashboard";

// État de lecture du dashboard, porté par l'URL (`?period=&subject=&focus=`).
//
// Ce fichier garde UNE propriété, et elle est mécanique : **un patch FUSIONNE dans l'URL courante
// au lieu de la remplacer**. C'est ce qui permettra au panneau d'analyse d'écrire `subject` et
// `panel` ensemble (`adr-0028-addendum-analyse-par-matiere` §3), en UN seul appel.
//
// 🔴 Ce que ces tests NE peuvent PAS garder, et qu'il faut savoir avant d'écrire la slice C :
// **deux appels successifs à `patchParams` dans le même tick en perdent toujours un.** Ce n'est
// pas un défaut du hook et rien dans ce fichier ne le corrigera — `setSearchParams` de
// `react-router` (7.18.1, vérifié dans la source) n'est pas un setter React mais un enrobage de
// `navigate()`, et il sert à sa forme fonctionnelle le `location.search` du **rendu courant**,
// jamais une valeur en attente. Les deux appels partent donc du même instantané, et le second
// gagne.
//
// D'où la règle, écrite dans le hook : **un geste = un appel**. Le correctif de cette slice est la
// signature par LOT ; la forme fonctionnelle n'y ajoute rien aujourd'hui.

const PAYLOAD = {
  school_year: null,
  generated_at: "2026-08-05T08:00:00+02:00",
  last_activity_at: null,
  days_inactive: 0,
  inbox: [],
  unattributed_minutes: { "7": 0, "30": 0, "90": 0, "365": 0 },
  periods: {},
  subjects: [],
  content_chain: [],
  reading: [],
  proposed_mission: null,
} as unknown as DashboardPayload;

function wrapper(entries: string[], index: number) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: entries, initialIndex: index }, children);
}

/** Le hook, l'URL courante ET le navigateur, observés dans le MÊME composant.
 *
 *  ⚠️ `useNavigate` et non `window.history` : `MemoryRouter` tient son PROPRE historique, en
 *  mémoire. Un `window.history.back()` ne le touche pas — il ne lève aucune erreur et ne fait
 *  rien, ce qui rendait le verrou du `replace` vert quoi qu'il arrive. */
function renderDashboard(initial = "/", before?: string) {
  const entries = before ? [before, initial] : [initial];
  return renderHook(
    () => ({
      dash: useDashboard(),
      search: useLocation().search,
      path: useLocation().pathname,
      navigate: useNavigate(),
    }),
    { wrapper: wrapper(entries, entries.length - 1) },
  );
}

beforeEach(() => {
  vi.mocked(fetchDashboard).mockResolvedValue(PAYLOAD);
});

// ⚠️ Sans ce nettoyage, le compteur d'appels s'ACCUMULE d'un test à l'autre et le verrou
// « aucune requête sur un geste de filtrage » échoue pour une raison qui n'a rien à voir avec lui.
afterEach(() => {
  vi.clearAllMocks();
});

describe("useDashboard — l'URL est le miroir de l'état de lecture", () => {
  it("PRÉSERVE les autres clés quand un geste n'en touche qu'une", async () => {
    // LE test de cette slice. Le patch FUSIONNE dans l'URL courante au lieu de la remplacer —
    // c'est la propriété dont dépend l'écriture conjointe de `subject` + `panel` en slice C.
    const { result } = renderDashboard("/?period=90&focus=consolidated");
    await waitFor(() => expect(result.current.dash.loading).toBe(false));

    act(() => result.current.dash.toggleSubject("maths"));

    const params = new URLSearchParams(result.current.search);
    expect(params.get("subject")).toBe("maths");
    expect(params.get("period")).toBe("90");
    expect(params.get("focus")).toBe("consolidated");
  });

  it("garde le geste de filtrage HORS du réseau", async () => {
    // L'invariant qui fonde toute la page (ADR-0028 §1) : changer de période ou de focus est une
    // projection sur un payload déjà en mémoire, jamais un aller-retour.
    const { result } = renderDashboard();
    await waitFor(() => expect(result.current.dash.loading).toBe(false));
    expect(fetchDashboard).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.dash.setPeriod("365");
      result.current.dash.toggleFocus("open_gaps");
      result.current.dash.toggleSubject("maths");
    });

    expect(fetchDashboard).toHaveBeenCalledTimes(1);
  });

  it("supprime la clé plutôt que de l'écrire vide quand un bascule se relâche", async () => {
    const { result } = renderDashboard("/?focus=consolidated");
    await waitFor(() => expect(result.current.dash.loading).toBe(false));
    expect(result.current.dash.focus).toBe("consolidated");

    act(() => result.current.dash.toggleFocus("consolidated"));

    // `null` doit DÉLIER la clé : un `?focus=` vide traînerait dans une URL partagée et se lirait
    // comme un focus actif au prochain chargement.
    expect(new URLSearchParams(result.current.search).has("focus")).toBe(false);
    expect(result.current.dash.focus).toBeNull();
  });

  it("remplace l'entrée d'historique au lieu d'en empiler une par clic", async () => {
    // « Filtrer n'est pas naviguer » : sans `replace`, le retour arrière déferait un à un chaque
    // clic de chip au lieu de quitter le dashboard. On arrive donc D'AILLEURS, on filtre deux
    // fois, et un seul retour doit ramener là d'où l'on vient.
    const { result } = renderDashboard("/", "/ailleurs");
    await waitFor(() => expect(result.current.dash.loading).toBe(false));

    act(() => result.current.dash.setPeriod("30"));
    act(() => result.current.dash.setPeriod("90"));
    act(() => result.current.navigate(-1));

    expect(result.current.path).toBe("/ailleurs");
  });

  it("🔴 FILTRER referme le panneau — même en partant panneau OUVERT", async () => {
    // LE verrou de la slice C, et il n'a de valeur QUE dans cette variante. En partant de « / »,
    // aucun `panel` n'est dans l'URL : retirer `panel: null` de `toggleSubject` ne change alors
    // rien et le test reste vert. Il faut partir panneau OUVERT pour que l'oubli se voie.
    //
    // Ce que ça protège : sans cette ligne, un clic de pastille ROUVRIRAIT le panneau, donc un
    // geste de filtrage partirait au réseau — l'invariant du §1 cesserait d'être une propriété du
    // code pour devenir une coïncidence d'ordre des clics.
    const { result } = renderDashboard("/?subject=maths&panel=ou-agir");
    await waitFor(() => expect(result.current.dash.loading).toBe(false));

    act(() => result.current.dash.toggleSubject("svt"));

    const params = new URLSearchParams(result.current.search);
    expect(params.get("subject")).toBe("svt");
    expect(params.has("panel")).toBe(false);
  });

  it("ANALYSER écrit la matière ET le panneau, en un seul geste", async () => {
    const { result } = renderDashboard();
    await waitFor(() => expect(result.current.dash.loading).toBe(false));

    act(() => result.current.dash.analyseSubject("maths"));

    const params = new URLSearchParams(result.current.search);
    expect(params.get("subject")).toBe("maths");
    expect(params.get("panel")).toBe("ou-agir");
  });

  it("referme le panneau SANS désélectionner la matière", async () => {
    const { result } = renderDashboard("/?subject=maths&panel=ou-agir");
    await waitFor(() => expect(result.current.dash.loading).toBe(false));

    act(() => result.current.dash.closePanel());

    const params = new URLSearchParams(result.current.search);
    expect(params.get("subject")).toBe("maths");
    expect(params.has("panel")).toBe(false);
  });

  it("n'ouvre PAS le panneau sur une matière inconnue", async () => {
    // Lien périmé (matière supprimée) : le panneau doit rester fermé plutôt que de s'ouvrir vide.
    // Même repli que `visibleSubjects`, qui retombe sur « toutes » au lieu de vider la page.
    const { result } = renderDashboard("/?subject=matiere-supprimee&panel=ou-agir");
    await waitFor(() => expect(result.current.dash.loading).toBe(false));

    expect(result.current.dash.panelSubject).toBeNull();
  });

  it("retombe sur la période par défaut pour une valeur d'URL inconnue", async () => {
    const { result } = renderDashboard("/?period=banane");
    await waitFor(() => expect(result.current.dash.loading).toBe(false));

    expect(result.current.dash.period).toBe("7");
  });
});
