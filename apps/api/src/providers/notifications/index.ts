import { AppError } from '../../lib/errors.js';
import {
  MockEmailProvider,
  MockSmsProvider,
  UnconfiguredEmailProvider,
  UnconfiguredSmsProvider,
} from './mockTransport.js';
import { PendingDiligenceEmailProvider, PendingDiligenceSmsProvider } from './pendingDiligence.js';
import type { EmailProvider, SmsProvider } from './types.js';

export type { EmailProvider, SmsProvider, EmailMessage, SmsMessage } from './types.js';

export function getEmailProvider(): EmailProvider {
  const name = process.env.EMAIL_PROVIDER ?? 'mock';
  if (name === 'mock') return new MockEmailProvider();
  if (name === 'unconfigured') return new UnconfiguredEmailProvider();

  if (name === 'sendgrid' || name === 'ses' || name === 'resend') {
    const diligence = process.env.EMAIL_DILIGENCE_SIGNED === 'true';
    const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
    return new PendingDiligenceEmailProvider(name, {
      missingDiligence: !diligence,
      missingApiKey: !apiKey,
    });
  }

  throw new AppError(
    'UNKNOWN_EMAIL_PROVIDER',
    `Unknown EMAIL_PROVIDER=${name}. Use mock | unconfigured | sendgrid | ses | resend.`,
    500,
  );
}

export function getSmsProvider(): SmsProvider {
  const name = process.env.SMS_PROVIDER ?? 'mock';
  if (name === 'mock') return new MockSmsProvider();
  if (name === 'unconfigured') return new UnconfiguredSmsProvider();

  if (name === 'twilio' || name === 'clickatell') {
    const diligence = process.env.SMS_DILIGENCE_SIGNED === 'true';
    const apiKey = process.env.SMS_PROVIDER_API_KEY?.trim();
    return new PendingDiligenceSmsProvider(name, {
      missingDiligence: !diligence,
      missingApiKey: !apiKey,
    });
  }

  throw new AppError(
    'UNKNOWN_SMS_PROVIDER',
    `Unknown SMS_PROVIDER=${name}. Use mock | unconfigured | twilio | clickatell.`,
    500,
  );
}
