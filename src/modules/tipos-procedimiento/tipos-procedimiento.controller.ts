import { Hono } from "hono";
import { ok } from "../../common/response";
import { requiereAuth } from "../../common/middleware/requiere-rol";
import { prisma } from "../../infrastructure/prisma/prisma.service";

/** Catálogo de tipos de procedimiento (solo lectura, seed). */
export const tiposProcedimientoController = new Hono();

tiposProcedimientoController.get("/tipos-procedimiento", requiereAuth, async (c) => {
  const tipos = await prisma.tipoProcedimiento.findMany({ orderBy: { nombre: "asc" } });
  return c.json(ok(tipos));
});
