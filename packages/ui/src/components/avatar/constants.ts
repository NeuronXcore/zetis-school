// Constantes CALIBRÉES de l'avatar ZETIS (relevées sur `mockup-page-chat.html`, ADR-0026 slice B).
// Versionnées comme les constantes de session serveur : tout changement de calibration = revue.
// Ne pas « arrondir » ces valeurs — elles ont été mesurées sur le PNG du visage (charnière de
// mâchoire, centres d'iris, cadrage). Bornes indiquées quand un dépassement casse le rendu.

export const AVATAR_FRAMING = 1.13; // cadrage (borne 1.07–1.16 : au-delà, cadre d'icône/coiffure sortent)
export const LIP_LINE = 55.1; // % — charnière de mâchoire (sous la lèvre sup., au-dessus des dents)
export const JAW_MAX = 0.024; // ouverture max (fraction du diamètre de l'avatar)
export const EYE_MAX = 0.72; // éclat continu des iris pendant la parole
export const SPARK = 0.9; // surtensions (amplitude ET fréquence couplées)
export const DROWSE_DELAY_MS = 4200; // délai d'assoupissement après retour au repos

// Centres des iris, en % du cadre (x gauche, x droite, y commun).
export const EYE_X_LEFT = 41.2;
export const EYE_X_RIGHT = 57.8;
export const EYE_Y = 40.2;

// Couleur = état, direction du mouvement = état (lisible sans distinguer les teintes).
// OR = parole de ZETIS, réservé à la parole dans TOUTE l'interface Massimo (règle design system).
export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

export interface StateStyle {
  color: string;
  rings: [string, string, string];
  label: string;
  breathe: boolean;
}

export const STATE_STYLES: Record<AvatarState, StateStyle> = {
  idle: { color: "#6366f1", rings: ["#6366f1", "#6366f1", "#d946ef"], label: "", breathe: true },
  listening: { color: "#22d3ee", rings: ["#22d3ee", "#6366f1", "#d946ef"], label: "ZETIS t'écoute", breathe: false },
  thinking: { color: "#2e63ff", rings: ["#2e63ff", "#4d9fff", "#22d3ee"], label: "ZETIS réfléchit…", breathe: false },
  speaking: { color: "#ffcf47", rings: ["#ffcf47", "#ff9d2e", "#6366f1"], label: "", breathe: false },
};
