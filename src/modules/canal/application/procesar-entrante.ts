import { di } from "../../../config/di";
import { logger } from "../../../common/logger";
import type { TwilioWebhookParsed } from "../dto/twilio-webhook.dto";

/**
 * Cola FIFO in-process por fromHash: evita procesar en paralelo mensajes del mismo paciente.
 */
const colasPorHash = new Map<string, Promise<unknown>>();

export function encolarPorHash<T>(hash: string, fn: () => Promise<T>): Promise<T> {
  const previa = colasPorHash.get(hash) ?? Promise.resolve();
  const ejecucion = previa.then(fn, fn);
  colasPorHash.set(hash, ejecucion);
  void ejecucion.finally(() => {
    if (colasPorHash.get(hash) === ejecucion) colasPorHash.delete(hash);
  });
  return ejecucion;
}

/**
 * Registra la idempotencia y encola el procesamiento en background.
 * El webhook responde 200 al instante; el bot puede tardar lo que necesite.
 * Si el procesamiento falla, el evento queda en ERROR y el cron lo reintenta.
 */
export async function registrarYProcesar(webhook: TwilioWebhookParsed): Promise<"duplicado" | "encolado"> {
  const fromHash = di.cifrado.hashNumero(webhook.from);
  return di.webhookEventRepo
    .registrar({
      sid: webhook.messageSid,
      fromHash,
      payload: {
        messageSid: webhook.messageSid,
        from: webhook.from,
        to: webhook.to,
        body: webhook.body,
        numMedia: webhook.numMedia,
        mediaContentType: webhook.mediaContentType,
        mediaUrl: webhook.mediaUrl,
        contactoTelefono: webhook.contactoTelefono,
      },
    })
    .then((registro: { duplicado: boolean }) => {
      if (registro.duplicado) {
        logger.info({ sid: webhook.messageSid }, "Mensaje duplicado, omitido");
        return "duplicado" as const;
      }

      void encolarPorHash(fromHash, async () => {
        try {
          const res = await di.procesarMensaje!.ejecutar(webhook);
          await di.webhookEventRepo.marcarProcesado(webhook.messageSid);
          logger.info({ sid: webhook.messageSid, estado: res.estado }, "Mensaje procesado");
        } catch (err) {
          logger.error({ err, sid: webhook.messageSid }, "Error procesando mensaje (reintento vía cron)");
          await di.webhookEventRepo.marcarError(
            webhook.messageSid,
            err instanceof Error ? err.message : "error",
          );
        }
      });

      return "encolado" as const;
    });
}
