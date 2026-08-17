import { Prisma, type Cita } from "@prisma/client";
import { fechaDbALocal } from "../../../common/hora";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import type { Paginacion, Paginado } from "../../../common/paginacion";
import {
  CitaRepository,
  type CitaListado,
  type FiltrosCita,
} from "../domain/cita.repository";

export class PrismaCitaRepository extends CitaRepository {
  private include = {
    paciente: { select: { id: true, nombres: true, etiqueta: true, banda: true, canal: true } },
    tipoProcedimiento: { select: { id: true, nombre: true, duracionMin: true } },
    lote: { select: { id: true, estado: true } },
    doctor: { select: { nombre: true } },
    causaInasistencia: { select: { causa: true } },
  } as const;

  private buildWhere(filtros: FiltrosCita): Prisma.CitaWhereInput {
    const where: Prisma.CitaWhereInput = {};
    if (filtros.desde || filtros.hasta) {
      where.fecha = { gte: filtros.desde, lte: filtros.hasta };
    }
    if (filtros.estado) where.estado = filtros.estado;
    if (filtros.pacienteId) where.pacienteId = filtros.pacienteId;
    if (filtros.q || filtros.etiqueta || filtros.banda) {
      where.paciente = {
        ...(filtros.q ? { nombres: { contains: filtros.q, mode: "insensitive" } } : {}),
        ...(filtros.etiqueta ? { etiqueta: filtros.etiqueta } : {}),
        ...(filtros.banda ? { banda: filtros.banda } : {}),
      };
    }
    return where;
  }

  async listar(filtros: FiltrosCita): Promise<CitaListado[]> {
    return prisma.cita.findMany({
      where: this.buildWhere(filtros),
      orderBy: [{ fecha: "asc" }, { turno: "asc" }],
      include: this.include,
    });
  }

  async listarPaginado(filtros: FiltrosCita, pag: Paginacion): Promise<Paginado<CitaListado>> {
    const where = this.buildWhere(filtros);
    const [items, total] = await prisma.$transaction([
      prisma.cita.findMany({
        where,
        orderBy: [{ fecha: "asc" }, { turno: "asc" }],
        skip: (pag.pagina - 1) * pag.limite,
        take: pag.limite,
        include: this.include,
      }),
      prisma.cita.count({ where }),
    ]);
    return { items, total, pagina: pag.pagina, limite: pag.limite };
  }

  async buscarPorId(id: string): Promise<Cita | null> {
    return prisma.cita.findUnique({ where: { id } });
  }

  async buscarConPaciente(id: string): Promise<CitaListado | null> {
    return prisma.cita.findUnique({
      where: { id },
      include: {
        paciente: { select: { id: true, nombres: true, etiqueta: true, banda: true, canal: true } },
        tipoProcedimiento: { select: { id: true, nombre: true, duracionMin: true } },
        lote: { select: { id: true, estado: true } },
        doctor: { select: { nombre: true } },
        causaInasistencia: { select: { causa: true } },
      },
    });
  }

  async marcarNoLlego(id: string): Promise<Cita> {
    return prisma.cita.update({ where: { id }, data: { estado: "NO_LLEGO" } });
  }

  async marcarEnAtencion(id: string): Promise<Cita> {
    return prisma.cita.update({ where: { id }, data: { estado: "EN_ATENCION" } });
  }

  async marcarAtendida(id: string, asistidaEn: Date): Promise<Cita> {
    const cita = await prisma.cita.update({
      where: { id },
      data: { estado: "ASISTIDA", asistidaEn },
      include: { paciente: { select: { id: true, frecuenciaDias: true } } },
    });
    // Recurrencia: siguiente sesión periódica → fechaObjetivo = fecha de la cita
    // + frecuenciaDias (el paciente vuelve a ser pendiente para el próximo lote).
    if (cita.paciente.frecuenciaDias && cita.paciente.frecuenciaDias > 0) {
      const base = fechaDbALocal(cita.fecha);
      const objetivo = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate() + cita.paciente.frecuenciaDias,
      );
      await prisma.paciente.update({
        where: { id: cita.pacienteId },
        data: { fechaObjetivo: objetivo },
      });
    }
    return cita;
  }

  async registrarLlegada(id: string, llegadaEn: Date): Promise<Cita> {
    return prisma.cita.update({ where: { id }, data: { llegadaEn } });
  }

  async cancelar(id: string, motivo: string): Promise<Cita> {
    return prisma.cita.update({
      where: { id },
      data: { estado: "CANCELADA", motivoCancelacion: motivo },
    });
  }

  async confirmar(id: string): Promise<Cita> {
    return prisma.cita.update({
      where: { id },
      data: { estado: "CONFIRMADA", confirmadaEn: new Date() },
    });
  }

  async buscarNoLlegoConCausaPendiente(pacienteId: string) {
    const cita = await prisma.cita.findFirst({
      where: {
        pacienteId,
        estado: "NO_LLEGO",
        causaInasistencia: null,
        avisos: { some: { tipo: "PREGUNTA_MOTIVO" } },
      },
      orderBy: { fecha: "desc" },
      select: { id: true, fecha: true, horaEstimada: true },
    });
    return cita;
  }

  async citasPendientesDoctor(fecha: Date, doctorId: string, turnoMax: number) {
    return prisma.cita.findMany({
      where: {
        fecha,
        doctorId,
        servicio: "CONSULTA",
        turno: { lt: turnoMax },
        llegadaEn: null,
        estado: { in: ["PROGRAMADA", "CONFIRMADA"] },
      },
      select: { id: true },
    });
  }
}
