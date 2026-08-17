import type { Context } from "hono";
import type { Rol } from "@prisma/client";
import type { UsuarioJwt } from "./middleware/requiere-rol";

/** Actor de una acción de auditoría desde el JWT; SISTEMA si no hay usuario. */
export function actorDeJwt(c: Context): { actorId: string; actorRol: Rol | null } {
  const usuario = c.get("usuario") as UsuarioJwt | undefined;
  if (!usuario) return { actorId: "SISTEMA", actorRol: null };
  return { actorId: usuario.sub, actorRol: usuario.rol as Rol };
}
