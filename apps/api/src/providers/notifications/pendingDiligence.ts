import { AppError } from '../../lib/errors.js';
import type { EmailProvider, SmsProvider } from './types.js';

export class PendingDiligenceEmailProvider implements EmailProvider {
  constructor(
    readonly name: string,
    private readonly state: { missingDiligence: boolean; missingApiKey: boolean },
  ) {}

  async send(): Promise<{ providerMessageId: string }> {
    if (this.state.missingDiligence || this.state.missingApiKey) {
      throw new AppError(
        'EMAIL_DILIGENCE_INCOMPLETE',
        `Email adapter "${this.name}" requires EMAIL_DILIGENCE_SIGNED=true and EMAIL_PROVIDER_API_KEY.`,
        501,
      );
    }
    throw new AppError(
      'EMAIL_ADAPTER_PENDING',
      `Credentials accepted for "${this.name}" but live send API is not implemented yet.`,
      501,
    );
  }
}

export class PendingDiligenceSmsProvider implements SmsProvider {
  constructor(
    readonly name: string,
    private readonly state: { missingDiligence: boolean; missingApiKey: boolean },
  ) {}

  async send(): Promise<{ providerMessageId: string }> {
    if (this.state.missingDiligence || this.state.missingApiKey) {
      throw new AppError(
        'SMS_DILIGENCE_INCOMPLETE',
        `SMS adapter "${this.name}" requires SMS_DILIGENCE_SIGNED=true and SMS_PROVIDER_API_KEY.`,
        501,
      );
    }
    throw new AppError(
      'SMS_ADAPTER_PENDING',
      `Credentials accepted for "${this.name}" but live send API is not implemented yet.`,
      501,
    );
  }
}
