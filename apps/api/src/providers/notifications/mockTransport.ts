import { AppError } from '../../lib/errors.js';
import type { EmailMessage, EmailProvider, SmsMessage, SmsProvider } from './types.js';

export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    if (process.env.NOTIFICATION_FAIL_FOR_TESTS === 'true') {
      throw new Error('Forced notification failure for tests');
    }
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_EMAIL !== 'true') {
      throw new AppError(
        'MOCK_EMAIL_FORBIDDEN',
        'Mock email cannot send in production without ALLOW_MOCK_EMAIL=true',
        500,
      );
    }
    console.log(
      JSON.stringify({
        msg: 'email_sent_mock',
        id: message.notificationId,
        template: message.template,
        to: message.to,
        subject: message.subject,
      }),
    );
    return { providerMessageId: `mock_email_${message.notificationId}` };
  }
}

export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';

  async send(message: SmsMessage): Promise<{ providerMessageId: string }> {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_SMS !== 'true') {
      throw new AppError(
        'MOCK_SMS_FORBIDDEN',
        'Mock SMS cannot send in production without ALLOW_MOCK_SMS=true',
        500,
      );
    }
    console.log(
      JSON.stringify({
        msg: 'sms_sent_mock',
        id: message.notificationId,
        template: message.template,
        to: message.to,
      }),
    );
    return { providerMessageId: `mock_sms_${message.notificationId}` };
  }
}

export class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = 'unconfigured';

  send(): Promise<{ providerMessageId: string }> {
    throw new AppError(
      'EMAIL_PROVIDER_NOT_CONFIGURED',
      'No production email provider selected. Set EMAIL_PROVIDER after diligence.',
      501,
    );
  }
}

export class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = 'unconfigured';

  send(): Promise<{ providerMessageId: string }> {
    throw new AppError(
      'SMS_PROVIDER_NOT_CONFIGURED',
      'No production SMS provider selected. Set SMS_PROVIDER after diligence.',
      501,
    );
  }
}
