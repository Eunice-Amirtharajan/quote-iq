import { NavLink, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client/react";
import { LOGOUT_MUTATION } from "../graphql/mutations";
import { useAuth } from "../hooks/useAuth";
import { client } from "../lib/apollo";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard", roles: ["SALES_MANAGER"] },
  { label: "Quotations", to: "/quotations", roles: ["SALES_REP", "SALES_MANAGER"] },
  { label: "Win/Loss", to: "/winloss", roles: ["SALES_MANAGER"] },
  { label: "Documents", to: "/documents", roles: ["SALES_MANAGER"] },
  { label: "Playbook", to: "/playbook", roles: ["SALES_REP", "SALES_MANAGER"] },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: Readonly<LayoutProps>) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [logout] = useMutation(LOGOUT_MUTATION, {
    onCompleted: () => {
      setUser(null);
      navigate("/");
      /* v8 ignore next */
      void client.clearStore().catch(() => {});
    },
  });
  const visibleNav = NAV_ITEMS.filter((item) =>
    item.roles.includes(user?.role ?? ""),
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-lg font-semibold text-gray-900">QuoteIQ</h1>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
          <p className="text-xs font-medium text-gray-900 truncate">
            {user?.name}
          </p>
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
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
