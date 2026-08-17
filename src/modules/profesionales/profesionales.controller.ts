import { Hono } from "hono";
import { z } from "zod";
import { NoEncontradoError, DominioError } from "../../common/errors/dominio.error";
import { parsePaginacion } from "../../common/paginacion";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import { prisma } from "../../infrastructure/prisma/prisma.service";
import type { ProfesionalRepository } from "./domain/profesional.repository";

const crearSchema = z.object({
  nombre: z.string().min(1, "nombre es obligatorio"),
  especialidad: z.string().optional().nullable(),
});

const editarSchema = z
  .object({
    nombre: z.string().min(1).optional(),
    especialidad: z.string().optional().nullable(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Sin campos para actualizar" });

const ESTADOS_ACTIVOS = ["PROPUESTA", "PROGRAMADA", "CONFIRMADA"] as const;

export function crearProfesionalesController(repo: ProfesionalRepository) {
  const controller = new Hono();
  const rolGestion = requiereRol("MEDICO", "ADMIN");

  controller.get("/profesionales", requiereAuth, async (c) => {
    const soloActivos = c.req.query("activos") !== "false";
    const q = c.req.query("q");
    const pag = parsePaginacion(c.req.query());
    const lista = await repo.listar(soloActivos, q, pag);
    return c.json(ok(lista));
  });

  controller.post("/profesionales", requiereAuth, rolGestion, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = crearSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
    }
    const creado = await repo.crear({
      nombre: parsed.data.nombre,
      especialidad: parsed.data.especialidad ?? null,
    });
    return c.json(ok({ id: creado.id }), 201);
  });

  controller.patch("/profesionales/:id", requiereAuth, rolGestion, async (c) => {
    const id = c.req.param("id") ?? "";
    const body = await c.req.json().catch(() => null);
    const parsed = editarSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
    }
    try {
      const actualizado = await repo.actualizar(id, parsed.data);
      return c.json(ok({ id: actualizado.id }));
    } catch {
      throw new NoEncontradoError("Profesional no existe");
    }
  });

  /** Carga por profesional: pacientes activos + citas próximas 7 días (distribución equilibrada). */
  controller.get("/profesionales/carga", requiereAuth, async (c) => {
    const q = c.req.query("q");
    const pag = parsePaginacion(c.req.query());
    const profesionales = await repo.listar(true, q, { pagina: 1, limite: 200 });
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const en7dias = new Date(hoy);
    en7dias.setDate(en7dias.getDate() + 7);

    const carga = await Promise.all(
      profesionales.items.map(async (p) => {
        const pacientesActivos = await prisma.pacienteProfesional.count({
          where: { profesionalId: p.id, paciente: { activo: true } },
        });
        const citasProximas7dias = await prisma.cita.count({
          where: {
            paciente: { responsables: { some: { profesionalId: p.id } }, activo: true },
            estado: { in: [...ESTADOS_ACTIVOS] },
            fecha: { gte: hoy, lte: en7dias },
          },
        });
        return {
          id: p.id,
          nombre: p.nombre,
          especialidad: p.especialidad,
          pacientesActivos,
          citasProximas7dias,
        };
      }),
    );

    return c.json(
      ok({
        items: carga,
        total: profesionales.total,
        pagina: pag.pagina,
        limite: pag.limite,
      }),
    );
  });

  return controller;
}
