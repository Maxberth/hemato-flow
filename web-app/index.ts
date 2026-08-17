/**
 * Servidor del panel HematoFlow (web-app).
 * Dos responsabilidades:
 *   1. Servir el build de Vite (web-app/dist) con fallback SPA a index.html.
 *   2. Proxy /api/* → API_BASE_URL (default http://localhost:3000), pasando
 *      headers, método y body tal cual. El panel es un cliente HTTP de la API
 *      única (src/app.ts) — sin imports de dominio in-process.
 * En desarrollo se usa `bun run web:dev` (Vite en :5173 con su propio proxy).
 */
import { Hono } from "hono";
import { cors } from "hono/cors";

const PUERTO = Number(process.env.WEB_APP_PORT ?? 3002);
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowHeaders: ["*"],
    exposeHeaders: ["*"],
  }),
);

// ── Proxy /api/* → API ─────────────────────────────────

app.all("/api/*", async (c) => {
  const url = c.req.url;
  const target = `${API_BASE}${new URL(url).pathname}${new URL(url).search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  headers.delete("content-length"); // fetch recalcula con el body real

  const body = c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.arrayBuffer();

  let resp: Response;
  try {
    resp = await fetch(target, {
      method: c.req.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "desconocido";
    return c.json(
      { success: false, error: { codigo: "API_NO_DISPONIBLE", mensaje: `API no disponible: ${mensaje}` } },
      502,
    );
  }

  const contentType = resp.headers.get("content-type") ?? "application/json";
  return new Response(resp.body, {
    status: resp.status,
    headers: { "content-type": contentType },
  });
});

// ── Panel compilado (web-app/dist, generado con bun run web:build) ──

const DIST = "./web-app/dist";

async function servirArchivo(ruta: string): Promise<Response | null> {
  const archivo = Bun.file(`${DIST}${ruta}`);
  if (await archivo.exists()) return new Response(archivo);
  return null;
}

app.get("*", async (c) => {
  const ruta = c.req.path === "/" ? "/index.html" : c.req.path;

  const directo = await servirArchivo(ruta);
  if (directo) return directo;

  // SPA fallback: rutas de react-router devuelven index.html
  const index = await servirArchivo("/index.html");
  if (index) return index;

  return c.text("Panel no compilado: ejecuta bun run web:build", 500);
});

// ── Arranque ────────────────────────────────────────────

if (import.meta.main) {
  Bun.serve({ port: PUERTO, hostname: "127.0.0.1", fetch: app.fetch });
  console.log(`🧪 Panel HematoFlow en http://127.0.0.1:${PUERTO} (proxy /api → ${API_BASE})`);
}
