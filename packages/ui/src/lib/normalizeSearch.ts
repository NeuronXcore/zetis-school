/**
 * Normalise une chaîne pour la recherche : sans accents, en minuscules, sans bords.
 *
 * Massimo tape « elyse », pas « Élysée », et rarement avec la bonne casse. Comparer les
 * chaînes brutes ferait échouer la recherche sur une bonne part du programme.
 *
 * 🔴 **C'est LE normaliseur du dépôt** (ADR-0057 §8). Il en existait **trois** copies identiques
 * le 2026-08-14 — une dans la galaxie (`packages/ui`) et deux dans `lib/groupCapsules.ts`,
 * recopiées mot pour mot entre l'app de Massimo et celle de Papa. C'est l'angle mort que
 * l'`adr-0053` a nommé : une brique partagée par copier-coller n'est pas partagée, elle est
 * dupliquée, et deux copies finissent toujours par diverger.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
