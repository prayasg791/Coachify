import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout.jsx";
import { ProtectedRoute } from "./components/routing/ProtectedRoute.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { WorkspacePage } from "./pages/WorkspacePage.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { roleHome } from "./navigation.js";

function SignedInRedirect() {
  const { user } = useAuth();
  return <Navigate to={roleHome(user?.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route element={<ProtectedRoute allowedRoles={["PARENT"]} />}>
            <Route path="/parent/*" element={<WorkspacePage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["ACCOUNTS"]} />}>
            <Route path="/accounts/*" element={<WorkspacePage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["COUNSELLOR"]} />}>
            <Route path="/counsellor/*" element={<WorkspacePage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<SignedInRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
