
import { useQuery } from "@apollo/client/react";
import { CLIENTS_QUERY } from "../graphql/queries";

interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
}

export default function ClientsPage() {
  const { data, loading, error } = useQuery<{ clients: Client[] }>(
    CLIENTS_QUERY,
  );

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );

  if (error)
    return (
      <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
        Failed to load clients
      </div>
    );

  const clients = data?.clients ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Clients</h2>
        <span className="text-sm text-gray-400">{clients.length} total</span>
      </div>

      {clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">No clients yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Name
                </th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Company
                </th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Email
                </th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Location
                </th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Added
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {c.name}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{c.company}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500">{c.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500">
                      {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {new Date(c.createdAt).toLocaleDateString("en-DE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
