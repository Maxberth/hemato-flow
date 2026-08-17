import { Prisma, type Paciente } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import type { Paginacion } from "../../../common/paginacion";
import {
  PacienteRepository,
  type FiltrosPaciente,
  type ListadoPacientes,
  type PacienteListado,
  type PacienteNuevo,
} from "../domain/paciente.repository";

export class PrismaPacienteRepository extends PacienteRepository {
  async crear(datos: PacienteNuevo): Promise<Paciente> {
    return prisma.paciente.create({ data: datos });
  }

  async buscarPorHash(numeroHash: string): Promise<Paciente | null> {
    return prisma.paciente.findUnique({ where: { numeroHash } });
  }

  async buscarPorTelegramChat(chatId: string): Promise<Paciente | null> {
    return prisma.paciente.findUnique({ where: { telegramChatId: chatId } });
  }

  async buscarPorId(id: string): Promise<Paciente | null> {
    return prisma.paciente.findUnique({ where: { id } });
  }

  async listar(filtros: FiltrosPaciente, pag: Paginacion): Promise<ListadoPacientes> {
    const where: Prisma.PacienteWhereInput = {};
    if (filtros.etiqueta) where.etiqueta = filtros.etiqueta;
    if (filtros.banda) where.banda = filtros.banda;
    if (filtros.activo !== undefined) where.activo = filtros.activo;
    if (filtros.hospitalizado !== undefined) where.hospitalizado = filtros.hospitalizado;
    if (filtros.q) {
      where.nombres = { contains: filtros.q, mode: "insensitive" };
    }

    const [items, total] = await prisma.$transaction([
      prisma.paciente.findMany({
        where,
        orderBy: { nombres: "asc" },
        skip: (pag.pagina - 1) * pag.limite,
        take: pag.limite,
        include: {
          tipoProcedimiento: true,
          responsables: { include: { profesional: { select: { id: true, nombre: true, especialidad: true } } } },
        },
      }),
      prisma.paciente.count({ where }),
    ]);
    const porEtiqueta = await prisma.paciente.groupBy({
      by: ["etiqueta"],
      where,
      _count: { _all: true },
      orderBy: { etiqueta: "asc" },
    });

    const conteos = new Map(
      porEtiqueta.map((g) => [g.etiqueta, g._count._all ?? 0]),
    );
    const distantes = await prisma.paciente.count({ where: { ...where, banda: "DISTANTE" } });

    return {
      items,
      total,
      pagina: pag.pagina,
      limite: pag.limite,
      resumen: {
        rojas: conteos.get("ROJA") ?? 0,
        amarillas: conteos.get("AMARILLA") ?? 0,
        verdes: conteos.get("VERDE") ?? 0,
        distantes,
      },
    };
  }

  async actualizar(
    id: string,
    datos: Partial<
      Pick<
        Paciente,
        | "nombres"
        | "etiqueta"
        | "banda"
        | "fechaObjetivo"
        | "canal"
        | "tipoProcedimientoId"
        | "frecuenciaDias"
        | "hospitalizado"
        | "activo"
        | "numeroHash"
        | "numeroCifrado"
        | "telegramChatId"
        | "horaPreferida"
      >
    >,
  ): Promise<Paciente> {
    return prisma.paciente.update({ where: { id }, data: datos });
  }

  async asignarResponsable(
    pacienteId: string,
    profesionalId: string,
    asignadoPor?: string,
  ): Promise<void> {
    await prisma.pacienteProfesional.create({
      data: { pacienteId, profesionalId, asignadoPor },
    });
  }

  async quitarResponsable(pacienteId: string, profesionalId: string): Promise<void> {
    await prisma.pacienteProfesional.delete({
      where: { pacienteId_profesionalId: { pacienteId, profesionalId } },
    });
  }
}
