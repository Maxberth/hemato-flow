import { Hono } from "hono";
import { z } from "zod";
import { DominioError } from "../../common/errors/dominio.error";
import { parsePaginacion } from "../../common/paginacion";
import { ok } from "../../common/response";
import { requiereAuth } from "../../common/middleware/requiere-rol";
import type { AvisoRepository } from "./domain/aviso.repository";

const filtrosSchema = z.object({
  estado: z.enum(["PROGRAMADO", "ENVIADO", "FALLIDO"]).optional(),
  citaId: z.string().min(1).optional(),
});

export function crearAvisosController(repo: AvisoRepository) {
  const controller = new Hono();

  controller.get("/avisos", requiereAuth, async (c) => {
    const parsed = filtrosSchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new DominioError("FILTROS_INVALIDOS", "Filtros inválidos", 400);
    }
    const pag = parsePaginacion(c.req.query());
    const avisos = await repo.listarPaginado(
      {
        estado: parsed.data.estado,
        citaId: parsed.data.citaId,
      },
      pag,
    );
    return c.json(ok(avisos));
  });

  return controller;
}
