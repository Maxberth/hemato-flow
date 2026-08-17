import type { LoteEstado, Servicio } from "@prisma/client";
import type { Paginacion, Paginado } from "../../../common/paginacion";
import { sumarDias } from "../../../common/hora";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import {
  PlanificacionRepository,
  type AvisoPorCrear,
  type LoteConCitas,
  type PropuestaNueva,
  type TxPlanificacion,
} from "../domain/planificacion.repository";
import {
  atendidoHoyOFuturo,
  consultaQuincenalVencida,
  DIAS_VENTANA_MOTOR,
  PERIODO_CONSULTA_DEFAULT,
  tieneCitaActiva,
  type PacienteRegla,
} from "../domain/consulta-quincenal";

const ESTADOS_ACTIVOS = ["PROPUESTA", "PROGRAMADA", "CONFIRMADA", "EN_ATENCION"] as const;

export class PrismaPlanificacionRepository extends PlanificacionRepository {
  async loteAbiertoExistente() {
    return prisma.lotePlanificacion.findFirst({ where: { estado: "ABIERTO" } });
  }

  async listarLotes(estado: LoteEstado | undefined, pag: Paginacion) {
    const where = estado ? { estado } : undefined;
    const [items, total] = await prisma.$transaction([
      prisma.lotePlanificacion.findMany({
        where,
        orderBy: { generadoEn: "desc" },
        skip: (pag.pagina - 1) * pag.limite,
        take: pag.limite,
      }),
      prisma.lotePlanificacion.count({ where }),
    ]);
    return { items, total, pagina: pag.pagina, limite: pag.limite };
  }

  async buscarLoteConCitas(loteId: string): Promise<LoteConCitas | null> {
    return prisma.lotePlanificacion.findUnique({
      where: { id: loteId },
      include: {
        citas: {
          include: {
            paciente: { select: { nombres: true, banda: true, canal: true } },
            tipoProcedimiento: { select: { nombre: true } },
            doctor: { select: { nombre: true } },
          },
          orderBy: [{ fecha: "asc" }, { turno: "asc" }],
        },
      },
    });
  }

  async citasOtrasDeFechas(fechas: Date[], excluirLoteId: string) {
    if (fechas.length === 0) return [];
    const citas = await prisma.cita.findMany({
      where: {
        fecha: { in: fechas },
        loteId: { not: excluirLoteId },
        estado: { in: ["PROGRAMADA", "CONFIRMADA", "EN_ATENCION"] },
      },
      include: {
        paciente: { select: { nombres: true } },
        tipoProcedimiento: { select: { nombre: true } },
        doctor: { select: { nombre: true } },
      },
      orderBy: [{ fecha: "asc" }, { turno: "asc" }],
    });
    return citas.map((c) => ({
      id: c.id,
      pacienteId: c.pacienteId,
      fecha: c.fecha,
      servicio: c.servicio as Servicio,
      doctorId: c.doctorId,
      doctor: c.doctor?.nombre ?? null,
      turno: c.turno,
      horaEstimada: c.horaEstimada,
      duracionMin: c.duracionMin,
      nombres: c.paciente.nombres,
      procedimiento: c.tipoProcedimiento.nombre,
      estado: c.estado,
    }));
  }

  async resumenPendientes() {
    const hoy = new Date();
    const hoyUtc = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    const hasta = sumarDias(hoy, DIAS_VENTANA_MOTOR);
    // Misma regla que generar-lote: pendiente si le falta su cita ambulatoria,
    // su consulta de ingreso (nuevo) o su consulta de seguimiento quincenal.
    const pacientes = await prisma.paciente.findMany({
      where: { activo: true, hospitalizado: false },
      select: {
        id: true,
        etiqueta: true,
        banda: true,
        servicio: true,
        fechaObjetivo: true,
        citas: {
          where: { estado: { in: [...ESTADOS_ACTIVOS, "ASISTIDA"] } },
          select: { estado: true, servicio: true, fecha: true },
        },
      },
    });

    const pendientes = pacientes.filter((p) => {
      const regla: PacienteRegla = {
        id: p.id,
        servicio: p.servicio,
        fechaObjetivo: p.fechaObjetivo,
        citas: p.citas,
      };
      if (p.servicio === "CONSULTA") {
        return !tieneCitaActiva(regla, "CONSULTA") && !atendidoHoyOFuturo(regla, "CONSULTA", hoyUtc);
      }
      const faltaAmbulatorio =
        !tieneCitaActiva(regla, "AMBULATORIO") && !atendidoHoyOFuturo(regla, "AMBULATORIO", hoyUtc);
      return faltaAmbulatorio || consultaQuincenalVencida(regla, hoy, hasta, PERIODO_CONSULTA_DEFAULT) !== null;
    });

    const loteAbierto = await prisma.lotePlanificacion.findFirst({
      where: { estado: "ABIERTO" },
      select: { id: true },
    });

    const rojas = pendientes.filter((p) => p.etiqueta === "ROJA").length;
    const amarillas = pendientes.filter((p) => p.etiqueta === "AMARILLA").length;
    const verdes = pendientes.filter((p) => p.etiqueta === "VERDE").length;

    return {
      total: pendientes.length,
      rojas,
      amarillas,
      verdes,
      hayLoteAbierto: !!loteAbierto,
      loteAbiertoId: loteAbierto?.id ?? null,
    };
  }

  async crearLoteAbierto(generadoPor: string, sinCupo: unknown) {
    return prisma.lotePlanificacion.create({
      data: { estado: "ABIERTO", generadoPor, sinCupo: sinCupo as never },
    });
  }

  async crearPropuestas(loteId: string, propuestas: PropuestaNueva[]): Promise<void> {
    await prisma.cita.createMany({
      data: propuestas.map((p) => ({
        pacienteId: p.pacienteId,
        loteId,
        tipoProcedimientoId: p.tipoProcedimientoId,
        fecha: p.fecha,
        servicio: p.servicio,
        doctorId: p.doctorId ?? null,
        turno: p.turno,
        horaEstimada: p.horaEstimada,
        duracionMin: p.duracionMin,
        estado: "PROPUESTA",
        origen: p.origen,
        citaPreviaId: p.citaPreviaId ?? null,
        justificacion: p.justificacion as never,
      })),
    });
  }

  async rechazar(loteId: string, motivo: string | null, decididoPor: string): Promise<void> {
    await prisma.$transaction([
      prisma.cita.deleteMany({ where: { loteId, estado: "PROPUESTA" } }),
      prisma.lotePlanificacion.update({
        where: { id: loteId },
        data: { estado: "RECHAZADO", decididoPor, decididoEn: new Date(), motivoRechazo: motivo },
      }),
    ]);
  }

  async enTransaccion<T>(fn: (tx: TxPlanificacion) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      const txImpl: TxPlanificacion = {
        aprobarPropuesta: async (propuestaId) => {
          await tx.cita.update({ where: { id: propuestaId }, data: { estado: "PROGRAMADA" } });
        },
        cancelarCitaPreviaSiActiva: async (citaPreviaId) => {
          const previa = await tx.cita.findUnique({
            where: { id: citaPreviaId },
            select: { estado: true },
          });
          if (previa && ["PROGRAMADA", "CONFIRMADA"].includes(previa.estado)) {
            await tx.cita.update({
              where: { id: citaPreviaId },
              data: { estado: "CANCELADA", motivoCancelacion: "REPROGRAMADA" },
            });
          }
        },
        crearAvisos: async (avisos: AvisoPorCrear[]) => {
          await tx.aviso.createMany({ data: avisos });
        },
        cupoDe: async (fecha, servicio, doctorId) => {
          if (servicio === "AMBULATORIO") {
            const fila = await tx.cupoDiario.findUnique({ where: { fecha } });
            return fila ? fila.cantidad : null;
          }
          if (!doctorId) return null;
          const fila = await tx.horarioMedico.findUnique({
            where: { profesionalId_fecha: { profesionalId: doctorId, fecha } },
          });
          return fila ? fila.cupo : null;
        },
        contarCitasActivas: async (fecha, servicio, doctorId) => {
          const where =
            servicio === "AMBULATORIO"
              ? { fecha, servicio, estado: { in: [...ESTADOS_ACTIVOS] } }
              : { fecha, servicio, doctorId, estado: { in: [...ESTADOS_ACTIVOS] } };
          return tx.cita.count({ where });
        },
        marcarLoteAprobado: async (loteId, decididoPor) => {
          await tx.lotePlanificacion.update({
            where: { id: loteId },
            data: { estado: "APROBADO", decididoPor, decididoEn: new Date() },
          });
        },
      };
      return fn(txImpl);
    });
  }
}
