import { Routes, Route } from "react-router-dom";
import { PapaLayout } from "./layouts/PapaLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { PAPA_NAV } from "./lib/navigation";

// Routes Papa (Étape 3) : dashboard réel + placeholders pour les autres entrées.
export default function App() {
  return (
    <Routes>
      <Route element={<PapaLayout />}>
        <Route index element={<DashboardPage />} />
        {PAPA_NAV.filter((item) => item.to !== "/").map((item) => (
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
