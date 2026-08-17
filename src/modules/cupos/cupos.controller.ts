import { Hono } from "hono";
import { z } from "zod";
import { actorDeJwt } from "../../common/actor";
import { DominioError, NoEncontradoError } from "../../common/errors/dominio.error";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import { prisma } from "../../infrastructure/prisma/prisma.service";
import type { AuditoriaRepository } from "../auditoria/domain/auditoria.repository";

const rangoSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const cupoPutSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser yyyy-MM-dd"),
  cantidad: z.number().int().min(0).max(500),
  camillas: z.number().int().min(0).max(50),
});

const horarioPutSchema = z.object({
  cupo: z.number().int().min(0).max(100),
});

function parseFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/**
 * Cupos operativos del nuevo modelo: CupoDiario (ambulatorio por día) y
 * HorarioMedico (consultas por doctor × día).
 */
export function crearCuposController(auditoria: AuditoriaRepository) {
  const controller = new Hono();
  const rolGestion = requiereRol("MEDICO", "ADMIN");

  /** GET /api/cupos?desde&hasta — cupos ambulatorios por día. */
  controller.get("/cupos", requiereAuth, async (c) => {
    const parsed = rangoSchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new DominioError("RANGO_INVALIDO", "desde y hasta deben ser yyyy-MM-dd", 400);
    }
    const desde = parseFecha(parsed.data.desde);
    const hasta = parseFecha(parsed.data.hasta);
    const filas = await prisma.cupoDiario.findMany({
      where: { fecha: { gte: desde, lte: hasta } },
      orderBy: { fecha: "asc" },
    });
    return c.json(
      ok(
        filas.map((f) => ({
          fecha: f.fecha.toISOString().slice(0, 10),
          cantidad: f.cantidad,
          camillas: f.camillas,
        })),
      ),
    );
  });

  /** PUT /api/cupos — upsert del cupo ambulatorio del día (cantidad + camillas). */
  controller.put("/cupos", requiereAuth, rolGestion, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = cupoPutSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError(
        "DATOS_INVALIDOS",
        parsed.error.issues[0]?.message ?? "fecha, cantidad y camillas son obligatorios",
        400,
      );
    }
    const { fecha, cantidad, camillas } = parsed.data;
    const fechaDate = parseFecha(fecha);
    await prisma.cupoDiario.upsert({
      where: { fecha: fechaDate },
      update: { cantidad, camillas },
      create: { fecha: fechaDate, cantidad, camillas },
    });
    await auditoria.registrar({
      accion: "EDITAR_CUPO",
      entidad: "CUPO_DIARIO",
      entidadId: fecha,
      ...actorDeJwt(c),
      detalle: { fecha, cantidad, camillas },
    });
    return c.json(ok({ fecha, cantidad, camillas }));
  });

  /** GET /api/horario-medico?desde&hasta — cupos de consulta por doctor × día. */
  controller.get("/horario-medico", requiereAuth, async (c) => {
    const parsed = rangoSchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new DominioError("RANGO_INVALIDO", "desde y hasta deben ser yyyy-MM-dd", 400);
    }
    const desde = parseFecha(parsed.data.desde);
    const hasta = parseFecha(parsed.data.hasta);
    const filas = await prisma.horarioMedico.findMany({
      where: { fecha: { gte: desde, lte: hasta } },
      include: { profesional: { select: { nombre: true } } },
      orderBy: [{ fecha: "asc" }, { profesionalId: "asc" }],
    });
    return c.json(
      ok(
        filas.map((f) => ({
          id: f.id,
          profesionalId: f.profesionalId,
          profesional: f.profesional.nombre,
          fecha: f.fecha.toISOString().slice(0, 10),
          cupo: f.cupo,
        })),
      ),
    );
  });

  /** PUT /api/horario-medico/:profesionalId/:fecha — upsert del cupo del doctor ese día. */
  controller.put("/horario-medico/:profesionalId/:fecha", requiereAuth, rolGestion, async (c) => {
    const profesionalId = c.req.param("profesionalId") ?? "";
    const fechaRaw = c.req.param("fecha") ?? "";
    const body = await c.req.json().catch(() => null);
    const parsedFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(fechaRaw);
    const parsed = horarioPutSchema.safeParse(body);
    if (!parsedFecha.success || !parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", "fecha (yyyy-MM-dd) y cupo son obligatorios", 400);
    }
    const profesional = await prisma.profesional.findUnique({
      where: { id: profesionalId },
      select: { id: true },
    });
    if (!profesional) throw new NoEncontradoError("Profesional no existe");

    const fechaDate = parseFecha(fechaRaw);
    await prisma.horarioMedico.upsert({
      where: { profesionalId_fecha: { profesionalId, fecha: fechaDate } },
      update: { cupo: parsed.data.cupo },
      create: { profesionalId, fecha: fechaDate, cupo: parsed.data.cupo },
    });
    await auditoria.registrar({
      accion: "EDITAR_HORARIO_MEDICO",
      entidad: "HORARIO_MEDICO",
      entidadId: `${profesionalId}:${fechaRaw}`,
      ...actorDeJwt(c),
      detalle: { profesionalId, fecha: fechaRaw, cupo: parsed.data.cupo },
    });
    return c.json(ok({ profesionalId, fecha: fechaRaw, cupo: parsed.data.cupo }));
  });

  return controller;
}
