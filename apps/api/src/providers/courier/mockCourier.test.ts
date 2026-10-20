import { beforeEach, describe, expect, it } from 'vitest';
import { MockCourierProvider } from './mockCourier.js';

const pickup = {
  line1: '1 Seller Rd',
  suburb: 'Sandton',
  city: 'Johannesburg',
  province: 'Gauteng',
  postalCode: '2196',
  country: 'ZA' as const,
};
const delivery = {
  line1: '2 Buyer Ave',
  suburb: 'Durbanville',
  city: 'Durban',
  province: 'KwaZulu-Natal',
  postalCode: '4001',
  country: 'ZA' as const,
};
const parcel = { lengthCm: 20, widthCm: 15, heightCm: 10, weightGrams: 800 };

describe('MockCourierProvider', () => {
  const courier = new MockCourierProvider();

  beforeEach(() => {
    MockCourierProvider.clearForTests();
  });

  it('returns estimate-only rates', async () => {
    const rates = await courier.getRates({ pickup, delivery, parcel });
    expect(rates.length).toBeGreaterThan(0);
    expect(rates.every((r) => r.estimateOnly)).toBe(true);
    expect(rates.every((r) => Number.isInteger(r.amountCents))).toBe(true);
  });

  it('books a confirmed shipment distinct from estimates', async () => {
    const booked = await courier.createShipment({
      shipmentId: 's1',
      pickup,
      delivery,
      parcel,
      serviceCode: 'MOCK_STANDARD',
      reference: 'so1',
    });
    expect(booked.estimateOnly).toBe(false);
    expect(booked.trackingNumber).toMatch(/^MCK/);
    const tracking = await courier.getTracking(booked.providerShipmentRef);
    expect(tracking.status).toBe('booked');
  });

  it('validates signed webhooks and advances tracking', async () => {
    const booked = await courier.createShipment({
      shipmentId: 's1',
      pickup,
      delivery,
      parcel,
      serviceCode: 'MOCK_STANDARD',
      reference: 'so1',
    });
    const body = {
      eventId: 'evt1',
      providerShipmentRef: booked.providerShipmentRef,
      status: 'in_transit',
      description: 'Picked up',
      at: new Date().toISOString(),
    };
    await expect(
      courier.validateWebhook({ 'x-mock-courier-signature': 'bad' }, body),
    ).rejects.toThrow(/signature/i);

    const event = await courier.validateWebhook(
      { 'x-mock-courier-signature': MockCourierProvider.signWebhookBody(body) },
      body,
    );
    expect(event.status).toBe('in_transit');
  });

  it('creates return shipments when supported', async () => {
    const ret = await courier.createReturnShipment!({
      shipmentId: 'r1',
      pickup: delivery,
      delivery: pickup,
      parcel,
      serviceCode: 'MOCK_STANDARD',
      reference: 'return1',
    });
    expect(ret.trackingNumber).toBeTruthy();
    expect(ret.estimateOnly).toBe(false);
  });
});
