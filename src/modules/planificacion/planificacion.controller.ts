import { Hono } from "hono";
import { z } from "zod";
import { actorDeJwt } from "../../common/actor";
import { DominioError, NoEncontradoError } from "../../common/errors/dominio.error";
import { parsePaginacion } from "../../common/paginacion";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import { ConfiguracionService } from "../configuracion/application/configuracion.service";
import type { PlanificacionRepository } from "./domain/planificacion.repository";
import type { GenerarLoteUseCase } from "./application/generar-lote.usecase";
import type { AprobarLoteUseCase } from "./application/aprobar-lote.usecase";
import type { RechazarLoteUseCase } from "./application/rechazar-lote.usecase";

const estadoLoteSchema = z.enum(["ABIERTO", "APROBADO", "RECHAZADO"]);
const rechazarSchema = z.object({ motivo: z.string().min(1).optional() });

export interface PlanificacionDeps {
  repo: PlanificacionRepository;
  generar: GenerarLoteUseCase;
  aprobar: AprobarLoteUseCase;
  rechazar: RechazarLoteUseCase;
  config: ConfiguracionService;
}

export function crearPlanificacionController(deps: PlanificacionDeps) {
  const controller = new Hono();
  const rol = requiereRol("MEDICO", "ADMIN");

  /** POST /api/planificacion/lotes — generar lote (disparo manual del médico). */
  controller.post("/planificacion/lotes", requiereAuth, rol, async (c) => {
    const resultado = await deps.generar.ejecutar(actorDeJwt(c));
    return c.json(ok(resultado), 201);
  });

  /** GET /api/planificacion/pendientes-resumen — resumen de pacientes en espera para generar lote. */
  controller.get("/planificacion/pendientes-resumen", requiereAuth, rol, async (c) => {
    const resumen = await deps.repo.resumenPendientes();
    return c.json(ok(resumen));
  });

  controller.get("/planificacion/lotes", requiereAuth, rol, async (c) => {
    const estado = c.req.query("estado");
    if (estado && !estadoLoteSchema.safeParse(estado).success) {
      throw new DominioError("ESTADO_INVALIDO", "Estado de lote inválido", 400);
    }
    const pag = parsePaginacion(c.req.query());
    const lotes = await deps.repo.listarLotes(estado ? (estado as never) : undefined, pag);
    return c.json(ok(lotes));
  });

  /** GET /api/planificacion/lotes/:id — propuestas con turno/horaEstimada/doctor y horasApertura. */
  controller.get("/planificacion/lotes/:id", requiereAuth, rol, async (c) => {
    const lote = await deps.repo.buscarLoteConCitas(c.req.param("id") ?? "");
    if (!lote) throw new NoEncontradoError("Lote no existe");

    const turnos = await deps.config.obtener<{ horasApertura: string }>("turnos");

    // Citas del lote con su estado actual: PROPUESTA (ABIERTO) o PROGRAMADA
    // (APROBADO). Tras aprobar, el detalle sigue mostrando qué se programó.
    const propuestas = lote.citas.map((cita) => ({
      id: cita.id,
      pacienteId: cita.pacienteId,
      nombres: cita.paciente.nombres,
      banda: cita.paciente.banda,
      estado: cita.estado,
      servicio: cita.servicio,
      doctor: cita.doctor?.nombre ?? null,
      turno: cita.turno,
      horaEstimada: cita.horaEstimada,
      duracionMin: cita.duracionMin,
      fecha: cita.fecha,
      origen: cita.origen,
      justificacion: cita.justificacion,
    }));

    const fechas = [...new Set(lote.citas.map((c) => c.fecha.toISOString()))].map((f) => new Date(f));
    const citasOtras = await deps.repo.citasOtrasDeFechas(fechas, lote.id);

    return c.json(
      ok({
        id: lote.id,
        estado: lote.estado,
        generadoPor: lote.generadoPor,
        generadoEn: lote.generadoEn,
        decididoPor: lote.decididoPor,
        decididoEn: lote.decididoEn,
        motivoRechazo: lote.motivoRechazo,
        sinCupo: lote.sinCupo,
        horasApertura: turnos.horasApertura,
        propuestas,
        citasOtras: citasOtras.map((c) => ({
          ...c,
          fecha: c.fecha.toISOString(),
        })),
      }),
    );
  });

  controller.post("/planificacion/lotes/:id/aprobar", requiereAuth, rol, async (c) => {
    const resultado = await deps.aprobar.ejecutar(c.req.param("id") ?? "", actorDeJwt(c));
    return c.json(ok(resultado));
  });

  controller.post("/planificacion/lotes/:id/rechazar", requiereAuth, rol, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = rechazarSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", "motivo inválido", 400);
    }
    const resultado = await deps.rechazar.ejecutar(
      c.req.param("id") ?? "",
      actorDeJwt(c),
      parsed.data.motivo,
    );
    return c.json(ok(resultado));
  });

  return controller;
}
