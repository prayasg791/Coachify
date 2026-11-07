import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { roleHome } from "../../navigation.js";

export function ProtectedRoute({ allowedRoles }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return <Outlet />;
}
