import { Hono } from "hono";
import { z } from "zod";
import { DominioError } from "../../common/errors/dominio.error";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import type { ConfiguracionRepository } from "./domain/configuracion.repository";

const claveSchema = z.string().min(1).max(64);

export function crearConfiguracionController(repo: ConfiguracionRepository) {
  const controller = new Hono();

  controller.get("/configuracion", requiereAuth, async (c) => {
    const items = await repo.obtenerTodas();
    return c.json(ok(items));
  });

  controller.put("/configuracion/:clave", requiereAuth, requiereRol("MEDICO", "ADMIN"), async (c) => {
    const claveParsed = claveSchema.safeParse(c.req.param("clave"));
    if (!claveParsed.success) {
      throw new DominioError("CLAVE_INVALIDA", "Clave de configuración inválida", 400);
    }
    const clave = claveParsed.data;
    const body = await c.req.json().catch(() => null);
    const valor = body?.valor;
    if (valor === undefined) {
      throw new DominioError("VALOR_REQUERIDO", "El campo 'valor' es obligatorio", 400);
    }
    const actualizada = await repo.actualizar(clave, valor);
    return c.json(ok(actualizada));
  });

  return controller;
}
