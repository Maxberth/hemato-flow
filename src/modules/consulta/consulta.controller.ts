import { Hono } from "hono";
import { z } from "zod";
import { DominioError } from "../../common/errors/dominio.error";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import { prisma } from "../../infrastructure/prisma/prisma.service";
import type { AtenderConsultaUseCase } from "./application/atender-consulta.usecase";

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser yyyy-MM-dd");

function parseFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export interface ConsultaDeps {
  atender: AtenderConsultaUseCase;
}

export function crearConsultaController(deps: ConsultaDeps) {
  const controller = new Hono();
  const rol = requiereRol("MEDICO", "ENFERMERO", "ADMIN");

  /** GET /api/consulta/dia?fecha — citas del día por doctor (turno, horaEstimada, estado, llegadaEn). */
  controller.get("/consulta/dia", requiereAuth, rol, async (c) => {
    const fechaRaw = c.req.query("fecha") ?? new Date().toISOString().slice(0, 10);
    const parsed = fechaSchema.safeParse(fechaRaw);
    if (!parsed.success) {
      throw new DominioError("FECHA_INVALIDA", "fecha debe ser yyyy-MM-dd", 400);
    }
    const fecha = parseFecha(parsed.data);
    const fechaUtc = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));

    const citas = await prisma.cita.findMany({
      where: { fecha: fechaUtc, servicio: "CONSULTA" },
      include: {
        paciente: { select: { id: true, nombres: true, etiqueta: true } },
        doctor: { select: { id: true, nombre: true } },
      },
      orderBy: [{ turno: "asc" }, { creadoEn: "asc" }],
    });

    // Agrupación por doctor (los sin doctor van a un grupo "Sin asignar").
    const grupos = new Map<string, { doctorId: string | null; doctor: string | null; citas: unknown[] }>();
    for (const cita of citas) {
      const clave = cita.doctorId ?? "sin-doctor";
      let grupo = grupos.get(clave);
      if (!grupo) {
        grupo = {
          doctorId: cita.doctorId,
          doctor: cita.doctor?.nombre ?? null,
          citas: [],
        };
        grupos.set(clave, grupo);
      }
      grupo.citas.push({
        id: cita.id,
        pacienteId: cita.pacienteId,
        nombres: cita.paciente.nombres,
        etiqueta: cita.paciente.etiqueta,
        turno: cita.turno,
        horaEstimada: cita.horaEstimada,
        estado: cita.estado,
        llegadaEn: cita.llegadaEn,
        confirmadaEn: cita.confirmadaEn,
      });
    }

    return c.json(ok({ fecha: parsed.data, doctores: [...grupos.values()] }));
  });

  /** POST /api/consulta/citas/:id/llegada — check-in manual (FCFS). 409 si ya llegó. */
  controller.post("/consulta/citas/:id/llegada", requiereAuth, rol, async (c) => {
    const cita = await deps.atender.registrarLlegada(c.req.param("id") ?? "");
    return c.json(ok({ id: cita.id, llegadaEn: cita.llegadaEn }));
  });

  /** POST /api/consulta/citas/:id/atender — EN_ATENCION + NO_LLEGO automático de saltados. */
  controller.post("/consulta/citas/:id/atender", requiereAuth, rol, async (c) => {
    const resultado = await deps.atender.atender(c.req.param("id") ?? "");
    return c.json(ok({ id: resultado.cita.id, estado: resultado.cita.estado, noLlegos: resultado.noLlegos }));
  });

  /** POST /api/consulta/citas/:id/finalizar — ASISTIDA + asistidaEn. */
  controller.post("/consulta/citas/:id/finalizar", requiereAuth, rol, async (c) => {
    const cita = await deps.atender.finalizar(c.req.param("id") ?? "");
    return c.json(ok({ id: cita.id, estado: cita.estado, asistidaEn: cita.asistidaEn }));
  });

  return controller;
}
