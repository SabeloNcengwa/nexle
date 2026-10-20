import type { ParcelDimensions, SaAddress } from '@mavundla/shared';

export interface RateQuoteInput {
  pickup: SaAddress;
  delivery: SaAddress;
  parcel: ParcelDimensions;
  serviceCodes?: string[];
}

export interface RateQuote {
  serviceCode: string;
  amountCents: number;
  currency: 'ZAR';
  estimateOnly: boolean;
  expiresAt: string;
  providerQuoteRef: string;
}

export interface CreateShipmentInput {
  shipmentId: string;
  pickup: SaAddress;
  delivery: SaAddress;
  parcel: ParcelDimensions;
  serviceCode: string;
  reference: string;
}

export interface CreateShipmentResult {
  providerShipmentRef: string;
  trackingNumber: string;
  labelUrl: string;
  amountCents: number;
  estimateOnly: boolean;
}

export interface TrackingEvent {
  status: string;
  description: string;
  at: string;
}

export interface TrackingResult {
  providerShipmentRef: string;
  trackingNumber: string;
  status: string;
  events: TrackingEvent[];
}

export interface CourierWebhookEvent {
  eventId: string;
  providerShipmentRef: string;
  trackingNumber?: string;
  status: string;
  description: string;
  at: string;
}

export interface CourierProvider {
  readonly name: string;
  getRates(input: RateQuoteInput): Promise<RateQuote[]>;
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  getTracking(providerShipmentRef: string): Promise<TrackingResult>;
  cancelShipment(providerShipmentRef: string, reason?: string): Promise<{ cancelled: boolean }>;
  createReturnShipment?(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<CourierWebhookEvent>;
}
