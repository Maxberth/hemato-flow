import type { CamillaEstado } from "@prisma/client";
import { fechaDbALocal } from "../../../common/hora";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import {
  CamillaRepository,
  type CamillaDelDia,
  type CitaDia,
  type EventoCamilla,
  type TxCamilla,
} from "../domain/camilla.repository";

/** Convierte fecha a medianoche local → instante UTC del MISMO día (comparación @db.Date). */
function fechaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export class PrismaCamillaRepository extends CamillaRepository {
  private includeCita = {
    cita: {
      select: {
        id: true,
        pacienteId: true,
        turno: true,
        paciente: { select: { nombres: true } },
      },
    },
  } as const;

  async listarDia(fecha: Date): Promise<CamillaDelDia[]> {
    const filas = await prisma.camillaDia.findMany({
      where: { fecha: fechaUtc(fecha) },
      include: this.includeCita,
      orderBy: { numero: "asc" },
    });
    return filas.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      numero: c.numero,
      estado: c.estado,
      citaId: c.citaId,
      estadoDesde: c.estadoDesde,
      cita: c.cita
        ? {
            id: c.cita.id,
            pacienteId: c.cita.pacienteId,
            nombres: c.cita.paciente.nombres,
            turno: c.cita.turno,
          }
        : null,
    }));
  }

  async crearDias(fecha: Date, n: number): Promise<CamillaDelDia[]> {
    const fechaDia = fechaUtc(fecha);
    const existentes = await prisma.camillaDia.findMany({
      where: { fecha: fechaDia },
      select: { numero: true },
    });
    const numeros = new Set(existentes.map((c) => c.numero));
    const faltantes: number[] = [];
    for (let i = 1; i <= n; i += 1) {
      if (!numeros.has(i)) faltantes.push(i);
    }
    if (faltantes.length > 0) {
      await prisma.camillaDia.createMany({
        data: faltantes.map((numero) => ({ fecha: fechaDia, numero })),
      });
    }
    return this.listarDia(fecha);
  }

  async citasDelDia(fecha: Date): Promise<CitaDia[]> {
    const citas = await prisma.cita.findMany({
      // La cola del día muestra citas reales: se omiten las PROPUESTA de un
      // lote abierto (aún no aprobadas).
      where: { fecha: fechaUtc(fecha), servicio: "AMBULATORIO", estado: { not: "PROPUESTA" } },
      include: {
        paciente: { select: { nombres: true, etiqueta: true } },
      },
      orderBy: [{ turno: "asc" }, { creadoEn: "asc" }],
    });
    return citas.map((c) => ({
      id: c.id,
      pacienteId: c.pacienteId,
      fecha: c.fecha,
      servicio: c.servicio,
      nombres: c.paciente.nombres,
      etiqueta: c.paciente.etiqueta,
      turno: c.turno,
      horaEstimada: c.horaEstimada,
      duracionMin: c.duracionMin,
      estado: c.estado,
      confirmadaEn: c.confirmadaEn,
      llegadaEn: c.llegadaEn,
    }));
  }

  async cupoDelDia(fecha: Date) {
    const fila = await prisma.cupoDiario.findUnique({ where: { fecha: fechaUtc(fecha) } });
    if (!fila) return null;
    return { cantidad: fila.cantidad, camillas: fila.camillas };
  }

  async historial(fecha: Date): Promise<EventoCamilla[]> {
    const eventos = await prisma.camillaEvento.findMany({
      where: { fecha: fechaUtc(fecha) },
      include: {
        camillaDia: { select: { numero: true } },
      },
      orderBy: { inicio: "asc" },
    });
    // CamillaEvento no tiene relación con Paciente (schema del plan): los
    // nombres se resuelven con una consulta aparte por pacienteId.
    const pacienteIds = [...new Set(eventos.map((e) => e.pacienteId).filter((p): p is string => !!p))];
    const pacientes = pacienteIds.length > 0
      ? await prisma.paciente.findMany({
          where: { id: { in: pacienteIds } },
          select: { id: true, nombres: true },
        })
      : [];
    const nombresPorId = new Map(pacientes.map((p) => [p.id, p.nombres]));
    return eventos.map((e) => ({
      id: e.id,
      camillaDiaId: e.camillaDiaId,
      numero: e.camillaDia.numero,
      citaId: e.citaId,
      pacienteId: e.pacienteId,
      estado: e.estado,
      inicio: e.inicio,
      fin: e.fin,
      duracionMin: e.duracionMin,
      nombres: e.pacienteId ? (nombresPorId.get(e.pacienteId) ?? null) : null,
    }));
  }

  async buscarCitaActiva(pacienteId: string) {
    return prisma.cita.findFirst({
      where: {
        pacienteId,
        servicio: "AMBULATORIO",
        estado: { in: ["PROGRAMADA", "CONFIRMADA", "EN_ATENCION"] },
      },
      orderBy: { fecha: "asc" },
      select: { id: true, estado: true },
    });
  }

  async enTransaccion<T>(fn: (tx: TxCamilla) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      const txImpl: TxCamilla = {
        camilla: async (camillaId) => {
          const c = await tx.camillaDia.findUnique({
            where: { id: camillaId },
            include: this.includeCita,
          });
          if (!c) return null;
          return {
            id: c.id,
            fecha: c.fecha,
            numero: c.numero,
            estado: c.estado,
            citaId: c.citaId,
            estadoDesde: c.estadoDesde,
            cita: c.cita
              ? {
                  id: c.cita.id,
                  pacienteId: c.cita.pacienteId,
                  nombres: c.cita.paciente.nombres,
                  turno: c.cita.turno,
                }
              : null,
          };
        },
        citaParaCamilla: async (citaId) => {
          const c = await tx.cita.findUnique({
            where: { id: citaId },
            include: { paciente: { select: { nombres: true, etiqueta: true } } },
          });
          if (!c) return null;
          return {
            id: c.id,
            pacienteId: c.pacienteId,
            fecha: c.fecha,
            servicio: c.servicio,
            nombres: c.paciente.nombres,
            etiqueta: c.paciente.etiqueta,
            turno: c.turno,
            horaEstimada: c.horaEstimada,
            duracionMin: c.duracionMin,
            estado: c.estado,
            confirmadaEn: c.confirmadaEn,
            llegadaEn: c.llegadaEn,
          };
        },
        ocuparCamilla: async (camillaId, citaId, pacienteId, estadoDesde) => {
          await tx.camillaDia.update({
            where: { id: camillaId },
            data: { estado: "OCUPADA", citaId, estadoDesde },
          });
        },
        retirarCamilla: async (camillaId, estadoDesde) => {
          await tx.camillaDia.update({
            where: { id: camillaId },
            data: { estado: "PREPARACION", estadoDesde },
          });
        },
        marcarCamillaListo: async (camillaId, estadoDesde) => {
          await tx.camillaDia.update({
            where: { id: camillaId },
            data: { estado: "LIBRE", citaId: null, estadoDesde },
          });
        },
        marcarEnAtencion: async (citaId) => {
          await tx.cita.update({ where: { id: citaId }, data: { estado: "EN_ATENCION" } });
        },
        marcarAtendida: async (citaId, asistidaEn) => {
          const cita = await tx.cita.update({
            where: { id: citaId },
            data: { estado: "ASISTIDA", asistidaEn },
            include: { paciente: { select: { id: true, frecuenciaDias: true } } },
          });
          // Recurrencia: avanza fechaObjetivo para la próxima sesión periódica.
          if (cita.paciente.frecuenciaDias && cita.paciente.frecuenciaDias > 0) {
            const base = fechaDbALocal(cita.fecha);
            const objetivo = new Date(
              base.getFullYear(),
              base.getMonth(),
              base.getDate() + cita.paciente.frecuenciaDias,
            );
            await tx.paciente.update({
              where: { id: cita.pacienteId },
              data: { fechaObjetivo: objetivo },
            });
          }
        },
        citasAmbulatorioDia: async (fecha) => {
          const citas = await tx.cita.findMany({
            where: { fecha: fechaUtc(fecha), servicio: "AMBULATORIO" },
            include: { paciente: { select: { nombres: true, etiqueta: true } } },
            orderBy: [{ turno: "asc" }, { creadoEn: "asc" }],
          });
          return citas.map((c) => ({
            id: c.id,
            pacienteId: c.pacienteId,
            fecha: c.fecha,
            servicio: c.servicio,
            nombres: c.paciente.nombres,
            etiqueta: c.paciente.etiqueta,
            turno: c.turno,
            horaEstimada: c.horaEstimada,
            duracionMin: c.duracionMin,
            estado: c.estado,
            confirmadaEn: c.confirmadaEn,
            llegadaEn: c.llegadaEn,
          }));
        },
        crearEvento: async (data) => {
          const fechaDia = fechaUtc(new Date(data.inicio.getFullYear(), data.inicio.getMonth(), data.inicio.getDate()));
          await tx.camillaEvento.create({ data: { ...data, fecha: fechaDia } });
        },
        cerrarEventoAbierto: async (camillaDiaId, estado, fin) => {
          const abierto = await tx.camillaEvento.findFirst({
            where: { camillaDiaId, estado, fin: null },
            orderBy: { inicio: "desc" },
            select: { id: true, inicio: true },
          });
          if (abierto) {
            // La duración SIEMPRE se calcula de fin − inicio (nunca se pasa por
            // el llamador: retirar/listo lo hacían con 0 fijo).
            const duracionMin = Math.max(0, Math.round((fin.getTime() - abierto.inicio.getTime()) / 60_000));
            await tx.camillaEvento.update({
              where: { id: abierto.id },
              data: { fin, duracionMin },
            });
          }
        },
      };
      return fn(txImpl);
    });
  }
}
