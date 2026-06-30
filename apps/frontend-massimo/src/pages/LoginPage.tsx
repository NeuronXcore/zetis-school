import { LoginScreen } from "@zetis/auth";

// Page de connexion Massimo (Étape 18) — écran ZETIS partagé, profil « massimo ».
// Le sélecteur « Papa » redirige vers le frontend Papa.
const PAPA_URL = import.meta.env.VITE_PAPA_URL ?? "http://localhost:5174";

export function LoginPage() {
  return <LoginScreen role="massimo" otherAppUrl={PAPA_URL} />;
}
