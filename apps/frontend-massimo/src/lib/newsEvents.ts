// Événement « une nouveauté vient d'être consommée » (ADR-0030 §5).
//
// Écouté à UN SEUL endroit — le hook monté dans `MassimoLayout` — et émis par les fonctions de
// `lib/` qui posent une trace de vue, jamais par les pages. Ce placement n'est pas une préférence
// de style : l'émission vit à côté de l'écriture, donc aucun appelant présent ou futur ne peut
// l'oublier. Même patron que `notifyDemandesChanged` côté Papa, éprouvé en live.
//
// **Aucun polling, aucune horloge, aucun websocket.** Un compteur qui change sans que Massimo ait
// rien fait EST une notification, quel que soit son intitulé — c'est la ligne que l'ADR trace
// entre un témoin et une relance.
export const NEWS_CHANGED_EVENT = "zetis:news-changed";

export function notifyNewsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NEWS_CHANGED_EVENT));
  }
}
