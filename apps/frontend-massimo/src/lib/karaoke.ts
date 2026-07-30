// Karaoké minuté (ADR-0026 slice B, Lot 1). ISOLÉ VOLONTAIREMENT : en Lot 1, sans audio, la durée
// de chaque mot est estimée par heuristique. Au lot TTS, cette fonction est REMPLACÉE par les
// bornes de mots réelles du moteur de voix serveur — le reste de la page (karaoké, avatar) ne
// change pas. Ne pas disséminer cette heuristique ailleurs.

export interface KaraokeWord {
  text: string;
  /** durée estimée du mot, en ms */
  dur: number;
}

/** Découpe un texte en mots karaoké avec une durée estimée (longueur + pause de ponctuation). */
export function splitKaraoke(text: string): KaraokeWord[] {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => {
      const letters = w.replace(/[^A-Za-zÀ-ÿ']/g, "").length;
      let dur = 105 + letters * 52;
      if (/[,.]$/.test(w)) dur += 230; // respiration sur la ponctuation
      return { text: w, dur };
    });
}
