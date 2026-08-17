import type { Banda, Rol } from "@prisma/client";
import { ConflictoError } from "../../../common/errors/dominio.error";
import { fechaDbALocal, sumarDias } from "../../../common/hora";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import { ConfiguracionService } from "../../configuracion/application/configuracion.service";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import {
  PlanificacionRepository,
  type PropuestaNueva,
} from "../domain/planificacion.repository";
import {
  planificar,
  type CupoDia,
  type PacientePendiente,
  type PlanificacionConfig,
} from "../domain/planificador";
import {
  atendidoHoyOFuturo,
  consultaQuincenalVencida,
  DIAS_VENTANA_MOTOR,
  tieneCitaActiva,
  type PacienteRegla,
} from "../domain/consulta-quincenal";

const ESTADOS_ACTIVOS = ["PROPUESTA", "PROGRAMADA", "CONFIRMADA", "EN_ATENCION"] as const;

interface PendienteConOrigen extends PacientePendiente {
  tipoProcedimientoId: string;
  origen: "INICIAL" | "REPROGRAMACION";
  citaPreviaId: string | null;
}

interface ConfigTurnos {
  duracionEstimadaMin: number;
  horasApertura: string;
  diasPlazoConfirmacion: number;
  camillasPorDia: number;
}

interface ConfigConsultas {
  duracionEstimadaMin: number;
  diasPlazoConfirmacion: number;
  /** Consulta de seguimiento cada N días para pacientes en tratamiento. */
  periodoDias: number;
}

/** Ventana operativa del motor (días). La config "planificacion" se reemplazó
 * por "turnos"/"consultas"; el horizonte queda como constante del servicio.
 * MIN 0 = hoy puede ser candidato cuando el lead de la banda lo permite. */
const DIAS_MIN_HORIZONTE = 0;

const clavePendiente = (id: string, servicio: string) => `${id}|${servicio}`;

function claveFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Genera un lote de propuestas por TURNOS (disparo manual del médico).
 * Pendientes = pacientes activos no hospitalizados sin cita activa; los que
 * tienen una cita NO_LLEGO entran como REPROGRAMACION con citaPreviaId.
 * Cupos: AMBULATORIO desde CupoDiario (cantidad del día); CONSULTA desde
 * HorarioMedico (una fila por doctor/día). Las citas activas existentes se
 * restan del cupo por (fecha, servicio, doctorId).
 */
export class GenerarLoteUseCase {
  constructor(
    private readonly planificacion: PlanificacionRepository,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(actor: { actorId: string; actorRol: Rol | null }) {
    const abierto = await this.planificacion.loteAbiertoExistente();
    if (abierto) {
      throw new ConflictoError("LOTE_ABIERTO_EXISTE", "Ya existe un lote abierto por revisar");
    }

    const turnos = await this.config.obtener<ConfigTurnos>("turnos");
    const consultas = await this.config.obtener<ConfigConsultas>("consultas");
    const bandas = await this.config.obtener<Record<Banda, { horasAvanceAviso: number }>>("bandas");

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const desde = sumarDias(hoy, DIAS_MIN_HORIZONTE);
    const hasta = sumarDias(hoy, DIAS_VENTANA_MOTOR);

    const hoyUtc = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

    // Pendientes POR SERVICIO (el paciente puede necesitar su cita ambulatoria
    // Y su consulta de seguimiento quincenal a la vez):
    //   - CONSULTA: paciente nuevo (ingreso), sin cita activa ni atendida hoy/futuro.
    //   - AMBULATORIO: en tratamiento, sin cita activa ni atendida hoy/futuro.
    //   - Quincenal: en tratamiento → consulta de control cada `periodoDias`.
    const pacientes = await prisma.paciente.findMany({
      where: { activo: true, hospitalizado: false },
      include: {
        tipoProcedimiento: true,
        citas: {
          where: { estado: { in: [...ESTADOS_ACTIVOS, "ASISTIDA", "NO_LLEGO"] } },
          orderBy: { creadoEn: "desc" },
          select: { id: true, estado: true, servicio: true, fecha: true },
        },
      },
    });

    const pendientes: PendienteConOrigen[] = [];
    for (const p of pacientes) {
      const regla: PacienteRegla = {
        id: p.id,
        servicio: p.servicio,
        fechaObjetivo: p.fechaObjetivo,
        citas: p.citas,
      };
      const noLlegoDe = (svc: string) => p.citas.find((c) => c.estado === "NO_LLEGO" && c.servicio === svc);

      if (p.servicio === "CONSULTA") {
        // Paciente nuevo (ingreso): su primera consulta.
        if (!tieneCitaActiva(regla, "CONSULTA") && !atendidoHoyOFuturo(regla, "CONSULTA", hoyUtc)) {
          const nl = noLlegoDe("CONSULTA");
          pendientes.push({
            id: p.id,
            etiqueta: p.etiqueta,
            banda: p.banda,
            fechaObjetivo: p.fechaObjetivo,
            servicio: "CONSULTA",
            duracionMin: consultas.duracionEstimadaMin,
            tipoProcedimientoId: p.tipoProcedimientoId,
            origen: nl ? "REPROGRAMACION" : "INICIAL",
            citaPreviaId: nl?.id ?? null,
          });
        }
      } else {
        // En tratamiento: su cita ambulatoria (núcleo del sistema).
        if (!tieneCitaActiva(regla, "AMBULATORIO") && !atendidoHoyOFuturo(regla, "AMBULATORIO", hoyUtc)) {
          const nl = noLlegoDe("AMBULATORIO");
          pendientes.push({
            id: p.id,
            etiqueta: p.etiqueta,
            banda: p.banda,
            fechaObjetivo: p.fechaObjetivo,
            servicio: "AMBULATORIO",
            duracionMin: p.tipoProcedimiento.duracionMin,
            horaPreferida: p.horaPreferida,
            tipoProcedimientoId: p.tipoProcedimientoId,
            origen: nl ? "REPROGRAMACION" : "INICIAL",
            citaPreviaId: nl?.id ?? null,
          });
        }
        // Seguimiento quincenal en consulta (regla de negocio: cada 14 días).
        const quincenal = consultaQuincenalVencida(regla, hoy, hasta, consultas.periodoDias);
        if (quincenal) {
          pendientes.push({
            id: p.id,
            etiqueta: p.etiqueta,
            banda: p.banda,
            fechaObjetivo: quincenal.fechaObjetivo,
            servicio: "CONSULTA",
            duracionMin: consultas.duracionEstimadaMin,
            tipoProcedimientoId: p.tipoProcedimientoId,
            origen: "INICIAL",
            citaPreviaId: null,
          });
        }
      }
    }

    const [filasCupoDiario, filasHorario, citasActivas] = await Promise.all([
      prisma.cupoDiario.findMany({ where: { fecha: { gte: desde, lte: hasta } } }),
      prisma.horarioMedico.findMany({ where: { fecha: { gte: desde, lte: hasta } } }),
      prisma.cita.findMany({
        where: { fecha: { gte: desde, lte: hasta }, estado: { in: [...ESTADOS_ACTIVOS] } },
        select: { fecha: true, servicio: true, doctorId: true },
      }),
    ]);

    // Citas activas existentes por (fecha, servicio, doctorId) → restar del cupo.
    const usadas = new Map<string, number>();
    for (const c of citasActivas) {
      const clave = `${claveFecha(fechaDbALocal(c.fecha))}|${c.servicio}|${c.doctorId ?? ""}`;
      usadas.set(clave, (usadas.get(clave) ?? 0) + 1);
    }

    const cupos: CupoDia[] = [];
    for (const fila of filasCupoDiario) {
      const fecha = fechaDbALocal(fila.fecha);
      const cantidad = Math.max(0, fila.cantidad - (usadas.get(`${claveFecha(fecha)}|AMBULATORIO|`) ?? 0));
      if (cantidad > 0) {
        cupos.push({
          fecha,
          servicio: "AMBULATORIO",
          doctorId: null,
          cantidad,
          camillas: fila.camillas ?? 2,
        });
      }
    }
    for (const fila of filasHorario) {
      const fecha = fechaDbALocal(fila.fecha);
      const cantidad = Math.max(
        0,
        fila.cupo - (usadas.get(`${claveFecha(fecha)}|CONSULTA|${fila.profesionalId}`) ?? 0),
      );
      if (cantidad > 0) {
        cupos.push({ fecha, servicio: "CONSULTA", doctorId: fila.profesionalId, cantidad });
      }
    }

    const configPlan: PlanificacionConfig = {
      diasVentana: DIAS_VENTANA_MOTOR,
      diasMinHorizonte: DIAS_MIN_HORIZONTE,
      bandas,
      horasApertura: turnos.horasApertura,
    };
    const { propuestas, sinCupo } = planificar(pendientes, cupos, configPlan, hoy);

    const lote = await this.planificacion.crearLoteAbierto(
      actor.actorId,
      sinCupo.map((p) => p.id),
    );

    // Un paciente puede tener 2 pendientes (AMB + consulta quincenal) → clave (id, servicio).
    const porId = new Map(pendientes.map((p) => [clavePendiente(p.id, p.servicio), p]));
    const nuevas: PropuestaNueva[] = propuestas.map((pp) => {
      const pendiente = porId.get(clavePendiente(pp.pacienteId, pp.servicio))!;
      return {
        pacienteId: pp.pacienteId,
        tipoProcedimientoId: pendiente.tipoProcedimientoId,
        fecha: pp.fecha,
        servicio: pendiente.servicio,
        turno: pp.turno,
        horaEstimada: pp.horaEstimada,
        duracionMin: pp.duracionMin,
        doctorId: pp.doctorId,
        origen: pendiente.origen,
        citaPreviaId: pendiente.citaPreviaId,
        justificacion: pp.justificacion,
      };
    });
    await this.planificacion.crearPropuestas(lote.id, nuevas);

    await this.auditoria.registrar({
      accion: "GENERAR_LOTE",
      entidad: "LOTE",
      entidadId: lote.id,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { propuestas: nuevas.length, sinCupo: sinCupo.length },
    });

    return {
      loteId: lote.id,
      propuestas: nuevas.length,
      sinCupo: sinCupo.map((p) => p.id),
    };
  }
}
