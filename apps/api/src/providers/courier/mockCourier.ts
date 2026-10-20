import { createHmac, randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import type {
  CourierProvider,
  CourierWebhookEvent,
  CreateShipmentInput,
  CreateShipmentResult,
  RateQuote,
  RateQuoteInput,
  TrackingResult,
} from './types.js';

interface MockShipment {
  shipmentId: string;
  trackingNumber: string;
  status: string;
  amountCents: number;
  events: Array<{ status: string; description: string; at: string }>;
  cancelled: boolean;
  isReturn: boolean;
}

const shipments = new Map<string, MockShipment>();

export const MOCK_COURIER_WEBHOOK_SECRET = 'mock-courier-webhook-secret';

function assertMockAllowed(): void {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_COURIER !== 'true') {
    throw new AppError(
      'MOCK_COURIER_FORBIDDEN',
      'Mock courier cannot book production shipments',
      500,
    );
  }
}

export class MockCourierProvider implements CourierProvider {
  readonly name = 'mock';

  async getRates(input: RateQuoteInput): Promise<RateQuote[]> {
    assertMockAllowed();
    const weightFactor = Math.ceil(input.parcel.weightGrams / 1000);
    const base = 4500 + weightFactor * 500;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return [
      {
        serviceCode: 'MOCK_STANDARD',
        amountCents: base,
        currency: 'ZAR',
        estimateOnly: true,
        expiresAt,
        providerQuoteRef: `mock_quote_std_${randomUUID()}`,
      },
      {
        serviceCode: 'MOCK_EXPRESS',
        amountCents: base + 2500,
        currency: 'ZAR',
        estimateOnly: true,
        expiresAt,
        providerQuoteRef: `mock_quote_exp_${randomUUID()}`,
      },
    ];
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.book(input, false);
  }

  async createReturnShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.book(input, true);
  }

  private async book(input: CreateShipmentInput, isReturn: boolean): Promise<CreateShipmentResult> {
    assertMockAllowed();
    const providerShipmentRef = `mock_ship_${randomUUID()}`;
    const trackingNumber = `MCK${Date.now().toString().slice(-8)}`;
    const amountCents = isReturn ? 3500 : 5000;
    const now = new Date().toISOString();
    shipments.set(providerShipmentRef, {
      shipmentId: input.shipmentId,
      trackingNumber,
      status: 'booked',
      amountCents,
      cancelled: false,
      isReturn,
      events: [
        {
          status: 'booked',
          description: isReturn ? 'Return shipment booked (mock)' : 'Shipment booked (mock)',
          at: now,
        },
      ],
    });
    return {
      providerShipmentRef,
      trackingNumber,
      labelUrl: `https://mock-courier.local/labels/${trackingNumber}.pdf`,
      amountCents,
      estimateOnly: false,
    };
  }

  async getTracking(providerShipmentRef: string): Promise<TrackingResult> {
    const ship = shipments.get(providerShipmentRef);
    if (!ship) throw new AppError('SHIPMENT_NOT_FOUND', 'Unknown mock shipment', 404);
    return {
      providerShipmentRef,
      trackingNumber: ship.trackingNumber,
      status: ship.status,
      events: ship.events,
    };
  }

  async cancelShipment(
    providerShipmentRef: string,
    reason?: string,
  ): Promise<{ cancelled: boolean }> {
    const ship = shipments.get(providerShipmentRef);
    if (!ship) throw new AppError('SHIPMENT_NOT_FOUND', 'Unknown mock shipment', 404);
    if (['delivered', 'returned_to_sender'].includes(ship.status)) {
      throw new AppError('INVALID_STATE', 'Cannot cancel shipment in current status', 409);
    }
    ship.cancelled = true;
    ship.status = 'cancelled';
    ship.events.push({
      status: 'cancelled',
      description: reason ?? 'Cancelled',
      at: new Date().toISOString(),
    });
    return { cancelled: true };
  }

  async validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<CourierWebhookEvent> {
    const payload = body as {
      eventId?: string;
      providerShipmentRef?: string;
      trackingNumber?: string;
      status?: string;
      description?: string;
      at?: string;
    };
    const signatureHeader = headers['x-mock-courier-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const expected = createHmac('sha256', MOCK_COURIER_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');
    if (!signature || signature !== expected) {
      throw new AppError('INVALID_WEBHOOK_SIGNATURE', 'Mock courier webhook signature invalid', 401);
    }
    if (!payload.eventId || !payload.providerShipmentRef || !payload.status || !payload.at) {
      throw new AppError('INVALID_WEBHOOK_PAYLOAD', 'Malformed courier webhook', 400);
    }
    const ship = shipments.get(payload.providerShipmentRef);
    if (!ship) throw new AppError('SHIPMENT_NOT_FOUND', 'Unknown mock shipment', 404);
    ship.status = payload.status;
    ship.events.push({
      status: payload.status,
      description: payload.description ?? payload.status,
      at: payload.at,
    });
    return {
      eventId: payload.eventId,
      providerShipmentRef: payload.providerShipmentRef,
      trackingNumber: payload.trackingNumber ?? ship.trackingNumber,
      status: payload.status,
      description: payload.description ?? payload.status,
      at: payload.at,
    };
  }

  static advanceForTests(providerShipmentRef: string, status: string, description: string): void {
    const ship = shipments.get(providerShipmentRef);
    if (!ship) throw new Error('missing shipment');
    ship.status = status;
    ship.events.push({ status, description, at: new Date().toISOString() });
  }

  static clearForTests(): void {
    shipments.clear();
  }

  static signWebhookBody(body: unknown): string {
    return createHmac('sha256', MOCK_COURIER_WEBHOOK_SECRET).update(JSON.stringify(body)).digest('hex');
  }
}

export class UnconfiguredCourierProvider implements CourierProvider {
  readonly name = 'unconfigured';
  private fail(): never {
    throw new AppError(
      'COURIER_NOT_CONFIGURED',
      'No production courier configured. Use mock until credentials and docs are available.',
      501,
    );
  }
  getRates(): Promise<RateQuote[]> {
    this.fail();
  }
  createShipment(): Promise<CreateShipmentResult> {
    this.fail();
  }
  getTracking(): Promise<TrackingResult> {
    this.fail();
  }
  cancelShipment(): Promise<{ cancelled: boolean }> {
    this.fail();
  }
  validateWebhook(): Promise<CourierWebhookEvent> {
    this.fail();
  }
}

