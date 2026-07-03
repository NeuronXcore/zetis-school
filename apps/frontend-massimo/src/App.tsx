import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "@zetis/auth";
import { MassimoLayout } from "./layouts/MassimoLayout";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { AccueilMassimoPage } from "./pages/AccueilMassimoPage";
import { MatieresPage } from "./pages/MatieresPage";
import { MatiereDetailPage } from "./pages/MatiereDetailPage";
import { CoursPage } from "./pages/CoursPage";
import { DiagnosticPage } from "./pages/DiagnosticPage";
import { Eli5Page } from "./pages/Eli5Page";
import { MindmapsPage } from "./pages/MindmapsPage";
import { CapsulesIAPage } from "./pages/CapsulesIAPage";
import { MissionsPage } from "./pages/MissionsPage";
import { ProgressionPage } from "./pages/ProgressionPage";

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
        <Route path="/matieres" element={<MatieresPage />} />
        <Route path="/subjects/:slug" element={<MatiereDetailPage />} />
        <Route path="/subjects/:slug/cours" element={<CoursPage />} />
        <Route path="/diagnostic" element={<DiagnosticPage />} />
        <Route path="/eli5" element={<Eli5Page />} />
        <Route path="/mindmaps" element={<MindmapsPage />} />
        <Route path="/capsules" element={<CapsulesIAPage />} />
        <Route path="/progression" element={<ProgressionPage />} />
        <Route path="/quiz" element={<PlaceholderPage title="Quiz" icon="✅" />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/chat" element={<PlaceholderPage title="Chat ZETIS" icon="💬" />} />
        <Route path="*" element={<PlaceholderPage title="Page introuvable" icon="🔍" />} />
      </Route>
    </Routes>
  );
}
