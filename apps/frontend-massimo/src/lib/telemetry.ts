// Télémétrie de navigation — SEULE écriture cliente du journal d'activité (slice A backend).
//
// Déclaratif observationnel : n'influence ni XP, ni score, ni verdict. C'est ce qui borne
// l'exception au « never trust the client ». Le SERVEUR horodate ; on n'envoie qu'une route.
//
// Rien de ce tracking n'est visible dans l'interface de Massimo : pas de compteur, pas de badge,
// aucun retour à l'écran — un enfant chronométré travaille pour le chronomètre.
import { API_URL, authClient } from "./authClient";

/** Envoie une vue de page. Fire-and-forget : ne bloque JAMAIS la navigation et n'échoue jamais
 *  visiblement. Un backend éteint ou une erreur réseau ne doit pas empêcher Massimo de changer
 *  de page — le journal est un à-côté, pas une dépendance du parcours. */
export function sendPageview(route: string): void {
  const token = authClient.getToken();
  if (!token) return; // non connecté : le serveur n'aurait personne à qui attribuer la vue

  void fetch(`${API_URL}/api/telemetry/pageview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ route }),
    // La navigation peut démonter le composant aussitôt : `keepalive` laisse la requête
    // se terminer au lieu d'être annulée en vol.
    keepalive: true,
  }).catch(() => {
    // Silence volontaire : aucune remontée d'erreur pour un signal purement observationnel.
  });
}
