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

// Railway enruta el tráfico externo al puerto de PORT; WEB_APP_PORT es fallback
// para desarrollo local. 0.0.0.0 es obligatorio en contenedores (127.0.0.1 no
// es alcanzable desde fuera).
const PUERTO = Number(process.env.PORT ?? process.env.WEB_APP_PORT ?? 3002);
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

  // Copiar headers manualmente (evita bugs de new Headers(src) en algunas
  // versiones de Bun donde Authorization no se propaga). Filtramos host y
  // content-length que fetch recalcula.
  const headers = new Headers();
  c.req.raw.headers.forEach((valor, clave) => {
    const lower = clave.toLowerCase();
    if (lower !== "host" && lower !== "content-length") {
      headers.set(clave, valor);
    }
  });

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

  // Propagar la respuesta respetando el status original de la API (401, 403,
  // 404, 500, etc.) y copiando content-type para que el cliente sepa cómo
  // parsear el body.
  const respHeaders = new Headers();
  const ct = resp.headers.get("content-type");
  if (ct) respHeaders.set("content-type", ct);
  return new Response(resp.body, {
    status: resp.status,
    headers: respHeaders,
  });
});

// ── Panel compilado (web-app/dist, generado con bun run web:build) ──

const DIST = "./web-app/dist";

// Bun.file + new Response(archivo) no siempre setea Content-Type según la
// extensión (depende de la versión de Bun). Para módulos ES el navegador
// exige MIME estricto (text/javascript), así que lo fijamos manualmente.
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function mimeDe(ruta: string): string {
  const ext = ruta.slice(ruta.lastIndexOf(".")).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

async function servirArchivo(ruta: string): Promise<Response | null> {
  const archivo = Bun.file(`${DIST}${ruta}`);
  if (await archivo.exists()) {
    // index.html: no cachear (es el entry point que referencia assets hasheados).
    // Assets con hash en el nombre: cache inmutable de 1 año.
    const esHtml = ruta.endsWith(".html");
    const cacheControl = esHtml
      ? "no-cache, no-store, must-revalidate"
      : "public, max-age=31536000, immutable";
    return new Response(archivo, {
      headers: { "content-type": mimeDe(ruta), "cache-control": cacheControl },
    });
  }
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
  Bun.serve({ port: PUERTO, hostname: "0.0.0.0", fetch: app.fetch });
  console.log(`🧪 Panel HematoFlow en http://0.0.0.0:${PUERTO} (proxy /api → ${API_BASE})`);
}
