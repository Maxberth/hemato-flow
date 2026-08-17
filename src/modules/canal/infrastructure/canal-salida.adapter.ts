import { CanalSalidaPort } from "../domain/canal-salida.port";
import { telegramClient } from "./telegram-client";
import { logger } from "../../../common/logger";
import { randomUUID } from "node:crypto";

/** Envío real vía Telegram Bot API (gratis, sin límites, long polling sin ngrok) */
export class TelegramCanalAdapter extends CanalSalidaPort {
  async enviarMensaje(to: string, body: string, parseMode?: "HTML", botones?: string[]): Promise<{ sid: string }> {
    return telegramClient.enviarMensaje(to, body, parseMode, botones);
  }

  async pedirContacto(to: string, body: string): Promise<{ sid: string }> {
    return telegramClient.pedirContacto(to, body);
  }
}

/**
 * Modo local/desarrollo: no llama a ningún proveedor, solo registra en log.
 * Se usa cuando no hay credenciales reales configuradas (piloto/dev).
 */
export class LocalCanalAdapter extends CanalSalidaPort {
  async enviarMensaje(to: string, body: string, _parseMode?: "HTML", _botones?: string[]): Promise<{ sid: string }> {
    logger.info({ to: "oculto", body }, "[CANAL-LOCAL] mensaje simulado");
    return { sid: `SM-local-${randomUUID()}` };
  }

  async pedirContacto(to: string, body: string): Promise<{ sid: string }> {
    logger.info({ to: "oculto", body }, "[CANAL-LOCAL] pedido de contacto simulado");
    return { sid: `SM-local-${randomUUID()}` };
  }
}
