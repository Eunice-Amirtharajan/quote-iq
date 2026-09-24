import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { CLIENTS_QUERY } from "../graphql/queries";
import { CREATE_CLIENT_MUTATION } from "../graphql/mutations";

interface Client {
  id: string;
  name: string;
  email?: string | null;
}

interface Props {
  value: string;
  onChange: (clientId: string) => void;
  canCreate?: boolean;
}

export default function ClientSelector({ value, onChange, canCreate = false }: Readonly<Props>) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = inputValue.trim() || undefined;
  const { data, previousData, loading } = useQuery<{ clients: Client[] }>(CLIENTS_QUERY, {
    variables: { search },
  });
  // Fall back to previousData while a new search query is in-flight
  const clients = (data ?? previousData)?.clients ?? [];

  const selectedClient = clients.find((c) => c.id === value) ?? null;

  const [createClient] = useMutation<{ createClient: Client }>(
    CREATE_CLIENT_MUTATION,
    {
      refetchQueries: [{ query: CLIENTS_QUERY, variables: { search } }],
    },
  );

  // Sync display when value changes externally (e.g. editing an existing quotation)
  useEffect(() => {
    if (!open) {
      setInputValue(selectedClient?.name ?? "");
    }
  }, [selectedClient, open]);

  // Server-side search: results already filtered by the backend
  const filtered = clients;

  const exactMatch = clients.find(
    (c) => c.name.toLowerCase() === inputValue.trim().toLowerCase(),
  );
  const showCreate = canCreate && inputValue.trim() && !exactMatch;

  const handleSelect = (client: Client) => {
    onChange(client.id);
    setInputValue(client.name);
    setOpen(false);
  };

  const handleCreate = async () => {
    const name = inputValue.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await createClient({ variables: { name } });
      const newClient = result.data?.createClient;
      if (newClient) {
        onChange(newClient.id);
        setInputValue(newClient.name);
      }
    } finally {
      setCreating(false);
      setOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Restore display to selected client name if user typed without selecting
        setInputValue(selectedClient?.name ?? "");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedClient]);

  return (
    <div ref={containerRef} className="relative">
      <input
        id="clientSelector"
        type="text"
        autoComplete="off"
        value={inputValue}
        placeholder={canCreate ? "Search or create a client…" : "Search for a client…"}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        onChange={(e) => {
          setInputValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setInputValue(selectedClient?.name ?? "");
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (showCreate) handleCreate();
          }
        }}
      />

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto text-sm"
        >
          {filtered.map((client) => (
            <li
              key={client.id}
              role="option"
              aria-selected={client.id === value}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(client);
              }}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                client.id === value ? "bg-gray-100 font-medium" : ""
              }`}
            >
              {client.name}
            </li>
          ))}

          {!loading && filtered.length === 0 && !showCreate && (
            <li className="px-3 py-2 text-gray-400">No clients found</li>
          )}

          {showCreate && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                handleCreate();
              }}
              className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-blue-600 border-t border-gray-100"
            >
              {creating ? "Creating…" : `Create "${inputValue.trim()}"`}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
