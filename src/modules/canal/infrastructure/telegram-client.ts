import { env } from "../../../config/env";
import { logger } from "../../../common/logger";
import { NoAutorizadoError } from "../../../common/errors/dominio.error";

const API = "https://api.telegram.org";

/**
 * Cliente del Bot API de Telegram (envío de mensajes).
 * Sin token configurado lanza error claro (canal deshabilitado).
 */
class TelegramClientImpl {
  private token: string | null = null;

  getToken(): string {
    if (!this.token) {
      if (!env.TELEGRAM_BOT_TOKEN) {
        throw new NoAutorizadoError(
          "TELEGRAM_BOT_TOKEN no configurado: canal Telegram deshabilitado",
        );
      }
      this.token = env.TELEGRAM_BOT_TOKEN;
    }
    return this.token;
  }

  /** @param to destinatario en formato "tg:<chatId>" */
  async enviarMensaje(to: string, body: string, parseMode?: "HTML", botones?: string[]): Promise<{ sid: string }> {
    const chatId = to.replace(/^tg:/i, "");
    const payload: Record<string, unknown> = {
      chat_id: Number(chatId) || chatId,
      text: body,
      disable_web_page_preview: true,
    };
    if (parseMode === "HTML") {
      payload.parse_mode = "HTML";
    }
    // Teclado de una fila: al tocar el botón se envía SU TEXTO como mensaje
    // normal, así el clasificador de intención lo procesa sin callback_query.
    if (botones && botones.length > 0) {
      payload.reply_markup = {
        keyboard: [botones.map((b) => ({ text: b }))],
        resize_keyboard: true,
        one_time_keyboard: true,
        input_field_placeholder: "Responde con un botón o escribe tu mensaje",
      };
    }
    const resp = await fetch(`${API}/bot${this.getToken()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram sendMessage falló: ${data.description ?? resp.status}`);
    }
    logger.info({ to: "oculto", sid: `TG-${data.result?.message_id}` }, "Mensaje Telegram enviado");
    return { sid: `TG-${data.result?.message_id}` };
  }

  /** Teclado "Compartir número": pide al paciente su celular para vincularlo. */
  async pedirContacto(to: string, body: string): Promise<{ sid: string }> {
    const chatId = to.replace(/^tg:/i, "");
    const payload: Record<string, unknown> = {
      chat_id: Number(chatId) || chatId,
      text: body,
      disable_web_page_preview: true,
      reply_markup: {
        keyboard: [[{ text: "📱 Compartir número de celular", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
    const resp = await fetch(`${API}/bot${this.getToken()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram pedirContacto falló: ${data.description ?? resp.status}`);
    }
    logger.info({ sid: `TG-${data.result?.message_id}` }, "Telegram pedir contacto enviado");
    return { sid: `TG-${data.result?.message_id}` };
  }

  /** Descarga un archivo de Telegram (voice notes) por su file_id → bytes */
  async descargarArchivo(fileId: string): Promise<ArrayBuffer> {
    const get = await fetch(`${API}/bot${this.getToken()}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const g = (await get.json()) as {
      ok?: boolean;
      result?: { file_path?: string };
      description?: string;
    };
    if (!g.ok || !g.result?.file_path) {
      throw new Error(`Telegram getFile falló: ${g.description ?? get.status}`);
    }
    const file = await fetch(`${API}/file/bot${this.getToken()}/${g.result.file_path}`);
    if (!file.ok) {
      throw new Error(`Telegram descarga de archivo falló: ${file.status}`);
    }
    return await file.arrayBuffer();
  }

  /** Long polling: obtiene las actualizaciones pendientes (dev sin ngrok) */
  async getUpdates(offset: number): Promise<unknown[]> {
    const resp = await fetch(`${API}/bot${this.getToken()}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offset,
        timeout: 20,
        allowed_updates: ["message"],
      }),
    });
    const data = (await resp.json()) as { ok?: boolean; result?: unknown[]; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram getUpdates falló: ${data.description ?? resp.status}`);
    }
    return data.result ?? [];
  }

  /** Registra los comandos del bot en el menú de Telegram (BotFather) */
  async setMyCommands(): Promise<void> {
    const resp = await fetch(`${API}/bot${this.getToken()}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "cita", description: "Consultar tu próxima cita" },
          { command: "ayuda", description: "Ver menú de comandos" },
        ],
      }),
    });
    const data = (await resp.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      logger.warn({ err: data.description }, "setMyCommands falló");
    }
  }
}

export const telegramClient = new TelegramClientImpl();
