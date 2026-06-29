import { Routes, Route } from "react-router-dom";
import { MassimoLayout } from "./layouts/MassimoLayout";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AccueilMassimoPage } from "./pages/AccueilMassimoPage";
import { MatieresPage } from "./pages/MatieresPage";
import { MatiereDetailPage } from "./pages/MatiereDetailPage";
import { DiagnosticPage } from "./pages/DiagnosticPage";
import { Eli5Page } from "./pages/Eli5Page";
import { MindmapsPage } from "./pages/MindmapsPage";
import { CapsulesIAPage } from "./pages/CapsulesIAPage";
import { ProgressionPage } from "./pages/ProgressionPage";

// Routes Massimo (Étape 7) : login public + espace protégé avec les premières pages.
// Quiz / Missions / Chat restent des placeholders (étapes ultérieures).
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <MassimoLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AccueilMassimoPage />} />
        <Route path="/matieres" element={<MatieresPage />} />
        <Route path="/subjects/:slug" element={<MatiereDetailPage />} />
        <Route path="/diagnostic" element={<DiagnosticPage />} />
        <Route path="/eli5" element={<Eli5Page />} />
        <Route path="/mindmaps" element={<MindmapsPage />} />
        <Route path="/capsules" element={<CapsulesIAPage />} />
        <Route path="/progression" element={<ProgressionPage />} />
        <Route path="/quiz" element={<PlaceholderPage title="Quiz" icon="✅" />} />
        <Route path="/missions" element={<PlaceholderPage title="Missions" icon="🎯" />} />
        <Route path="/chat" element={<PlaceholderPage title="Chat ZETIS" icon="💬" />} />
        <Route path="*" element={<PlaceholderPage title="Page introuvable" icon="🔍" />} />
      </Route>
    </Routes>
  );
}
