import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { env } from "../../config/env";
import { NoAutorizadoError, ProhibidoError } from "../errors/dominio.error";

export interface UsuarioJwt {
  sub: string;
  username: string;
  rol: string;
  exp: number;
}

export async function requiereAuth(c: Context, next: Next) {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new NoAutorizadoError("Token requerido");
  }
  const token = header.slice(7);
  let payload: unknown;
  try {
    payload = await verify(token, env.JWT_SECRET, "HS256");
  } catch {
    throw new NoAutorizadoError("Token inválido o expirado");
  }
  c.set("usuario", payload as UsuarioJwt);
  await next();
}

export function requiereRol(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const usuario = c.get("usuario") as UsuarioJwt | undefined;
    if (!usuario) throw new NoAutorizadoError();
    // SUPERADMIN atraviesa cualquier guard de rol.
    if (usuario.rol === "SUPERADMIN" || roles.includes(usuario.rol)) {
      await next();
      return;
    }
    throw new ProhibidoError(`Requiere rol: ${roles.join(", ")}`);
  };
}
