import { Hono } from "hono";
import { sign } from "hono/jwt";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../infrastructure/prisma/prisma.service";
import { DominioError, NoEncontradoError } from "../../common/errors/dominio.error";
import { ok } from "../../common/response";
import { verificarPassword } from "./infrastructure/password-hash";

export const authController = new Hono();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authController.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new DominioError("CREDENCIALES_INVALIDAS", "Usuario o contraseña inválidos", 401);
  }

  const usuario = await prisma.usuario.findUnique({
    where: { username: parsed.data.username },
  });
  if (!usuario || !usuario.activo) {
    throw new NoEncontradoError("Credenciales inválidas");
  }

  const valida = await verificarPassword(parsed.data.password, usuario.passwordHash);
  if (!valida) {
    throw new DominioError("CREDENCIALES_INVALIDAS", "Usuario o contraseña inválidos", 401);
  }

  const token = await sign(
    {
      sub: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12, // 12h
    },
    env.JWT_SECRET,
  );

  return c.json(
    ok({
      token,
      usuario: { username: usuario.username, rol: usuario.rol, nombre: usuario.nombre },
    }),
  );
});
