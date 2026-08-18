import { createAuthClient } from "@zetis/auth";

// 🔴 LE REPLI VISE 8001, PAS 8000 — et le motif est une règle déjà écrite du dépôt :
// « on choisit le défaut qui se voit » (ADR-0015, §Sécurité par construction).
//
// Depuis le 2026-08-18 la PROD possède le port 8000 sur la machine de développement. Un repli sur
// 8000 faisait donc écrire un frontend de dev dans l'ANNÉE RÉELLE DE MASSIMO, sans un mot. Le
// repli sur 8001 (le backend de dev, cf. `.claude/launch.json`) échoue au contraire bruyamment
// quand rien n'écoute : connexion refusée, visible, bénigne.
//
// ⚠️ Ce repli ne sert QUE de dernier recours. `pnpm dev` pose la variable explicitement, les
// paires de `launch.json` aussi, et l'image de prod la reçoit en ARG au build. Si tu le vois
// s'appliquer, c'est qu'une surface a oublié de se déclarer.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

// Client d'auth de l'app Papa (rôle "papa", clé de token dédiée).
export const authClient = createAuthClient({
  apiUrl: API_URL,
  appRole: "papa",
  appLabel: "Papa",
  tokenKey: "zetis_papa_token",
});
