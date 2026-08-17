import type {
  Cita,
  Paciente,
  Profesional,
  TareaEstado,
  TareaSocial,
  TareaTipo,
  TipoProcedimiento,
} from "@prisma/client";
import type { Paginacion, Paginado } from "../../../common/paginacion";

export interface TareaNueva {
  pacienteId: string;
  citaId?: string | null;
  tipo: TareaTipo;
  venceEn: Date;
  /** Marcador de flujo (p. ej. "NEGACION" para las tareas del bot). */
  resultado?: string | null;
}

export interface FiltrosTarea {
  estado?: TareaEstado;
  tipo?: TareaTipo;
  /** Búsqueda por nombre del paciente (case-insensitive). */
  q?: string;
}

export interface TareaListado extends TareaSocial {
  paciente: Paciente & {
    tipoProcedimiento: TipoProcedimiento;
    responsables: Array<{ profesional: Profesional }>;
  };
  cita: Cita | null;
}

export interface ResumenTareas {
  pendientes: number;
  enProceso: number;
  resueltas: number;
  vencidas: number;
  total: number;
}

export interface ListadoTareas extends Paginado<TareaListado> {
  resumen: ResumenTareas;
}

export abstract class TareaSocialRepository {
  abstract crear(tarea: TareaNueva): Promise<TareaSocial>;
  abstract listar(filtros: FiltrosTarea, pag: Paginacion): Promise<ListadoTareas>;
  abstract buscarPorId(id: string): Promise<TareaSocial | null>;
  abstract tomar(id: string, asignadaA: string): Promise<TareaSocial>;
  abstract resolver(id: string, resultado: string): Promise<TareaSocial>;
  /** ¿Existe ya una tarea PENDIENTE/EN_PROCESO del tipo para la cita? */
  abstract existePendienteParaCita(citaId: string, tipo: TareaTipo): Promise<boolean>;
  /** Tarea PENDIENTE/EN_PROCESO del tipo para la cita (flujo de negación del bot). */
  abstract buscarPendientePorCita(citaId: string, tipo: TareaTipo): Promise<TareaSocial | null>;
  /** Registra el motivo en la tarea sin resolverla (etapa 2 del flujo de negación). */
  abstract marcarResultado(id: string, resultado: string): Promise<TareaSocial>;
}
