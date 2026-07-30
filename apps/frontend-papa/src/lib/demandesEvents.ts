// Événement partagé « la file des demandes de Massimo a changé » — écouté par la pastille de
// notification de la sidebar, émis par TOUT triage (contenu OU notion hors-programme), quelle que
// soit la surface (page /demandes ou popover Couverture). Une seule pastille = somme des deux files.
export const DEMANDES_CHANGED_EVENT = "zetis:demandes-changed";

export function notifyDemandesChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DEMANDES_CHANGED_EVENT));
  }
}
