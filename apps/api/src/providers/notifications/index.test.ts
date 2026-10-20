import { describe, expect, it } from 'vitest';
import { getEmailProvider, getSmsProvider } from './index.js';

describe('notification providers', () => {
  it('defaults to mock email and sms', async () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.SMS_PROVIDER;
    const email = getEmailProvider();
    const sms = getSmsProvider();
    expect(email.name).toBe('mock');
    expect(sms.name).toBe('mock');
    const result = await email.send({
      to: 'a@example.com',
      subject: 'Hi',
      body: 'Body',
      notificationId: 'n1',
      template: 'order_confirmation',
    });
    expect(result.providerMessageId).toContain('mock_email');
  });
});
