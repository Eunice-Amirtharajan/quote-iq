import { useState } from "react";
import { useMutation, useLazyQuery } from "@apollo/client/react";
import { QUOTATION_SUMMARY_MUTATION } from "../graphql/mutations";
import { ASK_ABOUT_QUOTATION_QUERY } from "../graphql/queries";
import { useAuth } from "../hooks/useAuth";

interface QuotationSummary {
  summary: string;
  recommendation: "PROCEED" | "FOLLOW_UP" | "RECONSIDER";
  keyPoints: string[];
  riskFactors: string[];
}

const RECOMMENDATION_STYLES = {
  PROCEED: { badge: "bg-green-50 text-green-700", label: "Proceed" },
  FOLLOW_UP: { badge: "bg-amber-50 text-amber-700", label: "Follow Up" },
  RECONSIDER: { badge: "bg-red-50 text-red-700", label: "Reconsider" },
};

interface Props {
  quotationId: string;
}

export default function AIInsightCard({ quotationId }: Readonly<Props>) {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");

  const [generateSummary, { data, loading, error, called }] = useMutation<{
    quotationSummary: QuotationSummary;
  }>(QUOTATION_SUMMARY_MUTATION);

  const [askQuestion, { data: answerData, loading: askLoading }] =
    useLazyQuery<{ askAboutQuotation: { answer: string } }>(
      ASK_ABOUT_QUOTATION_QUERY,
      { fetchPolicy: "no-cache" },
    );

  // Only managers see AI insights
  if (user?.role === "SALES_REP") return null;

  const handleGenerate = () => {
    void generateSummary({ variables: { quotationId } });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-gray-900">AI Insight</span>
          <span className="text-xs text-gray-400">Analysing...</span>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-4/5" />
          <div className="h-3 bg-gray-100 rounded w-3/5" />
        </div>
      </div>
    );
  }

  if (!called || error || !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">AI Insight</h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Generate an AI-powered analysis of this quotation.
        </p>
        <button
          onClick={handleGenerate}
          className="w-full text-xs font-medium bg-gray-900 text-white py-2 px-3 rounded-lg hover:bg-gray-700 transition-colors"
        >
          {error ? "Retry" : "Generate Insight"}
        </button>
        {error && (
          <p className="text-xs text-red-500 mt-2">
            Analysis failed. Please try again.
          </p>
        )}
      </div>
    );
  }

  const { summary, recommendation, keyPoints, riskFactors } =
    data.quotationSummary;
  const style = RECOMMENDATION_STYLES[recommendation];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">AI Insight</h3>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${style.badge}`}
          >
            {style.label}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{summary}</p>

      {keyPoints.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Key Points</p>
          <ul className="space-y-1">
            {keyPoints.map((point, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-2">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {riskFactors.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Risk Factors</p>
          <ul className="space-y-1">
            {riskFactors
              .filter((r) => r.trim())
              .map((risk, i) => (
                <li key={i} className="text-xs text-gray-600 flex gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                  {risk}
                </li>
              ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-300 mt-4">Powered by Groq AI</p>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-500 mb-2">Ask a question</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && question.trim()) {
                void askQuestion({ variables: { quotationId, question } });
              }
            }}
            placeholder="e.g. Is the margin reasonable?"
            maxLength={500}
            className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button
            onClick={() => {
              if (question.trim()) {
                void askQuestion({ variables: { quotationId, question } });
              }
            }}
            disabled={askLoading || !question.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {askLoading ? "…" : "Ask"}
          </button>
        </div>
        {answerData?.askAboutQuotation.answer && (
          <p className="mt-2 text-xs text-gray-600 leading-relaxed">
            {answerData.askAboutQuotation.answer}
          </p>
        )}
      </div>
    </div>
  );
}
