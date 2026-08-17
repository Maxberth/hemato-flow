import { z } from "zod";

const envSchema = z.object({
  // Base de datos
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  // Telegram (canal único: gratis, sin límites, long polling sin ngrok)
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  // true → el servidor consulta getUpdates (dev sin ngrok); false → webhook
  TELEGRAM_POLLING: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  // Opcional: valida los webhooks de Telegram (X-Telegram-Bot-Api-Secret-Token)
  TELEGRAM_SECRET_TOKEN: z.string().default(""),

  // Cifrado reversible
  AES_KEY: z.string().default(""),
  AES_SALT: z.string().default("pausa-ai-static-salt-2026"),

  // Auth (RBAC)
  JWT_SECRET: z.string().default("dev-only-secret-no-apto-para-produccion"),
  JWT_EXPIRES_IN: z.string().default("12h"),

  // Credenciales de seed (usuarios del panel)
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("admin-2026"),
  MEDICO_USERNAME: z.string().default("medico"),
  MEDICO_PASSWORD: z.string().default("medico-2026"),
  SOCIAL_USERNAME: z.string().default("social"),
  SOCIAL_PASSWORD: z.string().default("social-2026"),
  ENFERMERO_USERNAME: z.string().default("enfermero"),
  ENFERMERO_PASSWORD: z.string().default("enfermero-2026"),
  SUPERADMIN_USERNAME: z.string().default("superadmin"),
  SUPERADMIN_PASSWORD: z.string().default("superadmin-2026"),

  // Entorno
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  // Servidor del panel web (sirve dist/ y proxya /api)
  WEB_APP_PORT: z.coerce.number().default(3002),
  // API a la que el panel proxya (y Vite en dev)
  API_BASE_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(Bun.env);

if (!parsed.success) {
  console.error("❌ Configuración de entorno inválida:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  throw new Error("Configuración de entorno inválida");
}

export const env: Env = parsed.data;

export const esProduccion = env.NODE_ENV === "production";
