import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import type { AuditoriaRepository } from "./domain/auditoria.repository";

const filtrosSchema = z.object({
  entidad: z.string().min(1).optional(),
  entidadId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export function crearAuditoriaController(repo: AuditoriaRepository) {
  const controller = new Hono();

  controller.get("/auditoria", requiereAuth, requiereRol("MEDICO", "ADMIN"), async (c) => {
    const parsed = filtrosSchema.safeParse(c.req.query());
    const filtros = parsed.success ? parsed.data : { limit: 100 };
    const paginaRaw = c.req.query("pagina");
    const pagina = paginaRaw && Number.parseInt(paginaRaw, 10) >= 1 ? Number.parseInt(paginaRaw, 10) : 1;
    const items = await repo.listar({ ...filtros, pagina });
    return c.json(ok({ items, pagina }));
  });

  return controller;
}
