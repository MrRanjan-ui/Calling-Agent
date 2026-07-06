import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Calls from "./pages/Calls";
import Personas from "./pages/Personas";
import Campaigns from "./pages/Campaigns";
import Contacts from "./pages/Contacts";
import Pipelines from "./pages/Pipelines";
import Knowledge from "./pages/Knowledge";
import ToolsPage from "./pages/ToolsPage";
import Settings from "./pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/personas" element={<Personas />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
