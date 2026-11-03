/**
 * Nexle Merchant Agreement — version merchants must sign and upload
 * before a seller application can be submitted.
 */
export const MERCHANT_CONTRACT_VERSION = '2026-10';

export interface MerchantContractClause {
  number: string;
  heading: string;
  paragraphs: string[];
}

export const MERCHANT_CONTRACT = {
  title: 'Nexle Merchant Agreement',
  version: MERCHANT_CONTRACT_VERSION,
  effectiveDate: '21 October 2026',
  intro: [
    'This Merchant Agreement ("Agreement") is between Nexle ("Nexle", "we") and the business named in the seller application ("Merchant", "you").',
    'It takes effect when an authorised signatory signs this version and Nexle approves the seller application. A signed copy of this exact version must be uploaded with the application.',
  ],
  clauses: [
    {
      number: '1',
      heading: 'Appointment',
      paragraphs: [
        'Nexle operates a multi-vendor marketplace in South Africa. After approval, you may list products and receive customer orders through Nexle.',
        'You sell in your own name. Nexle is the marketplace and payment collector, not the seller of your goods.',
      ],
    },
    {
      number: '2',
      heading: 'Your obligations',
      paragraphs: [
        'Listings must be accurate, lawful, and in stock. You fulfil every paid order from your own stock, pack it, and ship it without waiting for a payout.',
        'You handle customer questions about your products, and you accept returns and refunds that the law or Nexle’s published policies require.',
        'You keep your business, banking, and contact details up to date, and you only use an account registered as a seller.',
      ],
    },
    {
      number: '3',
      heading: 'Customer payments',
      paragraphs: [
        'Customers pay Nexle’s single Paystack account. Money does not go directly to your bank at checkout.',
        'Nexle confirms payment with the provider before your order is released for fulfilment. You may ship as soon as the order is confirmed paid.',
      ],
    },
    {
      number: '4',
      heading: 'Platform fee and your proceeds',
      paragraphs: [
        'Nexle deducts a platform fee of eight percent (8%) of the merchandise amount on each sale before anything is credited to you. You are credited ninety-two percent (92%).',
        'The fee is taken when the sale is recorded. It is not deducted again when you withdraw. Delivery amounts charged to the customer are recorded separately and are not part of the 8% merchandise fee.',
        'The fee that applied to an order is fixed on that order. A later fee change does not rewrite past sales.',
      ],
    },
    {
      number: '5',
      heading: 'Withdrawals',
      paragraphs: [
        'Your 92% starts as pending, then becomes eligible after Nexle’s payout hold. The hold applies only to withdrawals. It does not delay packing or delivery.',
        'You may request a withdrawal of eligible funds to the South African business bank account you save on Nexle. You must upload a bank confirmation letter so we can pay the correct account.',
        'Nexle may refuse or delay a withdrawal if the account is suspended, the bank details do not match, there is a refund or dispute, or the amount is below the minimum payout.',
      ],
    },
    {
      number: '6',
      heading: 'Documents and this signed contract',
      paragraphs: [
        'Before we review your application you must upload: CIPC company registration, director or owner identity document, proof of business address, bank confirmation letter, and this Agreement signed by a person authorised to bind the Merchant.',
        'The signed copy must be this version (' +
          MERCHANT_CONTRACT_VERSION +
          '). A signature on an older version is not accepted. Sign in ink or with a reliable electronic signature, then upload a clear PDF or photo.',
      ],
    },
    {
      number: '7',
      heading: 'Prohibited conduct',
      paragraphs: [
        'You must not list illegal, unsafe, or counterfeit goods, interfere with other sellers, or route customers off Nexle to avoid the platform fee.',
        'Nexle may remove listings, cancel orders, hold funds, or suspend the account if you breach this Agreement or if we need to protect customers or the platform.',
      ],
    },
    {
      number: '8',
      heading: 'Refunds and liability',
      paragraphs: [
        'If a customer is refunded, Nexle may debit your balance for the related proceeds, including amounts already marked eligible but not yet paid out.',
        'You are responsible for your products, packaging, and delivery promises. You indemnify Nexle against claims arising from your goods or your failure to fulfil an order.',
      ],
    },
    {
      number: '9',
      heading: 'Term',
      paragraphs: [
        'This Agreement continues until you close your seller account or Nexle ends it under clause 7. Orders already paid must still be fulfilled or refunded.',
        'Clauses on fees already earned, refunds, liability, and records survive termination.',
      ],
    },
    {
      number: '10',
      heading: 'Law',
      paragraphs: [
        'This Agreement is governed by the laws of the Republic of South Africa. The parties submit to the courts of South Africa.',
      ],
    },
  ] satisfies MerchantContractClause[],
  signatureLines: [
    'Merchant legal name',
    'Registration number',
    'Authorised signatory (full name)',
    'Capacity (for example: director)',
    'Signature',
    'Date',
  ],
} as const;
