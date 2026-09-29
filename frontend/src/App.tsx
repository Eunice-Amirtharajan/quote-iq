import { lazy, Suspense, useEffect } from "react";
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
import { lazyWithPreload } from "./lib/lazy-with-preload";

// Route-level code splitting: each page is its own chunk, so the first download is
// just the shell (router, Apollo, auth, layout, login). Heavy page dependencies —
// Recharts and D3 on the dashboard — load only when that route is visited.
// LoginPage stays eager: it is the first screen for every signed-out visit.
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const QuotationsPage = lazy(() => import("./pages/QuotationsPage"));
// Preloaded from the list (see QuotationsRoute): creating or opening a quote navigates
// here, and without the chunk ready the list would stay on screen while it downloads.
const QuotationDetailPage = lazyWithPreload(() => import("./pages/QuotationDetailPage"));
const WinLossPage = lazy(() => import("./pages/WinLossPage"));
const PublicQuotePage = lazy(() => import("./pages/PublicQuotePage"));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage"));
const PlaybookPage = lazy(() => import("./pages/PlaybookPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
const RequestPasswordResetPage = lazy(() => import("./pages/RequestPasswordResetPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64" role="status">
      <p className="text-gray-400 text-sm">Loading…</p>
    </div>
  );
}

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
  useEffect(() => {
    // Fire-and-forget: a failed preload is retried when the route actually renders
    QuotationDetailPage.preload().catch(() => {});
  }, []);
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
    <Suspense fallback={<PageLoader />}>
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
                {/* Inner boundary keeps the nav visible while a page chunk loads */}
                <Suspense fallback={<PageLoader />}>
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
                </Suspense>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </Suspense>
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
