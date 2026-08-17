/**
 * Payload de webhook entrante normalizado del canal (Telegram).
 * Nombre histórico ("Twilio") por compatibilidad: es la forma interna que
 * consume el bot, independiente del proveedor.
 */
export interface TwilioWebhookParsed {
  messageSid: string;
  from: string; // "tg:<chatId>"
  to: string;
  body: string;
  numMedia: number;
  mediaContentType?: string;
  mediaUrl?: string;
  /** Solo Telegram: número de celular compartido por el paciente (E.164). */
  contactoTelefono?: string;
}
