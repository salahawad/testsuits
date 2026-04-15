import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Milestones } from "./pages/Milestones";
import { Matrix } from "./pages/Matrix";
import { SuiteDetail } from "./pages/SuiteDetail";
import { CaseDetail } from "./pages/CaseDetail";
import { Runs } from "./pages/Runs";
import { RunDetail } from "./pages/RunDetail";
import { Team } from "./pages/Team";
import { CompanySettings } from "./pages/CompanySettings";
import { SsoSettings } from "./pages/SsoSettings";
import { Audit } from "./pages/Audit";
import { ProjectSettings } from "./pages/ProjectSettings";
import { Tokens } from "./pages/Tokens";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { AcceptInvite } from "./pages/AcceptInvite";
import { Requirements } from "./pages/Requirements";

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  // Users stored before the multi-tenant migration have no .company — force a fresh login.
  if (user && !user.company) {
    logout();
    return <Navigate to="/login" replace />;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset/:token" element={<ResetPassword />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/projects" element={<Protected><Projects /></Protected>} />
      <Route path="/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
      <Route path="/projects/:id/milestones" element={<Protected><Milestones /></Protected>} />
      <Route path="/projects/:id/settings" element={<Protected><ProjectSettings /></Protected>} />
      <Route path="/projects/:id/requirements" element={<Protected><Requirements /></Protected>} />
      <Route path="/suites/:id" element={<Protected><SuiteDetail /></Protected>} />
      <Route path="/cases/:id" element={<Protected><CaseDetail /></Protected>} />
      <Route path="/runs" element={<Protected><Runs /></Protected>} />
      <Route path="/runs/:id" element={<Protected><RunDetail /></Protected>} />
      <Route path="/matrix" element={<Protected><Matrix /></Protected>} />
      <Route path="/team" element={<Protected><Team /></Protected>} />
      <Route path="/tokens" element={<Protected><Tokens /></Protected>} />
      <Route path="/company" element={<Protected><CompanySettings /></Protected>} />
      <Route path="/sso" element={<Protected><SsoSettings /></Protected>} />
      <Route path="/audit" element={<Protected><Audit /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
