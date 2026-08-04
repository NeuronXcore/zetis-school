import { Fragment, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { PAPA_NAV } from "../lib/navigation";
import { MISSIONS_PENDING_EVENT, fetchPilotSummary } from "../lib/missionsPilotage";
import { fetchContentRequestsCount } from "../lib/contentRequests";
import { fetchNotionRequestsCount } from "../lib/notionRequests";
import { DEMANDES_CHANGED_EVENT } from "../lib/demandesEvents";
import { AUTONOMY_LOADING, type AutonomyState } from "../hooks/useAutonomyState";
import { EtatZetis } from "./EtatZetis";

// Sidebar temporaire de l'interface Papa (Étape 3) — cockpit de pilotage.
//
// ⚠️ **Deux motifs cohabitent ici, et c'est une dette DATÉE (2026-08-04).** L'état d'autonomie
// arrive en PROP depuis `PapaLayout` (motif ADR-0030 : un hook dans le layout, une valeur pour
// toutes les pages) ; les deux pastilles ci-dessous font encore leur propre appel au montage —
// exactement le motif que l'ADR-0030 a supprimé côté Massimo. Elles n'ont AUCUN test aujourd'hui :
// les migrer dans la même tranche que l'état de ZETIS serait refactorer du code non couvert au
// milieu d'une feature. Chantier nommé, pas oublié (addendum ADR-0032 §Conséquences).
// Conséquence assumée : le verrou « la sidebar ne fait aucun appel réseau » est ici RÉDUIT à
// « la sidebar ne lit jamais l'autonomie elle-même » (cf. `PapaSidebar.test.tsx`).
export function PapaSidebar({ autonomy = AUTONOMY_LOADING }: { autonomy?: AutonomyState }) {
  // Compteur ambré « à valider » sur l'entrée Missions (même motif que les autres files de
  // validation) : chargé au montage, rafraîchi quand la page émet après validate/reject.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const refresh = () =>
      fetchPilotSummary()
        .then((s) => setPending(s.pending))
        .catch(() => undefined);
    void refresh();
    window.addEventListener(MISSIONS_PENDING_EVENT, refresh);
    return () => window.removeEventListener(MISSIONS_PENDING_EVENT, refresh);
  }, []);

  // Pastille de NOTIFICATION « Demandes de Massimo » (addendum ADR-0027) = SOMME des deux files :
  // contenu à créer (`content_requests`) + notion hors-programme à ajouter (`notion_requests`).
  // Rafraîchie à chaque triage, quelle qu'en soit la surface (event unifié).
  const [requests, setRequests] = useState(0);
  useEffect(() => {
    const refresh = () =>
      Promise.all([fetchContentRequestsCount(), fetchNotionRequestsCount()])
        .then(([content, notion]) => setRequests(content + notion))
        .catch(() => undefined);
    void refresh();
    window.addEventListener(DEMANDES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DEMANDES_CHANGED_EVENT, refresh);
  }, []);

  return (
    // `overflow-hidden` sur la colonne, `overflow-y-auto` sur la seule `<nav>` : le bloc d'état
    // reste ÉPINGLÉ en haut pendant que les 22 entrées défilent. Le faire scroller avec elles
    // annulerait la feature — un état qu'on doit aller chercher est un état qu'on n'a pas.
    <aside className="flex h-full w-64 shrink-0 flex-col gap-2 overflow-hidden border-r border-papa-border bg-papa-surface p-4">
      {/* Le bandeau de marque a cédé sa place à l'état de ZETIS : la question « dans quel régime
          travaille-t-il ? » se pose vingt fois par session, « comment s'appelle cette app ? »
          jamais. L'identité survit dans l'avatar, qui porte le sceau ZETIS. */}
      <EtatZetis state={autonomy} />

      {/* `min-h-0` est obligatoire : sans lui, un enfant flex refuse de rétrécir sous sa taille de
          contenu et `overflow-y-auto` n'a jamais rien à faire. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {PAPA_NAV.map((item) => (
          <Fragment key={item.to}>
            {item.startsGroup && <div className="my-2 h-px bg-papa-border" role="presentation" />}
            <NavLink
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-papa-accent/15 text-papa-accent"
                  : "text-papa-muted hover:bg-papa-surface-2 hover:text-papa-text",
              ].join(" ")
            }
          >
            {item.iconUrl ? (
              // Décoratif : le libellé de l'entrée est juste à côté.
              <img
                src={item.iconUrl}
                alt=""
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-[22%] object-contain"
              />
            ) : (
              <span className="text-base">{item.icon}</span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.to === "/missions" && pending > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">
                {pending}
              </span>
            )}
            {item.to === "/demandes" && requests > 0 && (
              // Accent (pas ambre) : c'est une NOUVELLE demande à traiter, pas une file de validation.
              <span className="rounded-full bg-papa-accent/20 px-2 py-0.5 text-xs font-bold text-papa-accent">
                {requests}
              </span>
            )}
            </NavLink>
          </Fragment>
        ))}
      </nav>
    </aside>
  );
}
