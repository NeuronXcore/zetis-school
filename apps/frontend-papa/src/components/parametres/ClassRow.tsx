// Une classe d'objets et son palier (ADR-0032 §1, matrice du §G.2).
//
// Deux rendus, une seule règle : **c'est `choices` qui décide**, et il vient du serveur.
// - plusieurs choix → un segmenté ;
// - un seul choix → un cadenas, AVEC son motif. Jamais un cadenas muet : il se lirait comme une
//   panne (leçon de la pastille quiz du 2026-08-01, « une chose qui ressemble à un lien doit être
//   un lien »).
//
// ⚠️ Aucune liste de paliers n'est écrite ici. Le jour où le veto obtient sa surface, le serveur
// rouvre le palier 3 d'A1 et la ligne devient réglable **sans qu'une ligne de ce fichier change**.
import { type AutonomyClass, type AutonomyLevel } from "@zetis/types";

import { LEVEL_LABEL } from "../../lib/settings";

// ⚠️ **Ce que la classe EST**, jamais pourquoi elle est verrouillée : le motif vient du serveur
// (`reason`) et s'affiche juste après. Vu à l'écran le 2026-08-02 — les descriptions d'A3 et A4
// répétaient mot pour mot le motif renvoyé, et la ligne disait deux fois la même phrase. Deux
// sources pour une idée, c'est le défaut que ce projet corrige partout ailleurs.
const DESCRIPTION: Record<string, string> = {
  A0a: "Fiches, cartes mentales, quiz, capsules — l'erreur dort jusqu'à ce qu'on ouvre.",
  A0b: "Cartes de révision — leur erreur ne dort pas, elle se compose semaine après semaine.",
  A1: "Le seul contenu que Massimo lit vraiment — et, depuis le 2 août, le dernier qui passe devant un humain.",
  A2: "Notions, leçons, chapitres — la carte du programme.",
  A3: "Les missions proposées à Massimo.",
  A4: "Supprimer un contenu, archiver une leçon, retirer une validation.",
};

export function ClassRow({
  cls,
  value,
  onChange,
}: {
  cls: AutonomyClass;
  value: AutonomyLevel;
  onChange: (level: AutonomyLevel) => void;
}) {
  return (
    // `group` + `aria-label` : la ligne est adressable par le nom de sa classe, pour un lecteur
    // d'écran comme pour un test. Sans ça, cibler « le segmenté du cours » demandait de remonter
    // le DOM à l'aveugle — fragile, et le premier changement de balise l'aurait cassé.
    <div
      role="group"
      aria-label={cls.label}
      className="flex items-center gap-4 border-t border-papa-border py-3"
    >
      <span className="min-w-0 flex-1">
        <b className="text-[13px] font-semibold">
          <span className="mr-1.5 text-[10.5px] font-bold tracking-wider text-papa-muted">
            {cls.code}
          </span>
          {cls.label}
        </b>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-papa-muted">
          {DESCRIPTION[cls.code]}
          {/* Le motif d'un verrou est affiché À CÔTÉ de la ligne, pas seulement en `title` :
              un motif qui n'apparaît qu'au survol n'existe pas sur une tablette. */}
          {cls.locked && cls.reason && (
            <>
              {" "}
              <span className="text-papa-warn">{cls.reason}</span>
            </>
          )}
        </p>
      </span>

      {cls.locked ? (
        <span
          className="shrink-0 rounded-lg border border-dashed border-papa-border px-2.5 py-1.5 text-[11.5px] text-papa-muted"
          title={cls.reason ?? undefined}
        >
          <span aria-hidden>{value === 0 ? "🚫" : "🔒"}</span> {LEVEL_LABEL[value]}
        </span>
      ) : (
        <span className="flex shrink-0 overflow-hidden rounded-lg border border-papa-border">
          {cls.choices.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={value === level}
              onClick={() => onChange(level)}
              className={[
                "px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                value === level
                  ? "bg-papa-accent/15 text-emerald-300"
                  : "text-papa-muted hover:text-papa-text",
              ].join(" ")}
            >
              {LEVEL_LABEL[level]}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
