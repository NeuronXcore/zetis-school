import { useMemo, useState } from "react";
import { type AgendaItemStudent, type GalaxyNotion } from "@zetis/types";
import zetisAvatar from "../assets/brand/zetis-avatar_256.png";
import { NotionActionPanel } from "../components/galaxy/NotionActionPanel";
import { fetchNotionPanel } from "../lib/galaxy";
import { PageHeader } from "../components/PageHeader";
import { NeonBackdrop } from "../components/glass";
import { AgendaItemRow } from "../components/agenda/AgendaItemRow";
import { AgendaWeekStrip } from "../components/agenda/AgendaWeekStrip";
import { AgendaDayPanel } from "../components/agenda/AgendaDayPanel";
import { AgendaMonthGrid } from "../components/agenda/AgendaMonthGrid";
import { AgendaDayToast } from "../components/agenda/AgendaDayToast";
import { AheadBlock } from "../components/agenda/AheadBlock";
import { LateAlertToast } from "../components/agenda/LateAlertToast";
// ⚠️ `UpcomingCard` n'est plus importé ici (Amdt 8 §D8) mais le FICHIER RESTE :
// `SubjectSideRail` le rend toujours. Ne pas le supprimer en croyant nettoyer du mort.
import { useAgenda } from "../hooks/useAgenda";
import { RESUME_MAX, addDays, isoDay, preparationsForDay } from "../lib/agendaSections";
import { REGISTRE_TEINTE, type AgendaRegistre } from "@zetis/ui";

// Page `/agenda` de Massimo (ADR-0025, Lot 1) — ce que l'école lui demande.
//
// Ordre vertical — **TROIS registres, et ils répondent à trois questions** (Amdt 9 §D1) :
// bande ou grille (orientation) → PRÉSENT (Aujourd'hui · Demain) → FUTUR (Prendre de l'avance) →
// PASSÉ (À reprendre). Chaque section porte un rail de 2 px dont la teinte vient du CALENDRIER —
// cyan d'aujourd'hui, orange des jours à venir, ambre du retard : un seul code pour les deux
// moitiés de la page.
//
// **Phase 0 : Massimo LIT, COCHE et MASQUE — il ne saisit pas.** Il n'y a donc ici ni composer,
// ni bouton « + », ni champ, ni placeholder grisé, ni mention « bientôt » à cet endroit.
// L'ouverture de la saisie (geste de Papa, ADR-0025 §10) doit être un événement positif, pas la
// fin d'une privation affichée pendant des semaines.
//
// Registre de libellés : aucun rouge, aucun « en retard », aucun « X/Y », aucun total, aucune
// série. Un item passé non fait devient « à reprendre », en ambre doux.

export function AgendaPage() {
  const agenda = useAgenda();
  const [resumeOpen, setResumeOpen] = useState(false);
  const [notionOuverte, setNotionOuverte] = useState<GalaxyNotion | null>(null);
  /** Le jour SURVOLÉ (§D12) — distinct du jour OUVERT : survoler donne un aperçu, taper ouvre.
   *  ⚠️ Monté uniquement sur pointeur fin : au doigt il n'y a pas de survol, et un aperçu qui
   *  apparaîtrait au tap ferait concurrence au panneau qui s'ouvre au même geste. */
  const [survol, setSurvol] = useState<{ date: string; rect: DOMRect } | null>(null);
  const pointeurFin =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
  const onHoverDay = (date: string | null, rect: DOMRect | null) =>
    setSurvol(date && rect && pointeurFin ? { date, rect } : null);
  const pickedDay = agenda.pickedDay;

  /** Ouvre la panoplie d'une notion travaillée (Amdt 8 §D10).
   *
   *  Le panneau se charge à la demande : la panoplie d'une notion est une question qu'on ne
   *  pose qu'en tapant dessus, et la précharger pour toutes les notions d'une journée coûterait
   *  autant de résolutions pour rien.
   *
   *  Échec silencieux : rater le chargement laisse le récit intact, ce qui est sans gravité —
   *  afficher une erreur technique sur l'écran d'un enfant ne l'est pas. */
  const openNotion = (skillId: number) => {
    void fetchNotionPanel(skillId)
      .then((notion) => {
        setNotionOuverte(notion);
        requestAnimationFrame(() => {
          document
            .getElementById("agenda-notion")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      })
      .catch(() => setNotionOuverte(null));
  };

  const itemsByDate = useMemo(() => {
    const map: Record<string, AgendaItemStudent[]> = {};
    for (const item of agenda.items) (map[item.due_on] ??= []).push(item);
    return map;
  }, [agenda.items]);

  /** La bande OUVRE un jour (addendum §17). Elle n'était qu'un index : un tap faisait défiler
   *  vers les items du jour — et **ne faisait rien** sur un jour qui n'en a pas, c'est-à-dire sur
   *  tous les jours passés, dont le serveur ne renvoie jamais d'échéance (§6, asymétrie).
   *  Des points de trace allumés sous un jour muet se lisent comme une panne.
   *
   *  Retaper le jour ouvert le referme : c'est la seule façon de sortir sans chercher un ✕. */
  const pickDay = (date: string) => {
    agenda.openDay(pickedDay === date ? null : date);
    requestAnimationFrame(() => {
      document.getElementById("agenda-jour")?.scrollIntoView({
        // `prefers-reduced-motion` : la préférence système est respectée par le navigateur
        // pour `smooth` ; on ne force aucune animation supplémentaire.
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  // 🔴 `openPlan` a été RETIRÉ avec « Ce qui arrive » (Amdt 8 §D8). Il était son seul appelant,
  // et il portait le défaut (d) : il dépliait « la suite » puis cherchait `agenda-item-<id>` par
  // `getElementById` — or l'ancre était **en double dans le DOM** dès qu'un jour était ouvert,
  // ce que `getElementById` ne sait pas départager. Les deux sections parties, le défaut est
  // dissous plutôt que rustiné.

  /** Le jour ouvert, tel que la vue courante le connaît. La grille mois et la bande servent la
   *  même forme de jour : une seule recherche pour les deux. */
  const pickedDayData =
    agenda.week?.days.find((d) => d.date === pickedDay) ??
    agenda.month?.days.find((d) => d.date === pickedDay);

  /** Ce que le jour ouvert PRÉPARE — les étapes qui y tombent, chacune avec son échéance.
   *  C'est la question que le `✦` de la bande pose, et à laquelle le panneau ne répondait pas. */
  const pickedPreparations = useMemo(
    () => preparationsForDay(pickedDayData, agenda.items),
    [pickedDayData, agenda.items],
  );

  // ⚠️ `later` et `nothingNow` ont disparu d'ici avec la phrase d'agenda vide (Amdt 9) : ils ne
  // servaient qu'à décider de l'afficher. Le bloc « Prendre de l'avance » répond désormais à ce
  // cas, et il le fait avec des portes. `later` reste calculé dans `splitSections` — d'autres
  // lectures en dépendent.
  const { today, tomorrow, resume } = agenda.sections;

  /** Le jour ouvert est une RÉPONSE, pas une seconde liste — addendum §17.1, qui nomme le défaut
   *  et le déclarait évité par la seule transience du panneau : *« la bande ne devient pas une
   *  seconde liste qui doublerait les sections »*. À l'écran, la transience n'empêche rien —
   *  **tant que le panneau est ouvert, l'item est là deux fois**, avec deux coches, deux ✕, et
   *  son ancre `agenda-item-<id>` en double dans le DOM (ce que `getElementById`, dont dépend
   *  `openPlan`, ne sait pas départager).
   *
   *  🔴 **Les sections d'UN jour se retirent ENTIÈREMENT, elles ne se vident pas.** Les vider
   *  les ferait mentir : `tomorrow` filtré à zéro rendrait *« Rien de noté pour demain »* trois
   *  lignes sous les deux devoirs de demain. Le panneau EST la section, ce jour-là.
   *
   *  ⚠️ **Quatre sections rendent des items, pas deux.** « La suite » et « À reprendre » en
   *  rendent aussi — et « À reprendre » couvre les jours PASSÉS, que le panneau ouvre depuis
   *  l'addendum §17 : c'était même sa raison d'être. Multi-jours, elles se filtrent, et leur
   *  garde `.length > 0` les fait disparaître d'elles-mêmes si le jour ouvert était tout leur
   *  contenu. */
  const dayOpen = pickedDay !== null;
  const openIsToday = pickedDay === isoDay(agenda.today);
  const openIsTomorrow = pickedDay === isoDay(addDays(agenda.today, 1));
  const withoutOpenDay = (items: AgendaItemStudent[]) =>
    dayOpen ? items.filter((item) => item.due_on !== pickedDay) : items;
  // `later` n'a plus de section à lui (« La suite » est partie, Amdt 8 §D6-f) : il ne se filtre
  // donc plus. Il reste lu par l'état vide global, ci-dessous — un agenda qui porte des échéances
  // à J+5 n'est pas vide, même si rien n'est visible aujourd'hui.
  const resumeShown = withoutOpenDay(resume);

  return (
    <div className="relative mx-auto max-w-2xl">
      <NeonBackdrop />
      <div className="relative">
        {/* Le sous-titre disait « cette semaine », ce que la vue mois falsifie — et il omettait
            la moitié que l'Amendement 8 ajoute : le passé se raconte désormais.
            « ZETIS » et non « l'école » : demande du commanditaire du 2026-08-17, avec l'avatar
            devant. C'est ZETIS qui s'adresse à Massimo sur cette page, et l'avatar le dit sans
            l'écrire. */}
        <PageHeader
          title="Mon agenda"
          subtitle={
            <>
              <img
                src={zetisAvatar}
                alt=""
                aria-hidden
                className="h-6 w-6 shrink-0 rounded-full"
              />
              Ce que ZETIS te demande, et ce que tu as travaillé.
            </>
          }
        />

        {/* SÉLECTEUR DE VUE (Amdt 8 §D7) — **la bande est le défaut**, le mois se demande.
            Les deux vues répondent à deux questions, et la question quotidienne (« et
            maintenant ? ») se lit sur la bande sans aucun geste. Le choix est persisté : c'est
            ce qui rend l'arbitrage réversible sans code si l'usage le dément. */}
        <div className="mb-3 inline-flex gap-0.5 rounded-2xl border border-zetis-border bg-zetis-surface p-0.5">
          {(["bande", "mois"] as const).map((vue) => (
            <button
              key={vue}
              type="button"
              onClick={() => agenda.setView(vue)}
              aria-pressed={agenda.view === vue}
              // Plancher tactile : `min-h-11` (44 px), et non un bouton de 30 px.
              className={`min-h-11 rounded-[13px] px-4 text-[13px] font-semibold transition-colors motion-reduce:transition-none ${
                agenda.view === vue
                  ? "bg-zetis-surface-2 text-zetis-text"
                  : "text-zetis-muted hover:text-white"
              }`}
            >
              {vue === "bande" ? "14 jours" : "Mois"}
            </button>
          ))}
        </div>

        {/* 1 — La vue. Elle reste affichée même sans aucun item : les traces passées ont du
            sens seules. */}
        {agenda.view === "bande"
          ? agenda.week && (
              <section className="rounded-3xl border border-zetis-border bg-zetis-surface p-3">
                <AgendaWeekStrip
                  days={agenda.week.days}
                  itemsByDate={itemsByDate}
                  onPickDay={pickDay}
                  pickedDay={pickedDay}
                  onHoverDay={onHoverDay}
                />
              </section>
            )
          : agenda.month && (
              <AgendaMonthGrid
                month={agenda.month}
                itemsByDate={itemsByDate}
                onPickDay={pickDay}
                onNavigate={agenda.goToMonth}
                pickedDay={pickedDay}
                today={isoDay(agenda.today)}
                onHoverDay={onHoverDay}
              />
            )}

        {/* Aperçu au survol (§D12) — il ne remplace pas le panneau : il évite d'ouvrir douze
            jours pour retrouver lequel portait le contrôle. */}
        <AgendaDayToast
          date={survol?.date ?? null}
          ancre={survol?.rect ?? null}
          items={survol ? (itemsByDate[survol.date] ?? []) : []}
          traces={
            survol
              ? ((agenda.week?.days ?? agenda.month?.days ?? []).find(
                  (d) => d.date === survol.date,
                )?.traces ?? [])
              : []
          }
        />

        {/* 1 bis — Le jour ouvert (addendum §17). Placé SOUS la bande et non en bas de page :
            c'est la réponse à un tap, elle doit arriver là où le doigt vient de se poser. */}
        {pickedDay && (
          <AgendaDayPanel
            date={pickedDay}
            items={itemsByDate[pickedDay] ?? []}
            traces={agenda.dayTraces}
            onClose={() => agenda.openDay(null)}
            onToggle={(item) => agenda.toggleDone(item)}
            onDismiss={(item) => agenda.dismiss(item)}
            planByItem={agenda.planByItem}
            onToggleStep={agenda.toggleStep}
            preparations={pickedPreparations}
            onOpenNotion={openNotion}
          />
        )}

        {/* La panoplie d'une notion travaillée (Amdt 8 §D10) — le MÊME panneau que la Galaxie
            et que la page matière. Trois surfaces, un seul prédicat de disponibilité
            (`resolve_panoply`) : un second aurait fini par annoncer une porte ouverte sur du
            vide, ce qui est déjà arrivé une fois dans ce dépôt.
            ⚠️ `returnTo="/agenda"` — sans lui, Massimo partait faire un ELI5 depuis son agenda
            et revenait dans la galaxie, où il n'avait jamais demandé à aller. */}
        {notionOuverte && (
          <div id="agenda-notion" className="mt-3">
            <NotionActionPanel
              notion={notionOuverte}
              onClose={() => setNotionOuverte(null)}
              returnTo="/agenda"
            />
          </div>
        )}

        {/* 1 ter — LE MASQUAGE SE RATTRAPE (relecture humaine du 2026-08-10).
            La croix ✕ n'avait aucun retour : le devoir quittait l'agenda définitivement, et Papa
            lui-même ne pouvait que le ressaisir. Le §2c tranchait « masquer ≠ supprimer », il
            n'avait rien dit de l'irréversibilité.

            🔴 **Un retour APRÈS le geste, jamais une confirmation AVANT.** Un dialogue mettrait
            une friction sur chaque masquage, y compris les bons, sur l'écran d'un enfant qui a
            le droit de ranger son agenda. Et il ne servirait à rien quand le geste est
            volontaire puis regretté.

            ⚠️ Placé ici, sous la bande, et non à l'emplacement de la carte : la carte peut être
            dans un repli (« la suite ») ou dans une section qu'on ne regarde pas. Une bande
            visible d'un seul endroit se retrouve toujours. */}
        {agenda.undoable && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-zetis-border bg-zetis-surface px-4 py-2.5">
            <p className="min-w-0 truncate text-sm text-zetis-muted">
              Masqué : <span className="text-slate-200">{agenda.undoable.label}</span>
            </p>
            <button
              type="button"
              onClick={agenda.undoDismiss}
              className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-100 transition-colors hover:border-violet-400/45 motion-reduce:transition-none"
            >
              Annuler
            </button>
          </div>
        )}

        {/* 2 — Composer : ABSENT en Lot 1 (rien n'occupe cet espace, rien ne le grise). */}

        {/* 3 — Aujourd'hui · Demain, dépliées. **Sautées quand le panneau porte déjà ce
            jour-là** : la réponse à un tap ne se double pas d'une section identique (§17.1). */}
        {!openIsToday && (
          <Section title="Aujourd'hui" registre="present">
            {today.length === 0 ? (
              // Ligne calme : jamais « ajoute tes devoirs » — en phase 0 il ne le peut pas, et
              // l'y inviter serait une impasse.
              <Calm>Rien de noté pour aujourd'hui.</Calm>
            ) : (
              // Le plan se passe à TOUTES les sections, sans exception de section : c'est le
              // SERVEUR qui décide où il y en a un (jours à venir seulement), et le recopier ici
              // en règle d'affichage ferait une seconde source de vérité. « À reprendre » n'en
              // reçoit donc jamais, sans qu'on l'ait écrit nulle part.
              today.map((item) => (
                <AgendaItemRow
                  key={item.id}
                  item={item}
                  onToggle={() => agenda.toggleDone(item)}
                  onDismiss={() => agenda.dismiss(item)}
                  planSteps={agenda.planByItem[item.id]}
                  onToggleStep={agenda.toggleStep}
                />
              ))
            )}
          </Section>
        )}

        {/* 🔴 **« DEMAIN » VIDE NE SE REND PLUS** (Amdt 9 §D11, décision du commanditaire du
            2026-08-17), et l'asymétrie avec « Aujourd'hui » **est** la décision :

            · « Aujourd'hui » vide dit toujours *« Rien de noté pour aujourd'hui. »* — c'est une
              information sur MAINTENANT, celle que Massimo vient chercher en ouvrant la page ;
            · « Demain » vide ne dit plus rien. La bande ou la grille, juste au-dessus, montrent
              déjà la cellule de demain sans échéance : la section répétait ce fait en **60 px**.

            Le motif est mesuré, pas esthétique : en vue mois, ces 60 px étaient **exactement** ce
            qui manquait pour que « Prendre de l'avance » passe au-dessus de la ligne de flottaison
            (893 pour une fenêtre de 856).

            ⚠️ Ce n'est PAS une entorse au §17 (*« un vide confirmé est une réponse »*) : cette
            règle vaut pour les surfaces qu'on DEMANDE — le panneau d'un jour qu'on ouvre, le toast
            qu'on survole — où le silence se lit comme une panne. Une section permanente n'est pas
            demandée, et « En retard » ne se rend déjà pas quand elle est vide. C'est
            « Aujourd'hui / Demain » qui faisaient exception, pas l'inverse. */}
        {!openIsTomorrow && tomorrow.length > 0 && (
          <Section title="Demain" registre="present">
            {tomorrow.map((item) => (
              <AgendaItemRow
                key={item.id}
                item={item}
                onToggle={() => agenda.toggleDone(item)}
                onDismiss={() => agenda.dismiss(item)}
                planSteps={agenda.planByItem[item.id]}
                onToggleStep={agenda.toggleStep}
              />
            ))}
          </Section>
        )}

        {/* ── DEUX SECTIONS ONT ÉTÉ RETIRÉES ICI (ADR-0025 Amendement 8 §D8, §D6-f) ───────────
            **« La suite »** — repliée par défaut, elle CACHAIT tout ce qui va de J+2 à J+13.
            Un mardi ordinaire, l'écran visible affichait deux « Rien de noté » alors que la page
            détenait l'information. C'était la plainte « pauvre sur le plan efficacité », au mot
            près. Les deux vues la rendent redondante : la bande et la grille montrent d'un coup
            d'œil ce qu'elle repliait, et le tap ouvre le jour.

            **« Ce qui arrive »** — contrôles et rendus, avec leur `days_left`. Elle portait le
            dernier décompte CHIFFRÉ de la page, que la grille remplace par une distance
            spatiale : même information, sans nombre. Et contrôles et rendus ont désormais une
            silhouette (`◆`, `▲`) repérable sans liste.

            🔴 **RIEN d'autre n'a été supprimé, et il ne faut rien supprimer d'autre.**
            `UpcomingCard.tsx`, son test, `GET /api/student/agenda/upcoming`,
            `AgendaUpcomingItem`, `days_left` et `has_plan` sont **tous vivants** :
            `SubjectSideRail` rend le même composant, `HomeAgendaBanner` et `useSubjectUpcoming`
            appellent la même route. Le cadrage de cet amendement affirmait que la route perdrait
            son seul consommateur — **c'était faux**, elle en a trois et deux ont survécu.
            Nettoyer plus loin casserait l'Accueil et les deux pages Matières. */}

        {/* 5 — PRENDRE DE L'AVANCE : la troisième question (Amdt 9 §D1).
            L'agenda répond à trois questions, dans cet ordre : le PRÉSENT (Aujourd'hui, Demain),
            le PASSÉ (À reprendre), le FUTUR (ici).

            🔴 **ORDRE : présent → FUTUR → passé** (§D1, révisé le 2026-08-17 même).
            Il était présent → passé → futur, et c'était **mesurablement faux** : la section
            commençait à **1050 px** dans une fenêtre de **856**, entièrement sous la ligne de
            flottaison, derrière une grille de 493 px et un « À reprendre » de 403. Une réponse
            qu'il faut chercher n'en est pas une — c'est le défaut de « La suite », repliée par
            défaut, déplacé de dix centimètres.

            ⚠️ Ce que la révision NE change pas : la page ne s'ouvre toujours pas sur le retard.
            Le présent garde la tête ; c'est le passé qui descend, pas le futur qui le double.

            ⚠️ Le bloc est ANCRÉ sur la prochaine échéance, il n'empile pas quatre listes : quatre
            listes de choses à faire grossissent quand Massimo ne vient pas. */}
        {agenda.ahead && (
          <Section title="Prendre de l'avance" registre="futur">
            <AheadBlock
              ahead={agenda.ahead}
              onOpenNotion={openNotion}
              onOpenDay={(date) => pickDay(date)}
            />
          </Section>
        )}

        {/* 6 — EN RETARD (ex-« À reprendre ») : TROIS d'emblée, le reste derrière un dépliage
            (addendum §17).

            🔴 **Le titre est devenu un BADGE « En retard »** le 2026-08-17, sur demande du
            commanditaire (Amdt 9 §D9) — même forme que le badge du toast (§D17), pas une seconde.
            C'est la **quatrième** révocation du §7 dans le même sens en une journée : le mot dans
            le toast, l'ambre des cellules, l'ordre qui met le passé en dernier, ce titre. Écrit
            comme tel dans l'ADR, pas glissé.

            ⚠️ Ce qui reste interdit, et qui n'a PAS bougé : le rouge, le compteur d'arriéré, le
            total, la série. Le nombre n'apparaît toujours QUE sur le bouton de dépliage.
            Le plafond protégeait d'un écran qui s'allonge tout seul ; il rendait aussi les plus
            anciens inaccessibles. Le dépliage est un GESTE de Massimo — la section ne grossit
            toujours pas sans qu'il le demande. */}
        {resumeShown.length > 0 && (
          <Section title="En retard" registre="passe" badge>
            {(resumeOpen ? resumeShown : resumeShown.slice(0, RESUME_MAX)).map((item) => (
              <AgendaItemRow
                key={item.id}
                item={item}
                showDate
                tone="resume"
                onToggle={() => agenda.toggleDone(item)}
                onDismiss={() => agenda.dismiss(item)}
                planSteps={agenda.planByItem[item.id]}
                onToggleStep={agenda.toggleStep}
              />
            ))}
            {/* ⚠️ Le nombre n'apparaît QUE sur le bouton de dépliage, jamais comme un compteur
                posé à côté du titre : « À reprendre · 8 » serait le compteur d'arriéré que le §7
                interdit. Ici il dit ce que le geste va ouvrir, et il disparaît une fois ouvert. */}
            {!resumeOpen && resumeShown.length > RESUME_MAX && (
              <button
                type="button"
                onClick={() => setResumeOpen(true)}
                className="self-start rounded-lg px-1 py-1 text-xs text-zetis-muted underline-offset-2 transition-colors hover:text-white hover:underline motion-reduce:transition-none"
              >
                voir {resumeShown.length - RESUME_MAX} autre
                {resumeShown.length - RESUME_MAX > 1 ? "s" : ""} ▾
              </button>
            )}
          </Section>
        )}

        {/* ⚠️ **La phrase d'agenda vide a été RETIRÉE ici** (Amdt 9). Elle disait : « Ton agenda
            est vide pour l'instant. Tu peux quand même avancer : une révision, une mission, une
            notion à te faire expliquer. » — c'est-à-dire exactement ce que le bloc ci-dessus
            propose désormais, mais **sans aucune porte** : trois pistes nommées, aucune
            cliquable. Le bloc dit la même chose et l'ouvre. La garder ferait deux réponses à la
            même question, dont la moins utile en dernier. */}
      </div>

      {/* 🔴 **L'alerte de retard à l'ouverture** (Amdt 9 §D12) — le cinquième signal, et le seul
          qui vienne sans être demandé. Ce qui le rend acceptable tient en trois bornes, toutes
          côté SERVEUR sauf la dernière : du NOUVEAU retard seulement, une fois par jour, une
          échéance nommée sans aucun nombre. Éphémère et non bloquant.

          ⚠️ Rendu HORS de la colonne de contenu : `position: fixed` en bas d'écran. Il ne pousse
          rien, ne décale rien, et n'entre donc pas dans le budget vertical qui a coûté trois
          corrections aujourd'hui. */}
      <LateAlertToast
        alerte={agenda.lateAlert}
        onShown={agenda.markLateAlertSeen}
        onOpenDay={pickDay}
      />
    </div>
  );
}

/** Une section, et **son registre dans le temps** (Amdt 9 §D7).
 *
 *  🔴 **Les trois teintes viennent du CALENDRIER, aucune n'est neuve** : le cyan d'aujourd'hui,
 *  l'orange des cellules à venir, l'ambre des jours passés non faits. Les deux moitiés de la page
 *  disent donc la même chose avec le même code — Massimo n'en apprend pas un second.
 *
 *  🔴 **Un rail de 2 px, jamais un aplat.** Un fond ambre sur « À reprendre » ferait un bloc
 *  teinté permanent en bas de page, c'est-à-dire le compteur d'arriéré du §7 obtenu par la
 *  surface au lieu du nombre. Le rail marque, il ne pèse pas.
 *
 *  ⚠️ Le titre garde sa couleur d'origine sur les trois : c'est **le rail** qui porte le registre.
 *  Trois couleurs de titre feraient trois voix différentes pour la même page. */
function Section({
  title,
  registre,
  badge,
  children,
}: {
  title: string;
  registre: AgendaRegistre;
  /** Rend le titre sous forme de **badge**, et non de simple capitale.
   *
   *  🔴 Réservé au registre du PASSÉ, par décision du commanditaire du 2026-08-17 (Amdt 9 §D9) :
   *  *« À reprendre = passé : replace par en RETARD dans un badge »*. La forme est **exactement**
   *  celle du badge du toast (§D17) — cadre ambre, fond à 15 %, capitales. Deux surfaces qui
   *  disent la même chose la disent pareil ; une seconde forme pour le même sens serait un
   *  second vocabulaire. */
  badge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4" data-registre={registre}>
      <p
        className={`mb-2 border-l-2 pl-2 text-xs font-semibold uppercase tracking-wide ${
          badge ? "" : "text-zetis-accent-2"
        }`}
        style={{ borderColor: REGISTRE_TEINTE[registre] }}
      >
        {badge ? (
          // 🔴 **Il RESPIRE** (Amdt 9 §D10) — 3 s, ease-in-out, amplitude faible. Une respiration
          // accroche l'œil ; un clignotement le harcèle, et c'est l'écran d'un enfant.
          //
          // ⚠️ **C'est l'exception qui confirme le §D18, pas son abandon** : l'animation reste la
          // marque de ce qu'on REGARDE — un badge unique — jamais de ce qu'on BALAIE. Les trente
          // cellules ambre de la grille demeurent strictement statiques, et un test le balaie.
          //
          // `motion-safe:` : sous `prefers-reduced-motion`, rien ne bouge et le badge garde son
          // cadre et son fond. **Le signal survit sans le mouvement** — c'est un signal, pas un
          // ornement.
          <span className="inline-flex items-center rounded-md border border-amber-400/70 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 motion-safe:[animation:agenda-retard-badge_3s_ease-in-out_infinite]">
            {title}
          </span>
        ) : (
          title
        )}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Calm({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-sm text-zetis-muted">{children}</p>;
}
