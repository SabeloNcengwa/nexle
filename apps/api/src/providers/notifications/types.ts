export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  notificationId: string;
  template: string;
}

export interface SmsMessage {
  to: string;
  body: string;
  notificationId: string;
  template: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<{ providerMessageId: string }>;
}
