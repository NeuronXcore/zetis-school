import { useEffect, useState } from "react";
import { fetchGamificationSummary } from "../lib/gamification";
import {
  type Capsule,
  type Subject,
  PROFILE,
  RECOMMENDED_CAPSULE,
  SUBJECTS,
} from "../data/mock";

// Hook de données de la page Matières. Toute la logique (API + dérivations) vit ici :
// le composant reste purement présentationnel.
//
// Branché en direct : gamification/summary (niveau, XP, série).
// Encore mockés (endpoints inexistants côté backend) : liste des matières, objectifs
// de la semaine, capsule recommandée. Mock typé + fallback isolés ici — aucune donnée
// pédagogique durable stockée côté front.

export interface Progression {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  totalXp: number;
  levelProgress: number; // 0–100
  streakDays: number;
}

export interface WeeklyObjectives {
  done: number;
  total: number;
}

export interface MatieresData {
  loading: boolean;
  error: string | null;
  /** true quand la gamification a répondu (sinon valeurs de repli). */
  live: boolean;
  progression: Progression;
  subjects: Subject[];
  recommendedCapsule: Capsule;
  weekly: WeeklyObjectives;
  bestSubject: Subject;
}

// Repli si la gamification n'a pas (encore) répondu : valeurs du profil mocké.
const FALLBACK_PROGRESSION: Progression = {
  level: PROFILE.level,
  xpIntoLevel: PROFILE.xp,
  xpForNext: PROFILE.nextLevelXp,
  totalXp: PROFILE.xp,
  levelProgress: Math.round((PROFILE.xp / PROFILE.nextLevelXp) * 100),
  streakDays: PROFILE.streakDays,
};

// TODO(api) : remplacer par GET /api/subjects (maîtrise par matière en direct).
const MOCK_SUBJECTS = SUBJECTS;
// TODO(api) : remplacer par l'endpoint « objectifs de la semaine ».
const MOCK_WEEKLY: WeeklyObjectives = { done: PROFILE.consolidatedThisWeek, total: 5 };
// TODO(api) : remplacer par l'endpoint « capsule recommandée ».
const MOCK_CAPSULE = RECOMMENDED_CAPSULE;

// Meilleure matière = progression la plus avancée (dérivé du mock tant que la
// maîtrise par matière n'est pas exposée par la gamification).
function pickBestSubject(subjects: Subject[]): Subject {
  return subjects.reduce((best, s) => (s.progress > best.progress ? s : best), subjects[0]);
}

export function useMatieres(): MatieresData {
  const [progression, setProgression] = useState<Progression>(FALLBACK_PROGRESSION);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchGamificationSummary()
      .then((s) => {
        if (!active) return;
        setProgression({
          level: s.level,
          xpIntoLevel: s.xp_into_level,
          xpForNext: s.xp_for_next,
          totalXp: s.total_xp,
          levelProgress:
            s.xp_for_next > 0 ? Math.round((s.xp_into_level / s.xp_for_next) * 100) : 0,
          streakDays: s.streak_days,
        });
        setLive(true);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Erreur de chargement");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    loading,
    error,
    live,
    progression,
    subjects: MOCK_SUBJECTS,
    recommendedCapsule: MOCK_CAPSULE,
    weekly: MOCK_WEEKLY,
    bestSubject: pickBestSubject(MOCK_SUBJECTS),
  };
}
