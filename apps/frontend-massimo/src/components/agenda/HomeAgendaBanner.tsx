import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type AgendaItemStudent, type AgendaUpcomingItem } from "@zetis/types";
import { fetchAgendaItems, fetchAgendaUpcoming } from "../../lib/agenda";
import {
  addDays,
  bannerItems,
  bannerUpcoming,
  daysLeftLabel,
  isoDay,
  shortDayLabel,
  splitSections,
} from "../../lib/agendaSections";
import { subjectIconFor } from "../../lib/subjectIcons";

// Résumé « Aujourd'hui / Demain » sur l'Accueil (ADR-0025).
//
// L'agenda a DEUX accès (décision du commanditaire, 2026-07-29) : l'entrée de sidebar pour y
// aller quand on le décide, ce résumé pour le voir sans y aller. Les deux ne font pas double
// emploi — la sidebar est un chemin, ceci est une information.
//
// **Aucune date dans la liste du haut** : l'Accueil porte l'horizon « maintenant ». 3 items max.
//
// Depuis le 2026-08-01, une seconde section **« À préparer »** remonte « ce qui arrive »
// (`/agenda/upcoming`, contrôles et rendus, déjà borné serveur), plafonnée à 2 — celle-ci PORTE
// une date. Motif : un contrôle de jeudi était invisible depuis l'Accueil jusqu'à mercredi, et
// Massimo doit savoir quand il a des choses à étudier. Le badge de nouveauté de la sidebar ne
// pouvait pas y répondre : c'est un nombre sans date, et le faire compter les items NON FAITS en
// aurait fait le compteur d'arriéré que l'ADR-0025 §3/§7 interdit.
//
// S'il n'y a rien : une ligne calme — JAMAIS « ajoute tes devoirs ». En phase 0 Massimo ne le
// peut pas, et l'y inviter serait une impasse.
//
// Rendu inconditionnel (jamais masqué quand c'est vide) : un résumé qui disparaît quand il n'a
// rien à dire apprend à ne plus le regarder.

export function HomeAgendaBanner() {
  const [items, setItems] = useState<AgendaItemStudent[]>([]);
  const [upcoming, setUpcoming] = useState<AgendaUpcomingItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const today = new Date();
    Promise.all([
      fetchAgendaItems(isoDay(today), isoDay(addDays(today, 1)))
        .then((rows) => setItems(bannerItems(splitSections(rows, today))))
        // Échec silencieux : aucun message technique à l'écran de l'enfant.
        .catch(() => setItems([])),
      fetchAgendaUpcoming()
        .then((rows) => setUpcoming(bannerUpcoming(rows)))
        .catch(() => setUpcoming([])),
    ])
      // 🔴 CE BANDEAU NE MARQUE PLUS L'AGENDA VU — `adr-0025-agenda-scolaire` (Amendement 7)
      // (2026-08-15), qui RÉVOQUE le second point d'écriture du §12.3.
      //
      // Il le faisait ici, dans ce `finally`. Massimo atterrissant sur l'Accueil, le témoin de
      // l'entrée Agenda était éteint avant d'avoir fini de s'afficher — le commentaire d'origine
      // l'écrivait lui-même (« il n'y vit que quelques centaines de millisecondes ») et l'assumait.
      // Ce qu'il n'avait pas mesuré : cela ne laissait au témoin AUCUN cas d'usage réel.
      //
      // Le motif du §12.3 (« les deux surfaces où Massimo lit ce qui est arrivé ») est faux pour
      // celle-ci : ce bandeau montre un EXTRAIT choisi sur un autre critère (aujourd'hui/demain +
      // à-venir tronqué), quand le témoin compte ce qui est ARRIVÉ, sans considération d'échéance.
      // Un devoir saisi ce matin pour dans trois semaines est nouveau ET absent d'ici.
      //
      // Le regard vit désormais à `useAgenda`, à l'ouverture de `/agenda` — la seule surface qui
      // montre TOUT ce qui est arrivé. Ne pas le rétablir ici sans amender ce document.
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  return (
    <Link
      to="/agenda"
      className="mb-4 block rounded-2xl border border-zetis-border bg-zetis-surface p-4 transition-colors hover:border-white/20 motion-reduce:transition-none"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
          Mon agenda
        </p>
        <span className="text-xs text-zetis-muted">Voir →</span>
      </div>

      {items.length === 0 && upcoming.length === 0 ? (
        <p className="mt-2 text-sm text-zetis-muted">Rien de noté pour aujourd'hui ni demain.</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-zetis-muted">Rien pour aujourd'hui ni demain.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  item.done ? "bg-emerald-400/70" : "bg-white/30"
                }`}
              />
              {item.subject && (
                <img
                  src={subjectIconFor(item.subject.slug)}
                  alt=""
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded-[22%] object-contain"
                />
              )}
              <span className={`truncate ${item.done ? "text-zetis-muted line-through" : ""}`}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* « À préparer » — répond à QUAND, là où le badge de sidebar répond à « il y a du
          nouveau » (ADR-0030 §1). Deux objets, deux questions : un badge est un nombre sans
          date, il ne peut pas dire « contrôle jeudi ».

          La DATE est ici légitime et c'est le point : une échéance qui vient du collège est un
          fait SUBI (ADR-0025 §1), pas un compte à rebours fabriqué par ZETIS. C'est ce qui
          sépare cette section d'un compteur d'arriéré — elle ne montre que des contrôles et des
          rendus À VENIR, bornés serveur, et ne s'allonge jamais. */}
      {upcoming.length > 0 && (
        <div className="mt-3 border-t border-zetis-border pt-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zetis-muted">
            À préparer
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {upcoming.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                {item.subject && (
                  <img
                    src={subjectIconFor(item.subject.slug)}
                    alt=""
                    aria-hidden
                    className="h-4 w-4 shrink-0 rounded-[22%] object-contain"
                  />
                )}
                <span className="truncate">{item.label}</span>
                {/* Chiffre neutre, jamais une jauge qui change de couleur à l'approche : le
                    signal d'urgence est ce qui rend un rappel anxiogène (ADR-0025 §6). */}
                <span className="ml-auto shrink-0 text-[11px] text-zetis-muted">
                  {shortDayLabel(item.due_on)} · {daysLeftLabel(item.days_left)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Link>
  );
}
