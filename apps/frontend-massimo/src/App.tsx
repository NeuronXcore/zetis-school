import { Routes, Route } from "react-router-dom";
import { MassimoLayout } from "./layouts/MassimoLayout";
import { HomePage } from "./pages/HomePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { MASSIMO_NAV } from "./lib/navigation";

// Routes Massimo (Étape 2) : accueil réel + placeholders pour les autres entrées.
export default function App() {
  return (
    <Routes>
      <Route element={<MassimoLayout />}>
        <Route index element={<HomePage />} />
        {MASSIMO_NAV.filter((item) => item.to !== "/").map((item) => (
          <Route
            key={item.to}
            path={item.to}
            element={<PlaceholderPage title={item.label} icon={item.icon} />}
          />
        ))}
        <Route path="*" element={<PlaceholderPage title="Page introuvable" icon="🔍" />} />
      </Route>
    </Routes>
  );
}
