import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./common/logger";
import { di } from "./config/di";
import { TelegramPolling } from "./modules/canal/infrastructure/telegram-polling";

const app = createApp();

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

logger.info(`🏥 HematoFlow API escuchando en http://localhost:${server.port}`);

// Telegram: long polling en dev (sin ngrok) cuando está habilitado
if (env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN) {
  import("./modules/canal/infrastructure/telegram-client")
    .then(({ telegramClient }) => telegramClient.setMyCommands().catch(() => {}))
    .catch(() => {});
  if (env.TELEGRAM_POLLING) {
    const polling = new TelegramPolling();
    polling.arrancar();
  } else {
    logger.info("🌐 Canal Telegram en modo webhook (configura la URL pública en @BotFather)");
  }
}

// ── Cron HematoFlow ────────────────────────────────────
// dispatcher-avisos + reintento webhooks: cada 60 s
// detector-silencios + detector-no-shows: cada 5 min
// Bun.cron no está disponible en Windows → fallback con setInterval.
const rapido = () => {
  di.cronHematoflow!.ejecutarCicloRapido().catch((err) =>
    logger.error({ err }, "Error en ciclo rápido de cron"),
  );
  // Ciclo diario con guardas de hora (00:05 abrir-dia, 01:00 cierre-turnos,
  // 23:59 cierre-dia): seguro llamarlo cada minuto en ambos schedulers.
  di.cronHematoflow!.ejecutarCicloDiario().catch((err) =>
    logger.error({ err }, "Error en ciclo diario de cron"),
  );
};
const lento = () => {
  di.cronHematoflow!.ejecutarCicloLento().catch((err) =>
    logger.error({ err }, "Error en ciclo lento de cron"),
  );
};

const bunConCron = typeof (Bun as unknown as { cron?: unknown }).cron === "function";
if (bunConCron) {
  const cron = (Bun as unknown as { cron: (p: string, cb: () => void) => void }).cron;
  // Bun.cron usa 5 campos (minuto hora día mes díaSemana): cada minuto / cada 5 min.
  cron("* * * * *", rapido);
  cron("*/5 * * * *", lento);
  logger.info("⏰ Cron HematoFlow registrado (Bun.cron: avisos/minuto, detectores/5min)");
} else {
  setInterval(rapido, 60_000);
  setInterval(lento, 5 * 60_000);
  logger.info("⏰ Cron HematoFlow registrado (setInterval: avisos/60s, detectores/5min — fallback Windows)");
}

// Graceful shutdown: no dejar procesos colgados
process.on("SIGINT", () => {
  logger.info("Cerrando servidor...");
  server.stop();
  process.exit(0);
});
