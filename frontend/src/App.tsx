import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/app-shell";
import { AlertsPage } from "./pages/alerts-page";
import { DashboardPage } from "./pages/dashboard-page";
import { HistoryPage } from "./pages/history-page";
import { SensorDetailPage } from "./pages/sensor-detail-page";

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/sensors/:sensorId" element={<SensorDetailPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Routes>
    </AppShell>
  );
}

export default App;
