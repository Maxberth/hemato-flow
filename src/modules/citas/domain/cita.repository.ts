import type {
  Banda,
  Cita,
  CitaEstado,
  Etiqueta,
  LotePlanificacion,
  Paciente,
  TipoProcedimiento,
} from "@prisma/client";
import type { Paginacion, Paginado } from "../../../common/paginacion";

export interface CitaListado extends Cita {
  paciente: Pick<Paciente, "id" | "nombres" | "etiqueta" | "banda" | "canal">;
  tipoProcedimiento: Pick<TipoProcedimiento, "id" | "nombre" | "duracionMin">;
  lote: Pick<LotePlanificacion, "id" | "estado"> | null;
  doctor: { nombre: string } | null;
  causaInasistencia: { causa: string } | null;
}

export interface FiltrosCita {
  desde?: Date;
  hasta?: Date;
  estado?: CitaEstado;
  pacienteId?: string;
  /** Búsqueda por nombre del paciente (case-insensitive). */
  q?: string;
  etiqueta?: Etiqueta;
  banda?: Banda;
}

export abstract class CitaRepository {
  abstract listar(filtros: FiltrosCita): Promise<CitaListado[]>;
  abstract listarPaginado(filtros: FiltrosCita, pag: Paginacion): Promise<Paginado<CitaListado>>;
  abstract buscarPorId(id: string): Promise<Cita | null>;
  abstract buscarConPaciente(id: string): Promise<CitaListado | null>;
  /** Marca NO_LLEGO manual (kanban/staff). */
  abstract marcarNoLlego(id: string): Promise<Cita>;
  /** EN_ATENCION (inicio de atención en camilla/consulta). */
  abstract marcarEnAtencion(id: string): Promise<Cita>;
  /** ASISTIDA + asistidaEn (fin de atención). */
  abstract marcarAtendida(id: string, asistidaEn: Date): Promise<Cita>;
  /** Check-in manual del día (consulta): llegadaEn = ahora. */
  abstract registrarLlegada(id: string, llegadaEn: Date): Promise<Cita>;
  abstract cancelar(id: string, motivo: string): Promise<Cita>;
  /** Confirma la cita (bot): CONFIRMADA + confirmadaEn. */
  abstract confirmar(id: string): Promise<Cita>;
  /** NO_LLEGO más reciente sin CausaInasistencia y con aviso PREGUNTA_MOTIVO. */
  abstract buscarNoLlegoConCausaPendiente(
    pacienteId: string,
  ): Promise<{ id: string; fecha: Date; horaEstimada: string | null } | null>;
  /** Citas CONSULTA del (doctor, fecha) con turno < turnoMax, sin check-in,
   *  PROGRAMADA/CONFIRMADA — objetivo del NO_LLEGO automático al atender. */
  abstract citasPendientesDoctor(
    fecha: Date,
    doctorId: string,
    turnoMax: number,
  ): Promise<Array<{ id: string }>>;
}
