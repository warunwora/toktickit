import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequesterProvider } from "./context/RequesterContext.js";
import RequireRequester from "./components/RequireRequester.js";
import AppShell from "./components/AppShell.js";
import RequesterSelection from "./pages/RequesterSelection.js";
import MyTickets from "./pages/MyTickets.js";
import CreateTicket from "./pages/CreateTicket.js";
import RequesterTicketDetail from "./pages/RequesterTicketDetail.js";
import App from "./App.js";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/select-requester" element={<RequesterSelection />} />

      {/* Lab 1 vertical-slice page, kept reachable for its demo. */}
      <Route path="/system-check" element={<App />} />

      <Route
        element={
          <RequireRequester>
            <AppShell />
          </RequireRequester>
        }
      >
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/tickets/new" element={<CreateTicket />} />
        <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
      </Route>

      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  );
}

export default function AppRoot() {
  return (
    <BrowserRouter>
      <RequesterProvider>
        <AppRoutes />
      </RequesterProvider>
    </BrowserRouter>
  );
}
