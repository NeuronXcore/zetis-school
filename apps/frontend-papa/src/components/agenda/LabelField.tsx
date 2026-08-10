import { useState } from "react";
import { Input, Select } from "@zetis/ui";

// L'intitulé d'une échéance — addendum ADR-0025 §13.
//
// Trois colonnes de la grille sont des menus du référentiel (matière, chapitre, type). Celle-ci
// l'est aussi désormais : les **cours validés du chapitre choisi**, plus une porte de sortie.
//
// La porte de sortie n'est pas un compromis, c'est le cas majoritaire d'un `kind = devoir` : un
// devoir s'énonce par des consignes et des références de manuel, presque jamais par le titre d'un
// cours du référentiel — le menu ne peut donc pas le proposer. Ce qui part au
// serveur reste du **texte brut** dans les deux cas (ADR-0025 §8) — on change la façon de le
// produire, pas ce qu'il est. Aucun `lesson_id` n'est retenu : le `chapter_id` d'à côté ouvre
// déjà les deux portes (production ADR-0035, Commander de missions), toutes deux scopées par
// chapitre.
//
// Écrit une fois pour les DEUX surfaces d'édition (grille de saisie, panneau de détail) : la
// même règle dupliquée aurait divergé, comme le sélecteur de chapitre a divergé jusqu'à
// l'addendum ADR-0035 §3.

/** Sentinelle réservée : `lessons.title` est du texte saisi par un humain, jamais ceci. */
const FREE_TEXT = "__zetis_free_text__";

/** Cours proposé — l'`id` accompagne le titre depuis l'addendum §15 : c'est lui qui permettra à
 *  Massimo d'ouvrir SON cours depuis l'agenda. Sans lui, l'information est produite ici puis
 *  jetée, ce qui était exactement l'état des choses jusqu'au 2026-08-10. */
export interface LessonOption {
  id: number;
  title: string;
}

interface Props {
  value: string;
  /** `lessonId` est `null` dès que la valeur n'est pas un cours choisi dans la liste. */
  onChange: (value: string, lessonId: number | null) => void;
  /** Cours VALIDÉS du chapitre — le filtre vit dans `useAgendaReferential`. */
  lessons: LessonOption[];
  loading: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function LabelField({
  value,
  onChange,
  lessons,
  loading,
  disabled,
  placeholder,
  className,
}: Props) {
  const titles = lessons.map((l) => l.title);
  // Le SEUL état local : « Papa a demandé le texte libre ». Tout le reste est dérivé, pour que
  // le champ ne puisse pas mémoriser un mode en désaccord avec ce qu'il affiche.
  const [freeText, setFreeText] = useState(false);

  // Pas de menu vide, jamais : sans chapitre — ou sur un chapitre dont les leçons sont encore en
  // brouillon — le champ est un simple texte. Même jurisprudence que le sélecteur de chapitre,
  // qu'un test-verrou protège déjà (« n'offre pas un menu vide »).
  const hasTitles = titles.length > 0;
  // `loading` compte comme « il y aura une liste » : sans ça, le champ s'afficherait en texte
  // puis basculerait en menu à l'arrivée de la réponse.
  const canPick = hasTitles || loading;
  // Une valeur qui ne figure pas dans la liste ne peut pas être représentée par le menu. La
  // montrer quand même en menu mettrait l'écran en désaccord avec ce qui sera enregistré — et
  // c'est ce qui protège le texte déjà tapé quand un chapitre est choisi APRÈS coup (§13.4).
  const representable = value === "" || titles.includes(value);

  if (!canPick || freeText || !representable) {
    return (
      <div className={className}>
        <Input
          aria-label="Intitulé"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          // Texte tapé à la main = aucune leçon pointée. Garder un `lesson_id` posé plus tôt
          // ferait pointer le lien de Massimo vers un cours qui n'est plus l'intitulé.
          onChange={(e) => onChange(e.target.value, null)}
        />
        {hasTitles ? (
          // Retour à la liste : il VIDE le champ, et le libellé le dit. Garder le texte pendant
          // que le menu afficherait son placeholder ferait mentir l'écran.
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setFreeText(false);
              onChange("", null);
            }}
            className="mt-1 text-[11px] text-papa-muted transition-colors hover:text-papa-text"
          >
            ↩ choisir un cours
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <Select
      aria-label="Intitulé"
      className={className}
      value={value}
      disabled={disabled || loading}
      onChange={(e) => {
        // « ✏️ Autre » CONSERVE la valeur courante : choisir un cours puis vouloir l'amender
        // (« Contrôle — Les fractions ») est un geste normal, pas un recommencement. Mais le
        // texte cesse d'être LE titre du cours : la leçon pointée tombe.
        if (e.target.value === FREE_TEXT) {
          setFreeText(true);
          if (value !== "") onChange(value, null);
          return;
        }
        const choisi = lessons.find((l) => l.title === e.target.value) ?? null;
        onChange(e.target.value, choisi?.id ?? null);
      }}
    >
      <option value="">{loading ? "chargement…" : "— cours du chapitre —"}</option>
      {lessons.map((lesson) => (
        <option key={lesson.id} value={lesson.title}>
          {lesson.title}
        </option>
      ))}
      <option value={FREE_TEXT}>✏️ Autre (texte libre)</option>
    </Select>
  );
}
