import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ROLE_HOME } from "./api/auth.js";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import RequireAuth from "./components/RequireAuth.js";
import AppShell from "./components/AppShell.js";
import Login from "./pages/Login.js";
import ChangePassword from "./pages/ChangePassword.js";
import Account from "./pages/Account.js";
import MyTickets from "./pages/MyTickets.js";
import CreateTicket from "./pages/CreateTicket.js";
import RequesterTicketDetail from "./pages/RequesterTicketDetail.js";
import App from "./App.js";

/** Sends a signed-in person to the landing screen of their own role. */
function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Navigate to={ROLE_HOME[user.role]} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Reachable while the initial password is still in place (BR-02). */}
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        }
      />

      {/* Lab 1 vertical-slice page, kept reachable for its demo. */}
      <Route path="/system-check" element={<App />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/account" element={<Account />} />
      </Route>

      <Route
        element={
          <RequireAuth allow={["REQUESTER"]}>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/tickets/new" element={<CreateTicket />} />
        <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
      </Route>

      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}

export default function AppRoot() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
