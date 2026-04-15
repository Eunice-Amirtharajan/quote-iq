import { useState } from "react";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import QuotationsPage from "./pages/QuotationsPage";

function AppContent() {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");

  if (!user) return <LoginPage />;

  const renderPage = () => {
     switch (currentPage) {
    case 'dashboard':  return <DashboardPage />;
    case 'quotations': return <QuotationsPage />;
    default:           return <p className="text-gray-400">Coming soon</p>;
  }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
