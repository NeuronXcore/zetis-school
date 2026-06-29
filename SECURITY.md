# SECURITY.md — Sécurité et confidentialité ZETIS

## Objectif

ZETIS manipule des données d’un enfant : apprentissages, difficultés, résultats, voix, contenus générés et historiques d’activité. La sécurité doit être prise au sérieux dès le MVP, même si l’application reste personnelle.

## Principes

- Collecte minimale.
- Accès par rôle.
- Données persistantes dans PostgreSQL.
- Secrets hors Git.
- IA appelée via backend uniquement.
- Journalisation utile mais non invasive.
- Suppression possible des données inutiles.

## Rôles

### child

Massimo. Accès à ses cours, missions, quiz, progression simplifiée.

### parent

Papa. Accès aux analyses, paramètres, validations, programmes.

### admin

Administration technique locale.

## Données sensibles

Données à protéger :

- identité ;
- résultats scolaires ;
- lacunes ;
- voix ;
- productions écrites ;
- historiques de sessions ;
- documents importés ;
- prompts contenant contexte personnel.

## Secrets

Ne jamais committer :

- clés API OpenAI/Anthropic ;
- mots de passe DB ;
- secrets JWT ;
- clés MinIO ;
- tokens SMTP ;
- identifiants VPS.

Utiliser :

- `.env.example` pour la documentation ;
- `.env.local` ignoré par Git ;
- variables Docker.

## Authentification MVP

- Email + mot de passe.
- Hash avec Argon2 ou bcrypt.
- JWT court.
- Refresh token stocké côté serveur ou révocable.

## Accès distant

Si Massimo doit se connecter hors domicile :

Option recommandée au départ : VPN WireGuard.

Alternative : VPS avec reverse proxy, HTTPS, rate limiting, firewall, sauvegardes.

Ne jamais exposer directement une API de dev sans protection.

## IA et confidentialité

Avant d’envoyer du contexte à un provider IA :

- limiter au strict nécessaire ;
- éviter données personnelles inutiles ;
- ne pas envoyer tous les historiques ;
- préférer résumé pédagogique anonymisé quand possible.

## Uploads

Fichiers autorisés :

- PDF ;
- images ;
- audio ;
- markdown ;
- texte.

Contrôles :

- taille max ;
- type MIME ;
- antivirus optionnel ;
- stockage MinIO non public ;
- URL signées si accès direct.

## Logs

Les logs doivent inclure :

- job id ;
- user id ;
- route ;
- durée ;
- statut.

Les logs ne doivent pas inclure :

- mot de passe ;
- token ;
- clé API ;
- texte complet d’une conversation enfant sauf besoin explicite de debug local.

## Sauvegardes

Sauvegarder :

- dump PostgreSQL ;
- bucket MinIO ;
- fichiers `.env` hors dépôt ;
- prompts versionnés.

Fréquence recommandée :

- hebdomadaire MVP ;
- quotidienne si usage régulier.

## RGPD personnel

Même pour un usage personnel, appliquer les principes :

- savoir quelles données sont stockées ;
- pouvoir supprimer un historique ;
- pouvoir exporter ;
- éviter collecte excessive ;
- protéger accès parent.

## Checklist sécurité MVP

- [ ] `.env` dans `.gitignore`.
- [ ] `SECRET_KEY` fort.
- [ ] Mots de passe hashés.
- [ ] Routes Papa protégées.
- [ ] Buckets MinIO privés.
- [ ] API IA côté backend seulement.
- [ ] CORS limité.
- [ ] Logs sans secrets.
- [ ] Sauvegarde documentée.
- [ ] Accès distant sécurisé avant ouverture réseau.
