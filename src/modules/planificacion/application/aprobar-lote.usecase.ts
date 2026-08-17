import type { Banda, Rol, Servicio } from "@prisma/client";
import { ConflictoError, NoEncontradoError } from "../../../common/errors/dominio.error";
import { fechaDbALocal, horaAMinutos } from "../../../common/hora";
import { ConfiguracionService } from "../../configuracion/application/configuracion.service";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { textoAviso } from "../../canal/application/plantillas";
import {
  PlanificacionRepository,
  type AvisoPorCrear,
} from "../domain/planificacion.repository";

interface ConfigNotificaciones {
  ventanaRecordatorioHoras: number;
  reintentosMax: number;
  reintentoEsperaMin: number;
  /** Escalera de recordatorios (horas antes de la cita), máx. 3 avisos en total
   *  según la cercanía: solo los rungs < horasAvance de la banda se programan. */
  recordatoriosHoras?: number[];
}

/**
 * Aprueba un lote ABIERTO: cada propuesta pasa a PROGRAMADA re-validando el
 * cupo por (fecha, servicio, doctorId) en BD, atómico — si las citas activas
 * exceden el cupo (CupoDiario.cantidad u HorarioMedico.cupo) se aborta TODO el
 * lote. Crea avisos AVISO_CITA/REPROGRAMACION y RECORDATORIO con la
 * anticipación de la banda, usando fecha + horaEstimada del turno.
 */
export class AprobarLoteUseCase {
  constructor(
    private readonly planificacion: PlanificacionRepository,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(loteId: string, actor: { actorId: string; actorRol: Rol | null }) {
    const lote = await this.planificacion.buscarLoteConCitas(loteId);
    if (!lote) throw new NoEncontradoError("Lote no existe");
    if (lote.estado !== "ABIERTO") {
      throw new ConflictoError("LOTE_NO_ABIERTO", "El lote ya fue decidido");
    }

    const bandas = await this.config.obtener<Record<Banda, { horasAvanceAviso: number }>>("bandas");
    const notif = await this.config.obtener<ConfigNotificaciones>("notificaciones");

    const propuestas = lote.citas.filter((c) => c.estado === "PROPUESTA");

    await this.planificacion.enTransaccion(async (tx) => {
      for (const propuesta of propuestas) {
        // Guard de cupo: las citas activas del (día, servicio, doctorId) no
        // pueden superar el cupo definido (ambulatorio: CupoDiario; consulta:
        // HorarioMedico del doctor). Incluye esta propuesta (ya es activa).
        const cupo = await tx.cupoDe(propuesta.fecha, propuesta.servicio as Servicio, propuesta.doctorId);
        if (cupo === null || cupo <= 0) {
          throw new ConflictoError(
            "CAPACIDAD_EXCEDIDA",
            `No hay cupo para el día ${propuesta.fecha.toISOString().slice(0, 10)} (${propuesta.servicio})`,
          );
        }
        const ocupadas = await tx.contarCitasActivas(
          propuesta.fecha,
          propuesta.servicio as Servicio,
          propuesta.doctorId,
        );
        if (ocupadas > cupo) {
          throw new ConflictoError(
            "CAPACIDAD_EXCEDIDA",
            `El cupo del día ${propuesta.fecha.toISOString().slice(0, 10)} (${cupo}) se excede con ${ocupadas} citas activas`,
          );
        }

        await tx.aprobarPropuesta(propuesta.id);

        // Reprogramación: la cita previa PROGRAMADA/CONFIRMADA se cancela; NO_LLEGO queda.
        if (propuesta.origen === "REPROGRAMACION" && propuesta.citaPreviaId) {
          await tx.cancelarCitaPreviaSiActiva(propuesta.citaPreviaId);
        }

        // Avisos con anticipación por banda y horaEstimada del turno.
        const horasAvance = bandas[propuesta.paciente.banda]?.horasAvanceAviso ?? 24;
        const inicioMin = horaAMinutos(propuesta.horaEstimada ?? "08:00");
        const fechaLocal = fechaDbALocal(propuesta.fecha);
        const fechaHora = new Date(
          fechaLocal.getFullYear(),
          fechaLocal.getMonth(),
          fechaLocal.getDate(),
          Math.floor(inicioMin / 60),
          inicioMin % 60,
        );
        const avisos: AvisoPorCrear[] = [
          {
            citaId: propuesta.id,
            tipo: propuesta.origen === "REPROGRAMACION" ? "REPROGRAMACION" : "AVISO_CITA",
            canal: propuesta.paciente.canal,
            mensaje: textoAviso(
              propuesta.origen === "REPROGRAMACION" ? "REPROGRAMACION" : "AVISO_CITA",
              {
                nombres: propuesta.paciente.nombres,
                fecha: fechaLocal,
                hora: propuesta.horaEstimada ?? "08:00",
                turno: propuesta.turno ?? undefined,
              },
            ),
            programadoPara: new Date(fechaHora.getTime() - horasAvance * 3_600_000),
          },
          // Recordatorios escalonados: hasta 3 notificaciones en total según qué
          // tan cerca esté el paciente (banda). Rungs fuera del alcance se omiten.
          ...(notif.recordatoriosHoras ?? [notif.ventanaRecordatorioHoras])
            .filter((h) => h > 0 && h < horasAvance)
            .map((h) => ({
              citaId: propuesta.id,
              tipo: "RECORDATORIO" as const,
              canal: propuesta.paciente.canal,
              mensaje: textoAviso("RECORDATORIO", {
                nombres: propuesta.paciente.nombres,
                fecha: fechaLocal,
                hora: propuesta.horaEstimada ?? "08:00",
                turno: propuesta.turno ?? undefined,
              }),
              programadoPara: new Date(fechaHora.getTime() - h * 3_600_000),
            })),
        ];
        await tx.crearAvisos(avisos);
      }

      await tx.marcarLoteAprobado(loteId, actor.actorId);
    });

    await this.auditoria.registrar({
      accion: "APROBAR_LOTE",
      entidad: "LOTE",
      entidadId: loteId,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { aprobadas: propuestas.length },
    });

    return { loteId, aprobadas: propuestas.length };
  }
}
