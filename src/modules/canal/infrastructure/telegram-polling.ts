import { env } from "../../../config/env";
import { logger } from "../../../common/logger";
import { telegramClient } from "./telegram-client";
import { telegramUpdateSchema, parseTelegramUpdate } from "../dto/telegram-update.dto";
import { registrarYProcesar } from "../application/procesar-entrante";

/**
 * Long polling de Telegram (modo desarrollo): el servidor CONSULTA los mensajes,
 * no necesita ngrok ni URL pública. El offset se mantiene en memoria; al reiniciar,
 * la idempotencia por update_id descarta los duplicados.
 */
export class TelegramPolling {
  private offset = 0;
  private activo = false;
  private enCurso = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  arrancar() {
    if (this.activo || !env.TELEGRAM_ENABLED || !env.TELEGRAM_BOT_TOKEN) return;
    this.activo = true;
    this.timer = setInterval(() => void this.tick(), 1000);
    logger.info("🤖 Long polling de Telegram activo (cada 1s, sin ngrok)");
  }

  detener() {
    if (this.timer) clearInterval(this.timer);
    this.activo = false;
  }

  private async tick() {
    // Serializado: getUpdates con timeout:20 es un LONG POLL que tarda hasta 20s;
    // lanzar otro tick mientras uno corre causa "Conflict: terminated by other
    // getUpdates request" (Telegram solo permite un long poll por bot).
    if (this.enCurso) return;
    this.enCurso = true;
    try {
      const updates = await telegramClient.getUpdates(this.offset);
      for (const raw of updates) {
        const parsed = telegramUpdateSchema.safeParse(raw);
        if (!parsed.success) continue;
        const webhook = parseTelegramUpdate(parsed.data);
        if (!webhook) continue;
        logger.info({ chat: webhook.from }, "📩 Mensaje Telegram recibido");
        await registrarYProcesar(webhook);
        // confirmar el update ANTES de avanzar: si procesar falla, el cron reintenta
        const nuevoOffset = parsed.data.update_id + 1;
        if (nuevoOffset > this.offset) this.offset = nuevoOffset;
      }
    } catch (err) {
      // token inválido, red caída, otro polling activo — reintentar en el siguiente tick
      logger.warn({ err: err instanceof Error ? err.message : "desconocido" }, "Telegram polling falló");
    } finally {
      this.enCurso = false;
    }
  }
}
