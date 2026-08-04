// « Ce que fait ce niveau » — le panneau de lecture sous les cartes (addendum ADR-0032 §8.2/§8.3).
//
// Deux refus qui expliquent le code :
//
// 1. **CALCULÉ, jamais rédigé.** Chaque ligne compose deux données que le serveur envoie déjà :
//    `cls.label` et le libellé du palier que le niveau lui donnerait. Écrire une prose
//    *classe × niveau* recopierait la matrice du §G.2 **sous une forme que le serveur ne peut pas
//    refuser** — un 422 protège une valeur, jamais un texte. `PRESET_LEVELS` n'est toléré que
//    parce que le serveur arbitre quand même ; un miroir en prose n'aurait pas ce filet.
// 2. **Les quatre classes verrouillées sont MONTRÉES, pas tues.** Un préréglage n'écrit que deux
//    clés — les taire promettrait une richesse que la donnée n'a pas, les noyer parmi les autres
//    ferait croire que tout bouge et Papa chercherait un effet qui n'existe pas.
//
// ⚠️ Ce panneau **n'interroge rien** : `autonomy` est déjà en main. Il calcule, mais sur des
// données acquises — il ne peut donc pas dériver en compteur, ce que le §F.2 interdit. C'est la
// nuance qui a permis de remplacer l'ancien bloc statique « Où vous en êtes aujourd'hui ».
import { type Autonomy, type AutonomyClass, type AutonomyPreset } from "@zetis/types";

import { LEVEL_LABEL, levelsForPreset } from "../../lib/settings";

type Ligne = { cls: AutonomyClass; niveau: AutonomyClass["value"]; bouge: boolean };

/** Ce que le niveau `preset` ferait de chaque classe.
 *
 *  ⚠️ Deux sources, deux rôles, et les confondre serait un défaut :
 *  - **le GROUPE vient du serveur** (`cls.locked`) — c'est lui qui décide ce qui est réglable, et
 *    le jour où il rouvre une classe elle passe dans le groupe vivant *sans qu'une ligne d'ici
 *    change* (même contrat que `ClassRow`) ;
 *  - **la VALEUR vient du préréglage** (`levelsForPreset`), qui ne couvre que les classes qu'un
 *    régime a le DROIT d'écrire — les verrouillées n'y sont jamais, « sous peine d'en faire une
 *    porte dérobée sur une décision figée » (`lib/settings.ts`). Elles retombent sur `cls.value`.
 *
 *  Prendre `levelsForPreset` comme critère de groupe ferait basculer A0a et A1 chez les
 *  verrouillées dès que `preset` est nul (« Sur mesure ») — alors qu'elles restent réglables. */
function lignesPour(autonomy: Autonomy, preset: AutonomyPreset | null): Ligne[] {
  const cibles = preset ? levelsForPreset(preset) : {};
  return autonomy.classes.map((cls) => ({
    cls,
    niveau: cibles[cls.key] ?? cls.value,
    bouge: !cls.locked,
  }));
}

export function NiveauDetail({
  autonomy,
  preset,
}: {
  autonomy: Autonomy;
  /** Le niveau REGARDÉ — le brouillon en cours, ou `null` pour « Sur mesure ». */
  preset: AutonomyPreset | null;
}) {
  const lignes = lignesPour(autonomy, preset);
  const vivantes = lignes.filter((l) => l.bouge);
  const figees = lignes.filter((l) => !l.bouge);

  return (
    <section
      aria-label="Ce que fait ce niveau"
      className="mt-3 rounded-xl border border-papa-border bg-papa-bg px-4 py-3"
    >
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-papa-muted">
        Ce que ce niveau décide
      </h4>

      {/* ⚠️ `list`/`listitem` et NON `group` — bien que `ClassRow` utilise `group` pour la même
          classe, à quelques centaines de pixels d'ici. Deux `group` portant le même `aria-label`
          rendraient les lignes indiscernables pour un lecteur d'écran comme pour un test (constaté
          le 2026-08-04 : quatre tests de page sont tombés d'un coup). Et `group` annonce un
          ensemble de CONTRÔLES : ces lignes n'en portent aucune, elles se lisent. */}
      <div role="list" aria-label="Ce que ce niveau décide">
      {vivantes.map(({ cls, niveau }) => (
        <div key={cls.key} role="listitem" aria-label={cls.label} className="mt-2 flex items-center gap-4">
          <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-papa-text">
            <span className="mr-1.5 text-[10.5px] font-bold tracking-wider text-papa-muted">
              {cls.code}
            </span>
            {cls.label}
          </span>
          {/* `key` sur le NIVEAU, pas sur la classe : le nœud est remonté quand la valeur change,
              donc l'animation rejoue. Sans ça, une transition ne se déclencherait pas — la
              propriété ne change pas, elle naît (même piège que le fondu des avatars). */}
          <span
            key={niveau}
            className="niveau-valeur shrink-0 rounded-lg bg-papa-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-300"
          >
            {LEVEL_LABEL[niveau]}
          </span>
        </div>
      ))}
      </div>

      {figees.length > 0 && (
        <>
          <h4 className="mt-4 border-t border-papa-border pt-3 text-[11px] font-bold uppercase tracking-wider text-papa-muted">
            <span aria-hidden>🔒</span> Ce qu'aucun niveau ne change
          </h4>
          <div role="list" aria-label="Ce qu'aucun niveau ne change">
          {figees.map(({ cls, niveau }) => (
            <div
              key={cls.key}
              role="listitem"
              aria-label={cls.label}
              className="mt-2 flex items-start gap-4 opacity-70"
            >
              <span className="min-w-0 flex-1 text-[12px] text-papa-muted">
                <b className="font-semibold text-papa-text/80">{cls.label}</b>
                {/* Le motif vient du SERVEUR. Un cadenas muet se lit comme une panne — c'est déjà
                    un principe de cette page, et il vaut ici comme dans le détail réglable. */}
                {cls.reason && <span className="block text-[11px] leading-relaxed">{cls.reason}</span>}
              </span>
              <span className="shrink-0 rounded-lg border border-dashed border-papa-border px-2.5 py-1 text-[11px] text-papa-muted">
                {LEVEL_LABEL[niveau]}
              </span>
            </div>
          ))}
          </div>
        </>
      )}
    </section>
  );
}
