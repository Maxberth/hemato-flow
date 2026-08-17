import { Hono } from "hono";
import { env } from "../../config/env";
import { logger } from "../../common/logger";
import { telegramUpdateSchema, parseTelegramUpdate } from "./dto/telegram-update.dto";
import { registrarYProcesar } from "./application/procesar-entrante";

/**
 * Webhook entrante de Telegram (producción, requiere URL pública).
 * En dev se prefiere el long polling (telegram-polling.ts) — sin ngrok.
 * Validación opcional con X-Telegram-Bot-Api-Secret-Token.
 */
export const telegramController = new Hono();

telegramController.post("/webhooks/telegram", async (c) => {
  // Validación del secret token (opcional; recomendado si hay webhook público)
  if (env.TELEGRAM_SECRET_TOKEN) {
    const secret = c.req.header("x-telegram-bot-api-secret-token");
    if (secret !== env.TELEGRAM_SECRET_TOKEN) {
      logger.warn("Webhook Telegram con secret token inválido");
      return c.body(null, 401);
    }
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = telegramUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return c.body(null, 200); // update irrelevante → confirmar igual
  }

  const webhook = parseTelegramUpdate(parsed.data);
  if (!webhook) {
    return c.body(null, 200); // no es un mensaje útil
  }

  await registrarYProcesar(webhook);
  return c.body(null, 200);
});
