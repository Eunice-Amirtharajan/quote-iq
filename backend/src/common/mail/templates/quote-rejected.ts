import { escapeHtml } from './escape-html';

export function quoteRejectedTemplate(
  quoteNumber: string,
  clientName: string,
  note: string | null | undefined,
): string {
  return `
    <h2>Your quotation has been rejected</h2>
    <p>Quotation <strong>${escapeHtml(quoteNumber)}</strong> for <strong>${escapeHtml(clientName)}</strong> was rejected.</p>
    ${note ? `<p><strong>Reason:</strong> ${escapeHtml(note)}</p>` : ''}
  `;
}
