/**
 * Formatea el número descifrado de un usuario al destino del canal correcto:
 * - "tg:<chatId>" (Telegram) → se usa tal cual
 * - "+51999999999" (WhatsApp) → se prefija "whatsapp:"
 */
export function formatearDestino(numeroDescifrado: string): string {
  const limpio = numeroDescifrado.replace(/^whatsapp:/i, "");
  return /^tg:/i.test(limpio) ? limpio : `whatsapp:${limpio}`;
}
