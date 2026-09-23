import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import QuotationsPage from "./pages/QuotationsPage";
import QuotationDetailPage from "./pages/QuotationDetailPage";
import WinLossPage from "./pages/WinLossPage";
import PublicQuotePage from "./pages/PublicQuotePage";
import DocumentsPage from "./pages/DocumentsPage";
import PlaybookPage from "./pages/PlaybookPage";
import ClientsPage from "./pages/ClientsPage";
import UsersPage from "./pages/UsersPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import RequestPasswordResetPage from "./pages/RequestPasswordResetPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

function RequireAuth({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function QuotationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  /* istanbul ignore next */
  if (!id) return <Navigate to="/quotations" replace />;
  return <QuotationDetailPage id={id} onBack={() => navigate("/quotations")} />;
}

function QuotationsRoute() {
  const navigate = useNavigate();
  return <QuotationsPage onSelect={(id) => navigate(`/quotations/${id}`)} />;
}

function DefaultRedirect() {
  const { user } = useAuth();
  useEffect(() => {}, [user]);
  /* istanbul ignore next */
  if (!user) return null;
  return (
    <Navigate
      to={user.role === "SALES_REP" ? "/quotations" : "/dashboard"}
      replace
    />
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/reset-password" element={<RequestPasswordResetPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/view-quotation/:token" element={<PublicQuotePage />} />
      <Route
        path="*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<DefaultRedirect />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/quotations" element={<QuotationsRoute />} />
                <Route
                  path="/quotations/:id"
                  element={<QuotationDetailRoute />}
                />
                <Route path="/clients" element={<ClientsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/winloss" element={<WinLossPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/playbook" element={<PlaybookPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
