import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client/react";
import { LOGOUT_MUTATION } from "../graphql/mutations";
import { useAuth } from "../hooks/useAuth";
import { client } from "../lib/apollo";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard", roles: ["SALES_MANAGER"] },
  { label: "Quotations", to: "/quotations", roles: ["SALES_REP", "SALES_MANAGER"] },
  { label: "Clients", to: "/clients", roles: ["SALES_MANAGER"] },
  { label: "Win/Loss", to: "/winloss", roles: ["SALES_MANAGER"] },
  { label: "Documents", to: "/documents", roles: ["SALES_MANAGER"] },
  { label: "Playbook", to: "/playbook", roles: ["SALES_REP", "SALES_MANAGER"] },
  { label: "Users", to: "/users", roles: ["SALES_MANAGER"] },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: Readonly<LayoutProps>) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logout] = useMutation(LOGOUT_MUTATION, {
    onCompleted: () => {
      setUser(null);
      navigate("/login");
      /* v8 ignore next */
      void client.clearStore().catch(() => {});
    },
  });
  const visibleNav = NAV_ITEMS.filter((item) =>
    item.roles.includes(user?.role ?? ""),
  );

  const sidebarContent = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-900 truncate">{user?.name}</p>
        <p className="text-xs text-gray-400 mb-3">
          {user?.role.replace("_", " ")}
        </p>
        <button
          type="button"
          onClick={() => { logout().catch(() => {}); }}
          className="w-full text-left text-xs text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-gray-100 flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 md:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">QuoteIQ</h1>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="md:hidden text-gray-400 hover:text-gray-900 text-xl leading-none"
          >
            ×
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-900">QuoteIQ</span>
        </div>

        <main className="flex-1 p-4 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
