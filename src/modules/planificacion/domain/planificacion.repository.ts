import type {
  AvisoTipo,
  Banda,
  Canal,
  Cita,
  LoteEstado,
  LotePlanificacion,
  OrigenCita,
  Servicio,
} from "@prisma/client";
import type { Paginacion, Paginado } from "../../../common/paginacion";

export interface PropuestaNueva {
  pacienteId: string;
  tipoProcedimientoId: string;
  fecha: Date;
  servicio: Servicio;
  turno: number;
  horaEstimada: string;
  duracionMin: number;
  doctorId?: string | null;
  origen: OrigenCita;
  citaPreviaId?: string | null;
  justificacion: unknown;
}

export interface AvisoPorCrear {
  citaId: string;
  tipo: AvisoTipo;
  canal: Canal;
  mensaje: string;
  programadoPara: Date;
}

export interface LoteConCitas extends LotePlanificacion {
  citas: Array<
    Cita & {
      paciente: { nombres: string; banda: Banda; canal: Canal };
      tipoProcedimiento: { nombre: string };
      doctor: { nombre: string } | null;
    }
  >;
}

export abstract class PlanificacionRepository {
  abstract loteAbiertoExistente(): Promise<LotePlanificacion | null>;
  abstract listarLotes(estado: LoteEstado | undefined, pag: Paginacion): Promise<Paginado<LotePlanificacion>>;
  abstract buscarLoteConCitas(loteId: string): Promise<LoteConCitas | null>;
  abstract citasOtrasDeFechas(
    fechas: Date[],
    excluirLoteId: string,
  ): Promise<
    Array<{
      id: string;
      pacienteId?: string;
      fecha: Date;
      servicio: Servicio;
      doctorId: string | null;
      doctor: string | null;
      turno: number | null;
      horaEstimada: string | null;
      duracionMin: number;
      nombres: string;
      procedimiento: string;
      estado: string;
    }>
  >;
  abstract resumenPendientes(): Promise<{
    total: number;
    rojas: number;
    amarillas: number;
    verdes: number;
    hayLoteAbierto: boolean;
    loteAbiertoId: string | null;
  }>;
  abstract crearLoteAbierto(generadoPor: string, sinCupo: unknown): Promise<LotePlanificacion>;
  abstract crearPropuestas(loteId: string, propuestas: PropuestaNueva[]): Promise<void>;
  abstract rechazar(
    loteId: string,
    motivo: string | null,
    decididoPor: string,
  ): Promise<void>;
  /** Ejecuta la aprobación atómicamente; si el callback lanza, nada se persiste. */
  abstract enTransaccion<T>(fn: (tx: TxPlanificacion) => Promise<T>): Promise<T>;
}

export interface TxPlanificacion {
  aprobarPropuesta(propuestaId: string): Promise<void>;
  cancelarCitaPreviaSiActiva(citaPreviaId: string): Promise<void>;
  crearAvisos(avisos: AvisoPorCrear[]): Promise<void>;
  /** Cupo del (día, servicio, doctorId): CupoDiario.cantidad u HorarioMedico.cupo; null = día sin cupo. */
  cupoDe(fecha: Date, servicio: Servicio, doctorId: string | null): Promise<number | null>;
  /** Citas activas (PROPUESTA/PROGRAMADA/CONFIRMADA/EN_ATENCION) del (día, servicio, doctorId). */
  contarCitasActivas(fecha: Date, servicio: Servicio, doctorId: string | null): Promise<number>;
  marcarLoteAprobado(loteId: string, decididoPor: string): Promise<void>;
}
