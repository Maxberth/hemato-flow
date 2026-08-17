import { Hono } from "hono";
import { z } from "zod";
import { actorDeJwt } from "../../common/actor";
import { DominioError } from "../../common/errors/dominio.error";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import type { CamillaRepository } from "./domain/camilla.repository";
import type { AtenderCamillaUseCase } from "./application/atender-camilla.usecase";
import type { AbrirDia } from "./application/abrir-dia";

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser yyyy-MM-dd");
const ocuparSchema = z
  .object({ citaId: z.string().min(1).optional(), pacienteId: z.string().min(1).optional() })
  .refine((v) => !!v.citaId || !!v.pacienteId, {
    message: "Debes indicar citaId o pacienteId",
  })
  .refine((v) => !(v.citaId && v.pacienteId), {
    message: "Indica solo citaId o solo pacienteId",
  });

function parseFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export interface AmbulatorioDeps {
  repo: CamillaRepository;
  atender: AtenderCamillaUseCase;
  abrirDia: AbrirDia;
}

export function crearAmbulatorioController(deps: AmbulatorioDeps) {
  const controller = new Hono();
  const rolDia = requiereRol("ENFERMERO", "ADMIN");

  /** GET /api/ambulatorio/dia?fecha — camillas con estado + cola del día ordenada por turno. */
  controller.get("/ambulatorio/dia", requiereAuth, rolDia, async (c) => {
    const fechaRaw = c.req.query("fecha") ?? new Date().toISOString().slice(0, 10);
    const parsed = fechaSchema.safeParse(fechaRaw);
    if (!parsed.success) {
      throw new DominioError("FECHA_INVALIDA", "fecha debe ser yyyy-MM-dd", 400);
    }
    const fecha = parseFecha(parsed.data);
    const [camillas, citas, cupo] = await Promise.all([
      deps.repo.listarDia(fecha),
      deps.repo.citasDelDia(fecha),
      deps.repo.cupoDelDia(fecha),
    ]);
    return c.json(
      ok({
        fecha: parsed.data,
        camillas: camillas.map((cm) => ({
          id: cm.id,
          numero: cm.numero,
          estado: cm.estado,
          citaId: cm.citaId,
          estadoDesde: cm.estadoDesde,
          cita: cm.cita,
        })),
        citas: citas.map((ct) => ({
          id: ct.id,
          pacienteId: ct.pacienteId,
          nombres: ct.nombres,
          etiqueta: ct.etiqueta,
          turno: ct.turno,
          horaEstimada: ct.horaEstimada,
          duracionMin: ct.duracionMin,
          estado: ct.estado,
          confirmadaEn: ct.confirmadaEn,
          llegadaEn: ct.llegadaEn,
        })),
        cupo: cupo ? { cantidad: cupo.cantidad, camillas: cupo.camillas } : null,
      }),
    );
  });

  /** POST /api/ambulatorio/dia/abrir — crea las camillas del día que falten. */
  controller.post("/ambulatorio/dia/abrir", requiereAuth, rolDia, async (c) => {
    const body = await c.req.json().catch(() => null);
    const fechaRaw = body?.fecha ?? new Date().toISOString().slice(0, 10);
    const parsed = fechaSchema.safeParse(fechaRaw);
    if (!parsed.success) {
      throw new DominioError("FECHA_INVALIDA", "fecha debe ser yyyy-MM-dd", 400);
    }
    const resultado = await deps.abrirDia(parseFecha(parsed.data));
    return c.json(ok({ fecha: parsed.data, ...resultado }));
  });

  /** POST /api/ambulatorio/camillas/:id/ocupar — {citaId} esperado o {pacienteId} walk-in. */
  controller.post("/ambulatorio/camillas/:id/ocupar", requiereAuth, rolDia, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ocuparSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new DominioError(
        "DATOS_INVALIDOS",
        parsed.error.issues[0]?.message ?? "citaId o pacienteId inválidos",
        400,
      );
    }
    const input = parsed.data.citaId
      ? { citaId: parsed.data.citaId }
      : { pacienteId: parsed.data.pacienteId! };
    const resultado = await deps.atender.ocupar(c.req.param("id") ?? "", input, actorDeJwt(c));
    return c.json(ok(resultado));
  });

  /** POST /api/ambulatorio/camillas/:id/retirar — OCUPADA → PREPARACION (cita → ASISTIDA). */
  controller.post("/ambulatorio/camillas/:id/retirar", requiereAuth, rolDia, async (c) => {
    const resultado = await deps.atender.retirar(c.req.param("id") ?? "", actorDeJwt(c));
    return c.json(ok(resultado));
  });

  /** POST /api/ambulatorio/camillas/:id/listo — PREPARACION → LIBRE. */
  controller.post("/ambulatorio/camillas/:id/listo", requiereAuth, rolDia, async (c) => {
    const resultado = await deps.atender.listo(c.req.param("id") ?? "", actorDeJwt(c));
    return c.json(ok(resultado));
  });

  /** GET /api/ambulatorio/historial?fecha — eventos de camillas con duración. */
  controller.get("/ambulatorio/historial", requiereAuth, rolDia, async (c) => {
    const fechaRaw = c.req.query("fecha") ?? new Date().toISOString().slice(0, 10);
    const parsed = fechaSchema.safeParse(fechaRaw);
    if (!parsed.success) {
      throw new DominioError("FECHA_INVALIDA", "fecha debe ser yyyy-MM-dd", 400);
    }
    const eventos = await deps.repo.historial(parseFecha(parsed.data));
    return c.json(
      ok(
        eventos.map((e) => ({
          id: e.id,
          camillaDiaId: e.camillaDiaId,
          numero: e.numero,
          citaId: e.citaId,
          pacienteId: e.pacienteId,
          estado: e.estado,
          inicio: e.inicio,
          fin: e.fin,
          duracionMin: e.duracionMin,
          nombres: e.nombres,
        })),
      ),
    );
  });

  return controller;
}
