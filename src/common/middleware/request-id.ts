import type { Context, Next } from "hono";
import { randomUUID } from "node:crypto";

export async function requestId(c: Context, next: Next) {
  const id = c.req.header("x-request-id") ?? randomUUID();
  c.header("x-request-id", id);
  c.set("requestId", id);
  await next();
}
