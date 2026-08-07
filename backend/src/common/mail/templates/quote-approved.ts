import { escapeHtml } from './escape-html';

export function quoteApprovedTemplate(
  quoteNumber: string,
  clientName: string,
): string {
  return `
    <h2>Your quotation has been approved</h2>
    <p>Quotation <strong>${escapeHtml(quoteNumber)}</strong> for <strong>${escapeHtml(clientName)}</strong> has been approved.</p>
  `;
}
