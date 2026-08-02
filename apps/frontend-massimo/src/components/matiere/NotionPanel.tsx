import type { ContentRequestKind, GalaxyAction, GalaxyActionKind, PanoplyNotion } from "@zetis/types";
import { ACTION_UI } from "../../lib/notionActionUi";
import { REQUESTABLE_KIND, SCOPE_NOTE } from "../../lib/notionRoutes";

export interface NotionPanelProps {
  notion: PanoplyNotion;
  /** Celle qui porte l'accent — la première FAISABLE, pas la première de la liste. */
  primaryKind: GalaxyActionKind | null;
  /** Ce qui manque, en vocabulaire de demande, déjà dédupliqué. */
  missingKinds: ContentRequestKind[];
  busy: boolean;
  isRequested: (kind: ContentRequestKind) => boolean;
  onOpen: (action: GalaxyAction) => void;
  onRequest: (kinds: ContentRequestKind[]) => void;
}

/** Les sept activités en boutons. Composant PUREMENT présentationnel : aucune règle ne se
 *  décide ici, tout vient du hook.
 *
 *  Deux principes de la spec s'y voient : une activité indisponible est **grisée, non
 *  cliquable, « bientôt »** — jamais « manquant », qui ferait d'un contenu que Papa n'a pas
 *  produit un échec de Massimo ; et l'accent va à la première activité **réellement faisable**,
 *  parce qu'une action mise en avant doit pouvoir être faite. */
export function NotionPanel({
  notion,
  primaryKind,
  missingKinds,
  busy,
  isRequested,
  onOpen,
  onRequest,
}: NotionPanelProps) {
  return (
    <div className="mt-1 rounded-xl border border-zetis-border bg-zetis-surface p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {notion.actions.map((action) => {
          const ui = ACTION_UI[action.kind];
          const scope = SCOPE_NOTE[action.kind];
          const kind = REQUESTABLE_KIND[action.kind];
          const asked = isRequested(kind);
          return (
            <div key={action.kind} className="flex items-stretch gap-1">
              <button
                type="button"
                disabled={busy || !action.available}
                onClick={() => onOpen(action)}
                className={
                  "flex min-h-11 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition motion-reduce:transition-none " +
                  (!action.available
                    ? "cursor-default border border-dashed border-zetis-border bg-transparent text-zetis-muted opacity-60"
                    : action.kind === primaryKind
                      ? "cursor-pointer bg-gradient-to-br from-zetis-accent to-zetis-accent-2 text-white"
                      : "cursor-pointer border border-zetis-border bg-zetis-surface-2 hover:border-zetis-accent-2")
                }
              >
                <span aria-hidden className={"text-lg " + (action.available ? "" : "grayscale")}>
                  {ui.icon}
                </span>
                <span className="min-w-0 flex-1">
                  {ui.label}
                  {/* `quiz` et `revision` ne sont pas adressables par notion : ils ouvrent la
                      surface MATIÈRE. Le dire ici plutôt que de promettre la notion. */}
                  {scope && (
                    <span className="block text-[11px] font-normal text-zetis-muted">{scope}</span>
                  )}
                </span>
                {!action.available && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider">
                    bientôt
                  </span>
                )}
              </button>

              {!action.available && (
                <button
                  type="button"
                  disabled={asked}
                  onClick={() => onRequest([kind])}
                  aria-label={
                    asked
                      ? `${ui.label} — déjà demandé à ZETIS`
                      : `Demander ${ui.label} à ZETIS`
                  }
                  className={
                    // Le halo, et non la teinte, est ce qui rend la demande « électrique » —
                    // même grammaire que les étoiles de la galaxie. Une fois demandé, le
                    // bouton s'apaise (plus de lueur) : le geste est fait, il n'appelle plus.
                    "min-h-11 shrink-0 rounded-xl border px-2 text-[11px] font-semibold transition motion-reduce:transition-none " +
                    (asked
                      ? "cursor-default border-zetis-request/50 bg-zetis-request/10 text-zetis-request-lit"
                      : "cursor-pointer border-zetis-request bg-zetis-request/10 text-zetis-request-lit shadow-request hover:bg-zetis-request/20")
                  }
                >
                  {asked ? "demandé" : "demander"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {missingKinds.length > 0 && (
        <div className="mt-3">
          {/* ⚠️ La phrase « ZETIS transmet la demande. Il ne fabrique rien tout seul. » a été
              RETIRÉE le 2026-08-01, et c'est une divergence assumée avec l'addendum ADR-0027
              qui l'exigeait. Motif : ZETIS produira bientôt du contenu lui-même, et la phrase
              deviendrait un mensonge — on ne fige pas dans l'UI une limite qu'on s'apprête à
              lever.

              Ce qui reste tient l'honnêteté sans elle : « C'est noté par ZETIS » dit qu'une
              demande est ENREGISTRÉE, sans promettre ni qui la traitera ni quand. Vrai dans
              les deux mondes. Ce qui reste interdit, en revanche, ne bouge pas : jamais
              « je te le prépare », aucun statut, aucun délai, aucun rappel. */}
          <button
            type="button"
            onClick={() => onRequest(missingKinds)}
            className="min-h-11 w-full rounded-xl border border-zetis-request bg-zetis-request/10 px-3 py-2 text-sm font-bold text-zetis-request-lit shadow-request transition hover:bg-zetis-request/20 motion-reduce:transition-none"
          >
            Demander à ZETIS tout ce qui manque ({missingKinds.length})
          </button>
        </div>
      )}
    </div>
  );
}
