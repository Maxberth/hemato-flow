import { Hono } from "hono";
import { z } from "zod";
import { actorDeJwt } from "../../common/actor";
import { DominioError, NoEncontradoError } from "../../common/errors/dominio.error";
import { parsePaginacion } from "../../common/paginacion";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import type { CitaRepository } from "./domain/cita.repository";
import type { RegistrarNoLlego } from "./application/registrar-no-llego";
import type { CancelarCitaUseCase } from "./application/cancelar-cita.usecase";

const filtrosSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estado: z
    .enum([
      "PROPUESTA",
      "PROGRAMADA",
      "CONFIRMADA",
      "EN_ATENCION",
      "ASISTIDA",
      "NO_LLEGO",
      "CANCELADA",
    ])
    .optional(),
  etiqueta: z.enum(["ROJA", "AMARILLA", "VERDE"]).optional(),
  banda: z.enum(["CERCANA", "REGIONAL", "DISTANTE"]).optional(),
  q: z.string().optional(),
});

const cancelarSchema = z.object({
  motivo: z.string().min(1, "motivo es obligatorio"),
});

export interface CitasDeps {
  repo: CitaRepository;
  registrarNoLlego: RegistrarNoLlego;
  cancelar: CancelarCitaUseCase;
}

export function crearCitasController(deps: CitasDeps) {
  const controller = new Hono();
  const rolCitas = requiereRol("MEDICO", "ADMIN", "ASISTENTE_SOCIAL");
  const rolGestion = requiereRol("MEDICO", "ADMIN");
  const rolStaff = requiereRol("MEDICO", "ADMIN", "ASISTENTE_SOCIAL", "ENFERMERO");

  controller.get("/citas", requiereAuth, rolCitas, async (c) => {
    const parsed = filtrosSchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new DominioError("FILTROS_INVALIDOS", "Filtros inválidos", 400);
    }
    const f = parsed.data;
    const pag = parsePaginacion(c.req.query());
    const resultado = await deps.repo.listarPaginado(
      {
        desde: f.desde ? new Date(`${f.desde}T00:00:00`) : undefined,
        hasta: f.hasta ? new Date(`${f.hasta}T00:00:00`) : undefined,
        estado: f.estado,
        etiqueta: f.etiqueta,
        banda: f.banda,
        q: f.q,
      },
      pag,
    );
    return c.json(ok(resultado));
  });

  /** POST /citas/:id/no-llego — marca manual NO_LLEGO (kanban/staff) + downstream. */
  controller.post("/citas/:id/no-llego", requiereAuth, rolStaff, async (c) => {
    await deps.registrarNoLlego(c.req.param("id") ?? "");
    return c.json(ok({ id: c.req.param("id"), estado: "NO_LLEGO" }));
  });

  /** POST /citas/:id/finalizar — EN_ATENCION → ASISTIDA (kanban/staff). */
  controller.post("/citas/:id/finalizar", requiereAuth, rolStaff, async (c) => {
    const id = c.req.param("id") ?? "";
    const cita = await deps.repo.buscarConPaciente(id);
    if (!cita) throw new NoEncontradoError("Cita no existe");
    if (cita.estado !== "EN_ATENCION") {
      throw new DominioError(
        "ESTADO_INVALIDO",
        `Solo una cita EN_ATENCION se finaliza (está ${cita.estado})`,
        400,
      );
    }
    const atendida = await deps.repo.marcarAtendida(id, new Date());
    return c.json(ok({ id: atendida.id, estado: atendida.estado }));
  });

  controller.post("/citas/:id/cancelar", requiereAuth, rolGestion, async (c) => {
    const id = c.req.param("id") ?? "";
    const body = await c.req.json().catch(() => null);
    const parsed = cancelarSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", "motivo es obligatorio", 400);
    }
    const cancelada = await deps.cancelar.ejecutar(id, parsed.data.motivo, actorDeJwt(c));
    return c.json(ok({ id: cancelada.id, estado: cancelada.estado }));
  });

  return controller;
}
