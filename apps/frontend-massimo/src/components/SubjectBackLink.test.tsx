import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SubjectBackLink, prettifySlug } from "./SubjectBackLink";

/** Monte la brique sous une vraie route, pour que `useParams` ait de quoi travailler. */
function renderAt(path: string, routePattern: string, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePattern} element={<SubjectBackLink {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SubjectBackLink — la destination vient de l'URL, jamais d'une pile", () => {
  it("sur /fiches/:slug, le lien pointe la MATIÈRE (et non le deck)", () => {
    // Le retour visait `/fiches` avant ce chantier : Massimo arrivait de sa matière et
    // remontait vers un deck qu'il n'avait pas traversé.
    renderAt("/fiches/svt", "/fiches/:slug");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/subjects/svt");
  });

  it("sur /mindmaps/:slug aussi", () => {
    renderAt("/mindmaps/histoire-geo", "/mindmaps/:slug");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/subjects/histoire-geo");
  });

  it("sur /subjects/:slug/cours aussi", () => {
    renderAt("/subjects/svt/cours", "/subjects/:slug/cours");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/subjects/svt");
  });

  it("sur une surface SANS slug dans le chemin, `?from=` prend le relais", () => {
    // C'est le cas d'ELI5 et de Révision : leur URL ne porte pas la matière.
    renderAt("/eli5?from=svt", "/eli5");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/subjects/svt");
  });

  it("la prop `slug` l'emporte — le deep-link mindmap n'a NI slug d'URL NI `?from=`", () => {
    // `/mindmaps/reconstruire/:id` : la matière vient de la carte résolue CÔTÉ SERVEUR. C'est
    // une donnée, pas un état de navigation — elle survit donc au rechargement.
    renderAt("/mindmaps/reconstruire/44", "/mindmaps/reconstruire/:mindmapId", { slug: "svt" });
    expect(screen.getByRole("link").getAttribute("href")).toBe("/subjects/svt");
  });

  it("sans aucune source de matière, RIEN n'est rendu", () => {
    // Arrivée directe par la sidebar : on n'invente pas un retour vers une page jamais visitée.
    const { container } = renderAt("/revision", "/revision");
    expect(container.querySelector("a")).toBeNull();
  });

  it("affiche le vrai nom quand la page hôte le connaît", () => {
    // `prettifySlug("svt")` rendrait « Svt » : le nom réel vaut mieux dès qu'on l'a.
    renderAt("/fiches/svt", "/fiches/:slug", { name: "SVT" });
    expect(screen.getByRole("link").textContent).toContain("SVT");
  });

  it("un slug exotique est encodé dans l'URL", () => {
    renderAt("/eli5?from=histoire%20g%C3%A9o", "/eli5");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/subjects/histoire%20g%C3%A9o");
  });

  it("ne lit AUCUN location.state (robuste au refresh et au partage d'URL)", () => {
    // Un état de navigation aurait disparu au rechargement, au partage du lien et au retour
    // physique iPhone — les trois situations où Massimo en a le plus besoin.
    render(
      <MemoryRouter initialEntries={[{ pathname: "/revision", state: { slug: "svt" } }]}>
        <Routes>
          <Route path="/revision" element={<SubjectBackLink />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("prettifySlug", () => {
  it("remplace les tirets et capitalise", () => {
    expect(prettifySlug("histoire-geo")).toBe("Histoire geo");
  });
});
