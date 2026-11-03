import { MERCHANT_CONTRACT } from '@mavundla/shared';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Open a printable copy so the merchant can save a PDF, sign it, and upload it. */
export function openMerchantContractPrint(businessName?: string): void {
  const contract = MERCHANT_CONTRACT;
  const merchant = businessName?.trim() || '________________________________';
  const clauses = contract.clauses
    .map(
      (clause) => `
        <section>
          <h2>${escapeHtml(clause.number)}. ${escapeHtml(clause.heading)}</h2>
          ${clause.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
        </section>`,
    )
    .join('');
  const lines = contract.signatureLines
    .map((line) => `<p class="line"><span>${escapeHtml(line)}</span></p>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(contract.title)} ${escapeHtml(contract.version)}</title>
  <style>
    body { font-family: Georgia, serif; color: #1a1a1a; max-width: 760px; margin: 2rem auto; line-height: 1.45; }
    h1 { font-size: 1.6rem; margin-bottom: 0.2rem; }
    h2 { font-size: 1.05rem; margin: 1.4rem 0 0.4rem; }
    .meta { color: #444; margin-top: 0; }
    .line { border-bottom: 1px solid #222; min-height: 2.2rem; margin: 0.8rem 0; }
    .line span { display: block; font-size: 0.85rem; color: #333; }
    @media print { body { margin: 0.6in; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(contract.title)}</h1>
  <p class="meta">Version ${escapeHtml(contract.version)} · Effective ${escapeHtml(contract.effectiveDate)}</p>
  <p><strong>Merchant:</strong> ${escapeHtml(merchant)}</p>
  ${contract.intro.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
  ${clauses}
  <h2>Signature</h2>
  <p>By signing, the signatory confirms they are authorised to bind the Merchant to version ${escapeHtml(contract.version)}.</p>
  ${lines}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error('Allow pop-ups to open the contract for printing.');
  }
  popup.addEventListener('load', () => {
    popup.focus();
    popup.print();
  });
}
