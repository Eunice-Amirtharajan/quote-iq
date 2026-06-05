import { useState, useEffect, useRef } from "react";
import { AuthProvider } from "./context/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import QuotationsPage from "./pages/QuotationsPage";
import ClientsPage from "./pages/ClientsPage";
import QuotationDetailPage from "./pages/QuotationDetailPage";

function AppContent() {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && user.id !== lastUserIdRef.current) {
      lastUserIdRef.current = user.id;
      setCurrentPage(user.role === "SALES_REP" ? "quotations" : "dashboard");
    }
    if (!user) lastUserIdRef.current = null;
  }, [user]);

  if (!user) return <LoginPage />;

  const renderPage = () => {
    if (selectedQuoteId) {
      return (
        <QuotationDetailPage
          id={selectedQuoteId}
          onBack={() => setSelectedQuoteId(null)}
        />
      );
    }

    switch (currentPage) {
      case "dashboard":
        if (user.role === "SALES_REP") return <QuotationsPage onSelect={setSelectedQuoteId} />;
        return <DashboardPage />;
      case "quotations":
        return <QuotationsPage onSelect={setSelectedQuoteId} />;
      case "clients":
        return <ClientsPage />;
      default:
        return <p className="text-gray-400">Coming soon</p>;
    }
  };

  return (
    <Layout
      currentPage={selectedQuoteId ? "quotations" : currentPage}
      onNavigate={(page) => {
        setSelectedQuoteId(null);
        setCurrentPage(page);
      }}
    >
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
