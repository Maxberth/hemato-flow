import { Hono } from "hono";
import { z } from "zod";
import { DominioError } from "../../common/errors/dominio.error";
import { parsePaginacion } from "../../common/paginacion";
import { ok } from "../../common/response";
import { actorDeJwt } from "../../common/actor";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import {
  crearPacienteSchema,
  editarPacienteSchema,
  hospitalizacionSchema,
  importarCohorteSchema,
  responsableSchema,
} from "./dto/paciente.dto";
import type { PacienteRepository } from "./domain/paciente.repository";
import type { RegistrarPacienteUseCase } from "./application/registrar-paciente.usecase";
import type { EditarPacienteUseCase } from "./application/editar-paciente.usecase";
import type { ImportarCohorteUseCase } from "./application/importar-cohorte.usecase";
import type { CambiarHospitalizacionUseCase } from "./application/cambiar-hospitalizacion.usecase";
import type { AsignarResponsableUseCase } from "./application/asignar-responsable.usecase";
import type { QuitarResponsableUseCase } from "./application/quitar-responsable.usecase";

export interface PacientesDeps {
  repo: PacienteRepository;
  registrar: RegistrarPacienteUseCase;
  editar: EditarPacienteUseCase;
  importar: ImportarCohorteUseCase;
  hospitalizacion: CambiarHospitalizacionUseCase;
  asignarResponsable: AsignarResponsableUseCase;
  quitarResponsable: QuitarResponsableUseCase;
}

const filtrosSchema = z.object({
  etiqueta: z.enum(["ROJA", "AMARILLA", "VERDE"]).optional(),
  banda: z.enum(["CERCANA", "REGIONAL", "DISTANTE"]).optional(),
  activo: z.enum(["true", "false"]).optional(),
  hospitalizado: z.enum(["true", "false"]).optional(),
  q: z.string().optional(),
});

/** GET /api/pacientes NUNCA expone teléfono (RNF privacidad). */
function aPublico(p: Awaited<ReturnType<PacienteRepository["listar"]>>["items"][number]) {
  return {
    id: p.id,
    nombres: p.nombres,
    etiqueta: p.etiqueta,
    banda: p.banda,
    fechaObjetivo: p.fechaObjetivo,
    canal: p.canal,
    horaPreferida: p.horaPreferida,
    servicio: p.servicio,
    tipoProcedimiento: p.tipoProcedimiento,
    frecuenciaDias: p.frecuenciaDias,
    hospitalizado: p.hospitalizado,
    activo: p.activo,
    creadoEn: p.creadoEn,
    actualizadoEn: p.updatedAt,
    responsables: p.responsables.map((r) => r.profesional),
  };
}

export function crearPacientesController(deps: PacientesDeps) {
  const controller = new Hono();
  const rol = requiereRol("MEDICO", "ADMIN");

  controller.get("/pacientes", requiereAuth, requiereRol("MEDICO", "ADMIN", "ENFERMERO"), async (c) => {
    const parsed = filtrosSchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new DominioError("FILTROS_INVALIDOS", "Filtros inválidos", 400);
    }
    const f = parsed.data;
    const pag = parsePaginacion(c.req.query());
    const lista = await deps.repo.listar(
      {
        etiqueta: f.etiqueta,
        banda: f.banda,
        activo: f.activo !== undefined ? f.activo === "true" : true,
        hospitalizado: f.hospitalizado !== undefined ? f.hospitalizado === "true" : undefined,
        q: f.q,
      },
      pag,
    );
    return c.json(
      ok({
        items: lista.items.map(aPublico),
        total: lista.total,
        pagina: lista.pagina,
        limite: lista.limite,
        resumen: lista.resumen,
      }),
    );
  });

  controller.post("/pacientes", requiereAuth, rol, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = crearPacienteSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
    }
    const paciente = await deps.registrar.ejecutar(parsed.data, actorDeJwt(c));
    return c.json(ok({ id: paciente.id }), 201);
  });

  controller.patch("/pacientes/:id", requiereAuth, rol, async (c) => {
    const id = c.req.param("id") ?? "";
    const body = await c.req.json().catch(() => null);
    const parsed = editarPacienteSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
    }
    const actualizado = await deps.editar.ejecutar(id, parsed.data, actorDeJwt(c));
    return c.json(ok({ id: actualizado.id }));
  });

  /** POST /pacientes/:id/hora-preferida — la ENFERMERA asigna la hora fija de
   *  cita según la receta; queda guardada para futuras programaciones. */
  controller.post("/pacientes/:id/hora-preferida", requiereAuth, requiereRol("ENFERMERO", "MEDICO", "ADMIN"), async (c) => {
    const id = c.req.param("id") ?? "";
    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({
        horaPreferida: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horaPreferida debe ser HH:mm")
          .nullable(),
      })
      .safeParse(body ?? {});
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", "horaPreferida debe ser HH:mm o null", 400);
    }
    const actualizado = await deps.editar.ejecutar(
      id,
      { horaPreferida: parsed.data.horaPreferida },
      actorDeJwt(c),
    );
    return c.json(ok({ id: actualizado.id, horaPreferida: actualizado.horaPreferida }));
  });

  controller.post("/pacientes/importar", requiereAuth, rol, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = importarCohorteSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
    }
    const resultado = await deps.importar.ejecutar(parsed.data, actorDeJwt(c));
    return c.json(ok(resultado), 201);
  });

  controller.post("/pacientes/:id/hospitalizacion", requiereAuth, rol, async (c) => {
    const id = c.req.param("id") ?? "";
    const body = await c.req.json().catch(() => null);
    const parsed = hospitalizacionSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", "hospitalizado (boolean) es obligatorio", 400);
    }
    const paciente = await deps.hospitalizacion.ejecutar(id, parsed.data.hospitalizado, actorDeJwt(c));
    return c.json(ok({ id: paciente.id, hospitalizado: paciente.hospitalizado }));
  });

  controller.post("/pacientes/:id/responsables", requiereAuth, rol, async (c) => {
    const id = c.req.param("id") ?? "";
    const body = await c.req.json().catch(() => null);
    const parsed = responsableSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", "profesionalId es obligatorio", 400);
    }
    await deps.asignarResponsable.ejecutar(id, parsed.data.profesionalId, actorDeJwt(c));
    return c.json(ok({ id }));
  });

  controller.delete("/pacientes/:id/responsables", requiereAuth, rol, async (c) => {
    const id = c.req.param("id") ?? "";
    const body = await c.req.json().catch(() => null);
    const parsed = responsableSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", "profesionalId es obligatorio", 400);
    }
    await deps.quitarResponsable.ejecutar(id, parsed.data.profesionalId, actorDeJwt(c));
    return c.json(ok({ id }));
  });

  return controller;
}
