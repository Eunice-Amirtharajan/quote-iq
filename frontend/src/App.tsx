import { AuthProvider } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import { useAuth } from "./hooks/useAuth";

function AppContent() {
  const { user } = useAuth();

  if (!user) return <LoginPage />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
        <p className="text-gray-500">{user.role}</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
