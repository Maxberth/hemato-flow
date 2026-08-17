import type { Aviso } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import type { Paginacion, Paginado } from "../../../common/paginacion";
import {
  AvisoRepository,
  type AvisoListado,
  type AvisoNuevo,
  type FiltrosAviso,
} from "../domain/aviso.repository";

export class PrismaAvisoRepository extends AvisoRepository {
  async crear(aviso: AvisoNuevo): Promise<Aviso> {
    return prisma.aviso.create({ data: aviso });
  }

  async listar(filtros: FiltrosAviso): Promise<AvisoListado[]> {
    return prisma.aviso.findMany({
      where: {
        estado: filtros.estado,
        citaId: filtros.citaId,
      },
      orderBy: { programadoPara: "asc" },
      include: {
        cita: { select: { paciente: { select: { nombres: true } } } },
      },
    });
  }

  async listarPaginado(filtros: FiltrosAviso, pag: Paginacion): Promise<Paginado<AvisoListado>> {
    const where = {
      estado: filtros.estado,
      citaId: filtros.citaId,
    };
    const [items, total] = await prisma.$transaction([
      prisma.aviso.findMany({
        where,
        orderBy: { programadoPara: "asc" },
        skip: (pag.pagina - 1) * pag.limite,
        take: pag.limite,
        include: {
          cita: { select: { paciente: { select: { nombres: true } } } },
        },
      }),
      prisma.aviso.count({ where }),
    ]);
    return { items, total, pagina: pag.pagina, limite: pag.limite };
  }

  async listarPendientesDeEnvio(ahora: Date) {
    return prisma.aviso.findMany({
      where: {
        estado: "PROGRAMADO",
        programadoPara: { lte: ahora },
        cita: {
          estado: { notIn: ["NO_LLEGO", "CANCELADA"] },
        },
      },
      orderBy: { programadoPara: "asc" },
      take: 100,
      include: {
        cita: {
          select: {
            paciente: { select: { numeroCifrado: true, canal: true, telegramChatId: true } },
          },
        },
      },
    });
  }

  async marcarEnviado(id: string, enviadoEn: Date): Promise<void> {
    await prisma.aviso.update({ where: { id }, data: { estado: "ENVIADO", enviadoEn } });
  }

  async marcarErrorReintento(id: string, error: string, reintentoEsperaMin: number): Promise<void> {
    await prisma.aviso.update({
      where: { id },
      data: {
        estado: "PROGRAMADO",
        intentos: { increment: 1 },
        error,
        programadoPara: new Date(Date.now() + reintentoEsperaMin * 60_000),
      },
    });
  }

  async marcarFallido(id: string, error: string): Promise<void> {
    await prisma.aviso.update({
      where: { id },
      data: { estado: "FALLIDO", error, enviadoEn: new Date() },
    });
  }

  async cancelarPendientesDeCita(citaId: string, error: string): Promise<number> {
    const resultado = await prisma.aviso.updateMany({
      where: { citaId, estado: "PROGRAMADO" },
      data: { estado: "FALLIDO", error, enviadoEn: new Date() },
    });
    return resultado.count;
  }
}
