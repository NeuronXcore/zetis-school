import { LoginScreen } from "@zetis/auth";

// Page de connexion Papa (Étape 18) — écran ZETIS partagé, profil « papa ».
// Le sélecteur « Massimo » redirige vers le frontend Massimo.
const MASSIMO_URL = import.meta.env.VITE_MASSIMO_URL ?? "http://localhost:5173";

export function LoginPage() {
  return <LoginScreen role="papa" otherAppUrl={MASSIMO_URL} />;
}
