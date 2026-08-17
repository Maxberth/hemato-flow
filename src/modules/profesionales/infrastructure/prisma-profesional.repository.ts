import { Prisma, type Profesional } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import type { Paginacion, Paginado } from "../../../common/paginacion";
import {
  ProfesionalRepository,
  type ProfesionalNuevo,
} from "../domain/profesional.repository";

export class PrismaProfesionalRepository extends ProfesionalRepository {
  async listar(
    activos: boolean | undefined,
    q: string | undefined,
    pag: Paginacion,
  ): Promise<Paginado<Profesional>> {
    const where: Prisma.ProfesionalWhereInput = {};
    if (activos !== undefined) where.activo = activos;
    if (q) {
      where.OR = [
        { nombre: { contains: q, mode: "insensitive" } },
        { especialidad: { contains: q, mode: "insensitive" } },
      ];
    }
    const [items, total] = await prisma.$transaction([
      prisma.profesional.findMany({
        where,
        orderBy: { nombre: "asc" },
        skip: (pag.pagina - 1) * pag.limite,
        take: pag.limite,
      }),
      prisma.profesional.count({ where }),
    ]);
    return { items, total, pagina: pag.pagina, limite: pag.limite };
  }

  async crear(datos: ProfesionalNuevo): Promise<Profesional> {
    return prisma.profesional.create({ data: datos });
  }

  async actualizar(
    id: string,
    datos: Partial<Pick<Profesional, "nombre" | "especialidad" | "activo">>,
  ): Promise<Profesional> {
    return prisma.profesional.update({ where: { id }, data: datos });
  }
}
