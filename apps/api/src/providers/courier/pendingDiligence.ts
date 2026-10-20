import { AppError } from '../../lib/errors.js';
import type {
  CourierProvider,
  CourierWebhookEvent,
  CreateShipmentResult,
  RateQuote,
  TrackingResult,
} from './types.js';

export class PendingDiligenceCourierProvider implements CourierProvider {
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
        'COURIER_DILIGENCE_INCOMPLETE',
        `Courier adapter "${this.name}" requires COURIER_DILIGENCE_SIGNED=true and COURIER_PROVIDER_API_KEY. See docs/courier-provider-diligence.md.`,
        501,
      );
    }
    throw new AppError(
      'COURIER_ADAPTER_PENDING',
      `Credentials accepted for "${this.name}" but live API mapping is not implemented yet.`,
      501,
    );
  }

  async getRates(): Promise<RateQuote[]> {
    this.fail();
  }
  async createShipment(): Promise<CreateShipmentResult> {
    this.fail();
  }
  async getTracking(): Promise<TrackingResult> {
    this.fail();
  }
  async cancelShipment(): Promise<{ cancelled: boolean }> {
    this.fail();
  }
  async validateWebhook(): Promise<CourierWebhookEvent> {
    this.fail();
  }
}
