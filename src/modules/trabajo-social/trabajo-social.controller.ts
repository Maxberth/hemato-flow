import { Hono } from "hono";
import { z } from "zod";
import { actorDeJwt } from "../../common/actor";
import { DominioError } from "../../common/errors/dominio.error";
import { parsePaginacion } from "../../common/paginacion";
import { ok } from "../../common/response";
import { requiereAuth, requiereRol } from "../../common/middleware/requiere-rol";
import { CifradoReversiblePort } from "../../infrastructure/cifrado/cifrado.port";
import { AuditoriaRepository } from "../auditoria/domain/auditoria.repository";
import { prisma } from "../../infrastructure/prisma/prisma.service";
import type { TareaSocialRepository } from "./domain/tarea-social.repository";
import type { TomarTareaUseCase } from "./application/tomar-tarea.usecase";
import type { ResolverTareaUseCase } from "./application/resolver-tarea.usecase";

const filtrosSchema = z.object({
  estado: z.enum(["PENDIENTE", "EN_PROCESO", "RESUELTA"]).optional(),
  tipo: z.enum(["SILENCIO", "INASISTENCIA"]).optional(),
  q: z.string().optional(),
});

const resolverSchema = z.object({
  resultado: z.string().min(1, "resultado es obligatorio"),
});

export interface TrabajoSocialDeps {
  repo: TareaSocialRepository;
  cifrado: CifradoReversiblePort;
  auditoria: AuditoriaRepository;
  tomar: TomarTareaUseCase;
  resolver: ResolverTareaUseCase;
}

export function crearTrabajoSocialController(deps: TrabajoSocialDeps) {
  const controller = new Hono();
  const rol = requiereRol("ASISTENTE_SOCIAL", "ADMIN");

  /** GET /api/tareas-sociales?estado&tipo&q&pagina&limite — con paciente, responsables y teléfono descifrado. */
  controller.get("/tareas-sociales", requiereAuth, rol, async (c) => {
    const parsed = filtrosSchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new DominioError("FILTROS_INVALIDOS", "Filtros inválidos", 400);
    }
    const pag = parsePaginacion(c.req.query());

    const tareas = await deps.repo.listar(
      {
        estado: parsed.data.estado,
        tipo: parsed.data.tipo,
        q: parsed.data.q,
      },
      pag,
    );

    // El teléfono solo se expone aquí (ASISTENTE_SOCIAL/ADMIN) y queda auditado.
    const actor = actorDeJwt(c);
    const items = tareas.items.map((t) => {
      let telefono: string | null = null;
      try {
        telefono = deps.cifrado.descifrarNumero(t.paciente.numeroCifrado);
      } catch {
        telefono = null;
      }
      // Pacientes de Telegram no tienen teléfono: el contacto es su chat id.
      if (telefono?.startsWith("tg:")) {
        telefono = `Telegram · ${telefono.slice(3)}`;
      }
      return {
        id: t.id,
        tipo: t.tipo,
        estado: t.estado,
        venceEn: t.venceEn,
        asignadaA: t.asignadaA,
        resultado: t.resultado,
        resueltaEn: t.resueltaEn,
        citaId: t.citaId,
        vencida: t.venceEn.getTime() < Date.now() && t.estado !== "RESUELTA",
        paciente: {
          id: t.paciente.id,
          nombres: t.paciente.nombres,
          etiqueta: t.paciente.etiqueta,
          banda: t.paciente.banda,
          telefono,
          responsables: t.paciente.responsables.map((r) => r.profesional),
        },
        cita: t.cita
          ? { fecha: t.cita.fecha, horaEstimada: t.cita.horaEstimada, estado: t.cita.estado }
          : null,
      };
    });

    if (tareas.items.length > 0) {
      await deps.auditoria.registrar({
        accion: "VER_NUMERO",
        entidad: "TAREA_SOCIAL",
        actorId: actor.actorId,
        actorRol: actor.actorRol,
        detalle: { tareas: tareas.items.length },
      });
    }

    return c.json(
      ok({
        items,
        total: tareas.total,
        pagina: tareas.pagina,
        limite: tareas.limite,
        resumen: tareas.resumen,
      }),
    );
  });

  controller.post("/tareas-sociales/:id/tomar", requiereAuth, rol, async (c) => {
    const tomada = await deps.tomar.ejecutar(c.req.param("id") ?? "", actorDeJwt(c));
    return c.json(ok({ id: tomada.id, estado: tomada.estado }));
  });

  controller.post("/tareas-sociales/:id/resolver", requiereAuth, rol, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = resolverSchema.safeParse(body);
    if (!parsed.success) {
      throw new DominioError("DATOS_INVALIDOS", "resultado es obligatorio", 400);
    }
    const resuelta = await deps.resolver.ejecutar(c.req.param("id") ?? "", parsed.data.resultado, actorDeJwt(c));
    return c.json(ok({ id: resuelta.id, estado: resuelta.estado }));
  });

  /** GET /api/estadisticas/causas?desde&hasta — causas + SIN_RESPUESTA. */
  controller.get("/estadisticas/causas", requiereAuth, rol, async (c) => {
    const desdeRaw = c.req.query("desde");
    const hastaRaw = c.req.query("hasta");
    const desde = desdeRaw ? new Date(`${desdeRaw}T00:00:00`) : new Date("1970-01-01");
    const hasta = hastaRaw ? new Date(`${hastaRaw}T23:59:59`) : new Date();

    const causas = await prisma.causaInasistencia.groupBy({
      by: ["causa"],
      where: { creadoEn: { gte: desde, lte: hasta } },
      _count: { _all: true },
      orderBy: { _count: { causa: "desc" } },
    });

    const conCausa = causas.map((g) => ({ causa: g.causa, total: g._count._all }));

    // NO_LLEGO sin causa registrada cuentan como SIN_RESPUESTA.
    const noShowsSinCausa = await prisma.cita.count({
      where: {
        estado: "NO_LLEGO",
        fecha: { gte: desde, lte: hasta },
        causaInasistencia: null,
      },
    });

    const resultado =
      noShowsSinCausa > 0
        ? [...conCausa, { causa: "SIN_RESPUESTA", total: noShowsSinCausa }]
        : conCausa;

    return c.json(ok(resultado));
  });

  return controller;
}
