import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import {
  AuditoriaRepository,
  type AuditoriaItem,
  type RegistroAuditoria,
} from "../domain/auditoria.repository";

export class PrismaAuditoriaRepository extends AuditoriaRepository {
  async registrar(registro: RegistroAuditoria): Promise<void> {
    await prisma.auditoria.create({
      data: {
        accion: registro.accion,
        entidad: registro.entidad,
        entidadId: registro.entidadId,
        actorId: registro.actorId,
        actorRol: registro.actorRol ?? null,
        detalle: registro.detalle as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listar(opts: {
    entidad?: string;
    entidadId?: string;
    limit: number;
    pagina?: number;
  }): Promise<AuditoriaItem[]> {
    const where: Prisma.AuditoriaWhereInput = {};
    if (opts.entidad) where.entidad = opts.entidad;
    if (opts.entidadId) where.entidadId = opts.entidadId;
    const pagina = opts.pagina && opts.pagina >= 1 ? opts.pagina : 1;
    const limite = Math.min(Math.max(opts.limit, 1), 500);

    const filas = await prisma.auditoria.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      skip: (pagina - 1) * limite,
      take: limite,
    });
    return filas.map((f) => ({
      id: f.id,
      actorId: f.actorId,
      actorRol: f.actorRol,
      accion: f.accion,
      entidad: f.entidad,
      entidadId: f.entidadId,
      detalle: f.detalle,
      creadoEn: f.creadoEn,
    }));
  }
}
