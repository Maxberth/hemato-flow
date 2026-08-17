import { Prisma, type TareaSocial } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import type { Paginacion } from "../../../common/paginacion";
import {
  TareaSocialRepository,
  type FiltrosTarea,
  type ListadoTareas,
  type TareaListado,
  type TareaNueva,
} from "../domain/tarea-social.repository";

export class PrismaTareaSocialRepository extends TareaSocialRepository {
  async crear(tarea: TareaNueva): Promise<TareaSocial> {
    return prisma.tareaSocial.create({ data: tarea });
  }

  async listar(filtros: FiltrosTarea, pag: Paginacion): Promise<ListadoTareas> {
    const where: Prisma.TareaSocialWhereInput = {
      estado: filtros.estado,
      tipo: filtros.tipo,
      ...(filtros.q
        ? { paciente: { nombres: { contains: filtros.q, mode: "insensitive" } } }
        : {}),
    };
    const include = {
      paciente: {
        include: {
          tipoProcedimiento: true,
          responsables: { include: { profesional: true } },
        },
      },
      cita: true,
    } as const;

    const [items, total] = await prisma.$transaction([
      prisma.tareaSocial.findMany({
        where,
        orderBy: { venceEn: "asc" },
        skip: (pag.pagina - 1) * pag.limite,
        take: pag.limite,
        include,
      }),
      prisma.tareaSocial.count({ where }),
    ]);
    const porEstado = await prisma.tareaSocial.groupBy({
      by: ["estado"],
      where,
      _count: { _all: true },
      orderBy: { estado: "asc" },
    });

    const ahora = new Date();
    const vencidas = await prisma.tareaSocial.count({
      where: { ...where, estado: { not: "RESUELTA" }, venceEn: { lt: ahora } },
    });
    const conteos = new Map(
      porEstado.map((g) => [g.estado, g._count._all ?? 0]),
    );

    return {
      items,
      total,
      pagina: pag.pagina,
      limite: pag.limite,
      resumen: {
        pendientes: conteos.get("PENDIENTE") ?? 0,
        enProceso: conteos.get("EN_PROCESO") ?? 0,
        resueltas: conteos.get("RESUELTA") ?? 0,
        vencidas,
        total,
      },
    };
  }

  async buscarPorId(id: string): Promise<TareaSocial | null> {
    return prisma.tareaSocial.findUnique({ where: { id } });
  }

  async tomar(id: string, asignadaA: string): Promise<TareaSocial> {
    return prisma.tareaSocial.update({
      where: { id },
      data: { estado: "EN_PROCESO", asignadaA },
    });
  }

  async resolver(id: string, resultado: string): Promise<TareaSocial> {
    return prisma.tareaSocial.update({
      where: { id },
      data: { estado: "RESUELTA", resultado, resueltaEn: new Date() },
    });
  }

  async existePendienteParaCita(citaId: string, tipo: TareaSocial["tipo"]): Promise<boolean> {
    const count = await prisma.tareaSocial.count({
      where: {
        citaId,
        tipo,
        estado: { in: ["PENDIENTE", "EN_PROCESO"] },
      },
    });
    return count > 0;
  }

  async buscarPendientePorCita(citaId: string, tipo: TareaSocial["tipo"]): Promise<TareaSocial | null> {
    return prisma.tareaSocial.findFirst({
      where: { citaId, tipo, estado: { in: ["PENDIENTE", "EN_PROCESO"] } },
    });
  }

  async marcarResultado(id: string, resultado: string): Promise<TareaSocial> {
    return prisma.tareaSocial.update({ where: { id }, data: { resultado } });
  }
}
