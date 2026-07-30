import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "@zetis/auth";
import { MassimoLayout } from "./layouts/MassimoLayout";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { AccueilMassimoPage } from "./pages/AccueilMassimoPage";
import { AgendaPage } from "./pages/AgendaPage";
import { MatieresPage } from "./pages/MatieresPage";
import { MatiereDetailPage } from "./pages/MatiereDetailPage";
import { CoursPage } from "./pages/CoursPage";
import { RevisionPage } from "./pages/RevisionPage";
import { RevisionSessionPage } from "./pages/RevisionSessionPage";
import { FichesPage } from "./pages/FichesPage";
import { FicheSubjectPage } from "./pages/FicheSubjectPage";
import { QuizPage } from "./pages/QuizPage";
import { QuizSessionPage } from "./pages/QuizSessionPage";
import { DiagnosticPage } from "./pages/DiagnosticPage";
import { Eli5Page } from "./pages/Eli5Page";
import { MindmapsPage } from "./pages/MindmapsPage";
import { MindmapSubjectPage } from "./pages/MindmapSubjectPage";
import { CapsulesIAPage } from "./pages/CapsulesIAPage";
import { MissionsPage } from "./pages/MissionsPage";
import { ProgressionPage } from "./pages/ProgressionPage";
import { ChatPage } from "./pages/ChatPage";

// Routes Massimo (Étape 7) : login public + espace protégé avec les premières pages.
// Quiz / Chat restent des placeholders (étapes ultérieures) ; Missions est branché (Étape 15).
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth fallback={<div className="p-6 text-zetis-muted">Chargement…</div>}>
            <MassimoLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AccueilMassimoPage />} />
        {/* Agenda (ADR-0025) : DEUX accès, décidés par le commanditaire le 2026-07-29 —
            entrée de sidebar en position 2 ET résumé sur l'Accueil. La spec de page prévoyait
            l'accès par le seul bandeau en phase 0 ; cf. son §Accès, mis à jour. */}
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/matieres" element={<MatieresPage />} />
        <Route path="/subjects/:slug" element={<MatiereDetailPage />} />
        <Route path="/subjects/:slug/cours" element={<CoursPage />} />
        <Route path="/revision" element={<RevisionPage />} />
        <Route path="/revision/session" element={<RevisionSessionPage />} />
        <Route path="/fiches" element={<FichesPage />} />
        <Route path="/fiches/:slug" element={<FicheSubjectPage />} />
        <Route path="/diagnostic" element={<DiagnosticPage />} />
        <Route path="/eli5" element={<Eli5Page />} />
        <Route path="/mindmaps" element={<MindmapsPage />} />
        {/* Deep-link mission (ADR-0019) : ouvre une carte par id directement en mode Reconstruire. */}
        <Route path="/mindmaps/reconstruire/:mindmapId" element={<MindmapSubjectPage />} />
        <Route path="/mindmaps/:slug" element={<MindmapSubjectPage />} />
        <Route path="/capsules" element={<CapsulesIAPage />} />
        <Route path="/progression" element={<ProgressionPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/quiz/session" element={<QuizSessionPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        {/* Chat ZETIS (ADR-0026 slice B, Lot 1 texte + avatar). Réponse INLINE (pas de polling
            /ai/jobs : le verbatim ne transite jamais par une couche durable, §1c). */}
        <Route path="/chat" element={<ChatPage />} />
        <Route path="*" element={<PlaceholderPage title="Page introuvable" icon="🔍" />} />
      </Route>
    </Routes>
  );
}
