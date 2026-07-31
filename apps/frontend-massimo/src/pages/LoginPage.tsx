import { LoginScreen } from "@zetis/auth";

// Page de connexion de l'espace Massimo (port 5173). L'écran est propre à ce profil :
// l'auth est par app, chaque frontend n'accepte que son rôle.
export function LoginPage() {
  return <LoginScreen role="massimo" />;
}
