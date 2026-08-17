import { z } from "zod";
import type { TwilioWebhookParsed } from "./twilio-webhook.dto";

/**
 * Update de Telegram (Bot API): solo nos interesa message de texto o voz.
 * Validación tolerante: solo campos que usamos.
 */
export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      from: z.object({ id: z.union([z.number(), z.string()]) }).optional(),
      text: z.string().optional(),
      voice: z.object({ file_id: z.string() }).optional(),
      audio: z.object({ file_id: z.string() }).optional(),
      document: z.object({ file_id: z.string() }).optional(),
      // Contacto compartido ("Compartir número"): phone_number en E.164.
      contact: z
        .object({
          phone_number: z.string(),
          user_id: z.union([z.number(), z.string()]).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

/**
 * Convierte un update de Telegram al formato interno del canal
 * (compatible con TwilioWebhookParsed): from = "tg:<chatId>".
 */
export function parseTelegramUpdate(input: TelegramUpdate): TwilioWebhookParsed | null {
  const m = input.message;
  if (!m) return null; // no es un mensaje (callback, etc.)

  const tieneAudio = Boolean(m.voice || m.audio || m.document);
  const tieneContacto = Boolean(m.contact);
  const body = m.text ?? (tieneAudio ? "[audio]" : "");
  // OJO: el contacto compartido ("Compartir número") NO trae texto ni audio —
  // si lo descartamos aquí, el offset del polling nunca avanza y Telegram lo
  // reenvía para siempre (y el paciente nunca queda vinculado).
  if (!body && !tieneAudio && !tieneContacto) return null; // sticker, reacción, etc.

  return {
    messageSid: `TG-${input.update_id}`,
    from: `tg:${m.chat.id}`,
    to: "tg:bot",
    body,
    numMedia: tieneAudio ? 1 : 0,
    mediaContentType: m.voice ? "audio/ogg" : m.document ? "application/octet-stream" : undefined,
    mediaUrl: m.voice?.file_id ?? m.audio?.file_id ?? m.document?.file_id,
    // Contacto compartido: si el paciente tocó "Compartir número".
    contactoTelefono: m.contact?.phone_number,
  };
}
