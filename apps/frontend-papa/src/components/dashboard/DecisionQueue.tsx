import { Link } from "react-router-dom";
import type { InboxItem, InboxKind } from "@zetis/types";

// File « À décider » — première carte de la page, la seule à bordure ambre.
//
// Sa fonction est le TRI, pas le travail : une ligne par famille, jamais une ligne par contenu.
// Détaillée, elle redeviendrait une liste de tâches et perdrait exactement ce qu'elle apporte.
//
// ⚠️ Le `breakdown` (adr-0039) ne défait PAS cette règle : ses puces sont de la NAVIGATION vers
// la surface qui sait traiter cette famille, jamais des tâches. Aucun bouton d'action n'entre ici
// — c'est la règle la plus facile à défaire par serviabilité, et un test la garde.
//
// L'ordre vient du serveur et n'est pas retrié ici : il encode la priorité pédagogique, pas la
// chronologie. Un tri par ancienneté ferait remonter les captures à classer devant une notion
// qui bloque.

const KIND_LABELS: Record<InboxKind, string> = {
  validation: "À valider",
  gap: "À renforcer",
  demande: "Demande",
  referentiel: "Programme",
  source: "Source",
};

const KIND_ACTIONS: Record<InboxKind, string> = {
  validation: "Relire",
  gap: "Voir",
  demande: "Traiter",
  referentiel: "Ouvrir le programme",
  source: "Classer",
};

/** Teintes de famille. Aucune n'est rouge : cette file décrit du travail en attente, pas une
 *  faute — et le rouge est banni des deux interfaces (adr-0024, adr-0028 §6). */
const KIND_TONE: Record<InboxKind, string> = {
  validation: "border-papa-warn/40 bg-papa-warn/10 text-papa-warn",
  gap: "border-papa-accent/40 bg-papa-accent/10 text-papa-accent",
  demande: "border-papa-accent-2/40 bg-papa-accent-2/10 text-papa-accent-2",
  referentiel: "border-papa-border bg-papa-surface-2 text-papa-muted",
  source: "border-papa-accent-2/30 bg-papa-accent-2/5 text-papa-accent-2",
};

interface DecisionQueueProps {
  items: InboxItem[];
}

export function DecisionQueue({ items }: DecisionQueueProps) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-papa-warn/25 bg-papa-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-papa-border/60 px-4 py-3">
        <h2 className="text-xs font-extrabold uppercase tracking-widest">À décider</h2>
        {total > 0 && (
          <span className="rounded-full border border-papa-warn/30 bg-papa-warn/10 px-2.5 py-0.5 text-xs font-semibold text-papa-warn">
            {total}
          </span>
        )}
        <span className="ml-auto text-xs text-papa-muted">
          Rien de généré n'atteint Massimo avant ta validation.
        </span>
      </header>

      {items.length === 0 ? (
        // État vide = état NORMAL, et il est écrit. Pas d'illustration, pas de félicitation :
        // récompenser une file vide installerait la mécanique que ZETIS refuse côté Massimo, et
        // il n'y a aucune raison de l'installer côté Papa.
        <p className="px-4 py-5 text-sm text-papa-muted">
          Quand cette file est vide, il n'y a rien à faire.
        </p>
      ) : (
        <ul>
          {items.map((item) => (
            <li
              key={item.kind}
              className="flex flex-wrap items-center gap-3 border-b border-papa-border/50 px-4 py-3 last:border-b-0 hover:bg-papa-surface-2"
            >
              <span
                className={`min-w-[92px] rounded-md border px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider ${KIND_TONE[item.kind]}`}
              >
                {KIND_LABELS[item.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{item.label}</span>
                {item.breakdown.length > 0 ? (
                  // Chaque part du détail mène à la surface qui sait la traiter (adr-0039 §5) :
                  // les leçons à la Couverture (pilule « Non validées » + validation en lot), le
                  // reste à la file de relecture. Le `href` vient du serveur, jamais d'ici.
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {item.breakdown.map((segment) => (
                      <Link
                        key={segment.kind}
                        to={segment.href}
                        className="rounded-md border border-papa-border bg-papa-surface-2 px-2 py-0.5 text-xs text-papa-muted hover:border-papa-warn hover:text-papa-text"
                      >
                        {segment.label}
                      </Link>
                    ))}
                  </span>
                ) : (
                  // Repli : les quatre autres familles n'ont rien à décomposer, et un client qui
                  // ignorerait `breakdown` garde une ligne lisible.
                  item.detail && (
                    <span className="mt-0.5 block text-xs text-papa-muted">{item.detail}</span>
                  )
                )}
              </span>
              <Link
                to={item.href}
                className="shrink-0 rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-1.5 text-xs font-semibold hover:border-papa-accent"
              >
                {KIND_ACTIONS[item.kind]}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
