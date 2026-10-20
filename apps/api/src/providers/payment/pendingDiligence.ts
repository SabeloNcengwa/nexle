import { AppError } from '../../lib/errors.js';
import type {
  CreateRefundResult,
  InitialiseCheckoutResult,
  PaymentProvider,
  SettlementRecord,
  ValidatedWebhookEvent,
  VerifyTransactionResult,
} from './types.js';

/**
 * Named candidate adapter scaffold.
 * Even with credentials present, live HTTP integration waits for signed diligence
 * and a follow-up implementation PR — this never claims to charge cards.
 */
export class PendingDiligencePaymentProvider implements PaymentProvider {
  readonly supportsMarketplacePayouts = false;

  constructor(
    readonly name: string,
    private readonly state: {
      missingDiligence: boolean;
      missingApiKey: boolean;
      credentialsPresent?: boolean;
    },
  ) {}

  private fail(): never {
    if (this.state.missingDiligence || this.state.missingApiKey) {
      throw new AppError(
        'PROVIDER_DILIGENCE_INCOMPLETE',
        `Payment adapter "${this.name}" requires PAYMENT_DILIGENCE_SIGNED=true and PAYMENT_PROVIDER_API_KEY. See docs/payment-provider-diligence.md.`,
        501,
      );
    }
    throw new AppError(
      'PROVIDER_ADAPTER_PENDING',
      `Credentials accepted for "${this.name}" but live API mapping is not implemented yet. Complete diligence sign-off and ship the HTTP adapter before enabling production traffic.`,
      501,
    );
  }

  async initialiseCheckout(): Promise<InitialiseCheckoutResult> {
    this.fail();
  }
  async verifyTransaction(): Promise<VerifyTransactionResult> {
    this.fail();
  }
  async validateWebhook(): Promise<ValidatedWebhookEvent> {
    this.fail();
  }
  async createRefund(): Promise<CreateRefundResult> {
    this.fail();
  }
  async getRefundStatus(): Promise<CreateRefundResult> {
    this.fail();
  }
  async getSettlementRecords(): Promise<SettlementRecord[]> {
    this.fail();
  }
}
