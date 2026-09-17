import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { ASK_PLAYBOOK_MUTATION } from "../graphql/mutations";
import { HAS_READY_DOCUMENTS_QUERY } from "../graphql/queries";

interface Citation {
  documentTitle: string;
  chunkIndex: number;
  excerpt: string;
}

interface Message {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
}

function CitationCard({ citation, index }: Readonly<{ citation: Citation; index: number }>) {
  return (
    <div className="mt-2 border border-gray-100 rounded-lg p-3 bg-gray-50 text-xs">
      <p className="font-medium text-gray-700 mb-1">
        [{index + 1}] {citation.documentTitle}{" "}
        <span className="text-gray-400 font-normal">· chunk {citation.chunkIndex}</span>
      </p>
      <p className="text-gray-500 leading-relaxed">{citation.excerpt}</p>
    </div>
  );
}

function AssistantBubble({ message }: Readonly<{ message: Message }>) {
  const [showCitations, setShowCitations] = useState(false);
  const hasCitations = (message.citations?.length ?? 0) > 0;
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-gray-900 flex-shrink-0 flex items-center justify-center mt-0.5">
        <span className="text-white text-xs font-semibold">AI</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm text-gray-800 leading-relaxed shadow-sm">
          {message.text}
        </div>
        {hasCitations && (
          <button
            type="button"
            onClick={() => setShowCitations((v) => !v)}
            className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showCitations ? "Hide sources" : `Show ${message.citations!.length} source${message.citations!.length > 1 ? "s" : ""}`}
          </button>
        )}
        {showCitations &&
          message.citations?.map((c, i) => (
            <CitationCard key={`${c.documentTitle}-${c.chunkIndex}`} citation={c} index={i} />
          ))}
      </div>
    </div>
  );
}

export default function PlaybookPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: gateData, loading: gateLoading } = useQuery<{ hasReadyDocuments: boolean }>(
    HAS_READY_DOCUMENTS_QUERY,
    { fetchPolicy: "network-only" },
  );

  const [askPlaybook, { loading }] = useMutation<{
    askPlaybook: { answer: string; citations: Citation[] };
  }>(ASK_PLAYBOOK_MUTATION);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);

    try {
      const { data } = await askPlaybook({ variables: { question: q } });
      const result = data?.askPlaybook;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: result?.answer ?? "No answer returned.",
          citations: result?.citations ?? [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong. Please try again." },
      ]);
    }
  }

  if (gateLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (!gateData?.hasReadyDocuments) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Sales Playbook</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Ask anything about your approved playbook documents
          </p>
        </div>
        <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <span className="text-xl">📭</span>
          </div>
          <p className="text-sm font-medium text-gray-600">No playbook documents available yet</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs leading-relaxed">
            Ask a Sales Manager to upload and approve at least one document before you can ask questions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Sales Playbook</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Ask anything about your approved playbook documents
        </p>
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <span className="text-xl">📖</span>
            </div>
            <p className="text-sm text-gray-500 font-medium">Ask the playbook anything</p>
            <p className="text-xs text-gray-300 mt-1 max-w-xs">
              e.g. "How should I handle pricing objections?" or "What's our standard discount policy?"
            </p>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-gray-900 text-white text-sm rounded-xl px-4 py-2.5 max-w-sm leading-relaxed">
                {msg.text}
              </div>
            </div>
          ) : (
            <AssistantBubble key={i} message={msg} />
          ),
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gray-900 flex-shrink-0 flex items-center justify-center mt-0.5">
              <span className="text-white text-xs font-semibold">AI</span>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend().catch(() => {}); } }}
          placeholder="Ask about the sales playbook…"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => handleSend().catch(() => {})}
          disabled={!input.trim() || loading}
          className="px-4 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
