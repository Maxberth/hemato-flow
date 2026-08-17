import type { Canal } from "@prisma/client";
import { env } from "../../../config/env";
import { CanalSalidaPort } from "../domain/canal-salida.port";
import { TelegramCanalAdapter, LocalCanalAdapter } from "./canal-salida.adapter";

let instancia: CanalSalidaPort | null = null;

/**
 * Factory del canal de salida:
 * 1. Telegram si está habilitado y tiene token (gratis, sin límites)
 * 2. Local si nada está habilitado (el bot responde solo en BD — modo dev/sim)
 */
export function getCanalSalida(): CanalSalidaPort {
  if (!instancia) {
    if (env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN) {
      instancia = new TelegramCanalAdapter();
    } else {
      instancia = new LocalCanalAdapter();
    }
  }
  return instancia;
}

/**
 * Canal de salida para un aviso concreto según el canal del paciente.
 * Twilio fue retirado: WHATSAPP → LocalCanalAdapter (log) y el aviso igual se
 * marca ENVIADO (modo dev/sim).
 */
export function getCanalParaAviso(canal: Canal): CanalSalidaPort {
  if (canal === "TELEGRAM" && env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN) {
    return new TelegramCanalAdapter();
  }
  return new LocalCanalAdapter();
}
