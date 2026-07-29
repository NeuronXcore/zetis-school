import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "@zetis/auth";
import { PapaLayout } from "./layouts/PapaLayout";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AgendaPapaPage } from "./pages/AgendaPapaPage";
import { ProgressionPage } from "./pages/ProgressionPage";
import { LacunesPage } from "./pages/LacunesPage";
import { MissionsPage } from "./pages/MissionsPage";
import { DiagnosticsPapaPage } from "./pages/DiagnosticsPapaPage";
import { ConseilClasseIAPage } from "./pages/ConseilClasseIAPage";
import { CahierBordPage } from "./pages/CahierBordPage";
import { CouverturePage } from "./pages/CouverturePage";
import { AnneesScolairesPage } from "./pages/AnneesScolairesPage";
import { MatieresPapaPage } from "./pages/MatieresPage";
import { ProgrammePage } from "./pages/ProgrammePage";
import { CartesRevisionPage } from "./pages/CartesRevisionPage";
import { QuizPilotagePage } from "./pages/QuizPilotagePage";
import { SourcesRagPage } from "./pages/SourcesRagPage";
import { CapsulesPilotagePage } from "./pages/CapsulesPilotagePage";
import { FichesPilotagePage } from "./pages/FichesPilotagePage";
import { MindmapsPilotagePage } from "./pages/MindmapsPilotagePage";
import { ModeFocusPage } from "./pages/ModeFocusPage";
import { ParametresPage } from "./pages/ParametresPage";

// Routes Papa (Étape 8) : login public + cockpit protégé avec les premières pages.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth fallback={<div className="p-6 text-papa-muted">Chargement…</div>}>
            <PapaLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/agenda" element={<AgendaPapaPage />} />
        <Route path="/progression" element={<ProgressionPage />} />
        <Route path="/lacunes" element={<LacunesPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/diagnostics" element={<DiagnosticsPapaPage />} />
        <Route path="/conseil" element={<ConseilClasseIAPage />} />
        <Route path="/cahier" element={<CahierBordPage />} />
        <Route path="/couverture" element={<CouverturePage />} />
        <Route path="/annees" element={<AnneesScolairesPage />} />
        <Route path="/programme" element={<ProgrammePage />} />
        <Route path="/cartes-revision" element={<CartesRevisionPage />} />
        <Route path="/quiz" element={<QuizPilotagePage />} />
        <Route path="/matieres" element={<MatieresPapaPage />} />
        <Route path="/sources" element={<SourcesRagPage />} />
        <Route path="/capsules" element={<CapsulesPilotagePage />} />
        <Route path="/fiches" element={<FichesPilotagePage />} />
        <Route path="/mindmaps" element={<MindmapsPilotagePage />} />
        <Route path="/focus" element={<ModeFocusPage />} />
        <Route path="/parametres" element={<ParametresPage />} />
        <Route path="*" element={<PlaceholderPage title="Page introuvable" icon="🔍" />} />
      </Route>
    </Routes>
  );
}
