// Brique avatar ZETIS partagée (@zetis/ui/avatar, ADR-0026 slice B) — UN SEUL rig vivant pour
// le chat Massimo aujourd'hui, les capsules demain (différé ADR-0007 « avatar animé »).
//
// EXPORT EN SOUS-CHEMIN VOLONTAIRE : la brique embarque un moteur canvas + un asset image. Elle
// n'est PAS ré-exportée depuis `@zetis/ui` (racine), pour ne pas alourdir le bundle des pages qui
// n'affichent pas d'avatar. Même patron que `@zetis/ui/mindmap`.
//
// Contrat : zéro fetch, zéro logique métier. Props `state`, `awake`, et le flux d'articulation
// `[ouverture, grave, médium, aigu]` (source pseudo-phonétique en Lot 1, AnalyserNode plus tard).
export { AvatarCanvas, type AvatarCanvasProps } from "./AvatarCanvas";
export { phonemeForWord, SILENCE, type Articulation } from "./phonetics";
export {
  STATE_STYLES,
  AVATAR_FRAMING,
  LIP_LINE,
  JAW_MAX,
  EYE_MAX,
  SPARK,
  DROWSE_DELAY_MS,
  EYE_X_LEFT,
  EYE_X_RIGHT,
  EYE_Y,
  type AvatarState,
  type StateStyle,
} from "./constants";
