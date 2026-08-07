import { escapeHtml } from './escape-html';

export function quoteSubmittedTemplate(
  quoteNumber: string,
  repName: string,
  clientName: string,
): string {
  return `
    <h2>New quotation awaiting your approval</h2>
    <p><strong>${escapeHtml(repName)}</strong> submitted quotation <strong>${escapeHtml(quoteNumber)}</strong> for <strong>${escapeHtml(clientName)}</strong>.</p>
    <p>Please log in to QuoteIQ to review and approve or reject it.</p>
  `;
}
