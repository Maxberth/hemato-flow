/** Tipos de la API HematoFlow (respuestas {success, data}). */

export type Etiqueta = "ROJA" | "AMARILLA" | "VERDE";
export type Banda = "CERCANA" | "REGIONAL" | "DISTANTE";
export type Canal = "WHATSAPP" | "TELEGRAM";
export type Servicio = "AMBULATORIO" | "CONSULTA";
export type CamillaEstado = "LIBRE" | "OCUPADA" | "PREPARACION";
export type CitaEstado =
  | "PROPUESTA"
  | "PROGRAMADA"
  | "CONFIRMADA"
  | "EN_ATENCION"
  | "ASISTIDA"
  | "NO_LLEGO"
  | "CANCELADA";
export type OrigenCita = "INICIAL" | "REPROGRAMACION";
export type LoteEstado = "ABIERTO" | "APROBADO" | "RECHAZADO";
export type TareaTipo = "SILENCIO" | "INASISTENCIA";
export type TareaEstado = "PENDIENTE" | "EN_PROCESO" | "RESUELTA";
export type CausaCatalogo =
  | "TRANSPORTE"
  | "ECONOMICO"
  | "FAMILIAR"
  | "EDUCATIVO"
  | "GEOGRAFICO"
  | "INFORMACION"
  | "SALUD"
  | "OTRO"
  | "SIN_RESPUESTA";

/** Listado paginado de la API: { items, total, pagina, limite }. */
export interface Paginated<T> {
  items: T[];
  total: number;
  pagina: number;
  limite: number;
}

export interface TipoProcedimiento {
  id: string;
  nombre: string;
  duracionMin: number;
}

export interface Profesional {
  id: string;
  nombre: string;
  especialidad: string | null;
  activo: boolean;
}

export interface ProfesionalCarga {
  id: string;
  nombre: string;
  especialidad: string | null;
  pacientesActivos: number;
  citasProximas7dias: number;
}

export interface Paciente {
  id: string;
  nombres: string;
  etiqueta: Etiqueta;
  banda: Banda;
  fechaObjetivo: string;
  canal: Canal;
  horaPreferida: string | null;
  servicio: Servicio;
  tipoProcedimiento: TipoProcedimiento;
  frecuenciaDias: number | null;
  hospitalizado: boolean;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  responsables: Profesional[];
}

export interface Cita {
  id: string;
  fecha: string;
  servicio: Servicio;
  doctorId: string | null;
  turno: number | null;
  horaEstimada: string | null;
  duracionMin: number;
  estado: CitaEstado;
  origen: OrigenCita;
  citaPreviaId: string | null;
  llegadaEn: string | null;
  confirmadaEn: string | null;
  asistidaEn: string | null;
  motivoCancelacion: string | null;
  justificacion: {
    prioridad?: Etiqueta;
    banda?: Banda;
    leadDias?: number;
  } | null;
  paciente: { id: string; nombres: string; etiqueta: Etiqueta; banda: Banda; canal: Canal };
  tipoProcedimiento: TipoProcedimiento;
  doctor: { nombre: string } | null;
  lote: { id: string; estado: LoteEstado } | null;
  causaInasistencia: { causa: string } | null;
}

export interface LoteDetalle {
  id: string;
  estado: LoteEstado;
  generadoEn: string;
  generadoPor: string;
  decididoPor: string | null;
  decididoEn: string | null;
  motivoRechazo: string | null;
  sinCupo: string[] | null;
  horasApertura: string;
  propuestas: Array<{
    id: string;
    pacienteId: string;
    nombres: string;
    banda: Banda;
    estado: CitaEstado;
    servicio: Servicio;
    doctor: string | null;
    turno: number | null;
    horaEstimada: string | null;
    duracionMin: number;
    fecha: string;
    origen: OrigenCita;
    justificacion: {
      prioridad?: Etiqueta;
      banda?: Banda;
      leadDias?: number;
    } | null;
  }>;
  citasOtras?: Array<{
    id: string;
    pacienteId?: string;
    fecha: string;
    servicio: Servicio;
    doctorId: string | null;
    doctor: string | null;
    turno: number | null;
    horaEstimada: string | null;
    duracionMin: number;
    nombres: string;
    procedimiento: string;
    estado: string;
  }>;
}

export interface CupoDiaWeb {
  fecha: string;
  cantidad: number;
  camillas: number;
}

export interface HorarioMedicoWeb {
  id: string;
  profesionalId: string;
  profesional: string;
  fecha: string;
  cupo: number;
}

export interface CamillaDiaWeb {
  id: string;
  numero: number;
  estado: CamillaEstado;
  citaId: string | null;
  estadoDesde: string;
  cita: { id: string; pacienteId: string; nombres: string; turno: number | null } | null;
}

export interface CitaDiaWeb {
  id: string;
  pacienteId: string;
  nombres: string;
  etiqueta: Etiqueta;
  turno: number | null;
  horaEstimada: string | null;
  duracionMin: number;
  estado: CitaEstado;
  confirmadaEn: string | null;
  llegadaEn: string | null;
}

export interface DiaAmbulatorio {
  fecha: string;
  camillas: CamillaDiaWeb[];
  citas: CitaDiaWeb[];
  cupo: { cantidad: number; camillas: number } | null;
}

export interface EventoCamillaWeb {
  id: string;
  camillaDiaId: string;
  numero: number;
  citaId: string | null;
  pacienteId: string | null;
  estado: CamillaEstado;
  inicio: string;
  fin: string | null;
  duracionMin: number | null;
  nombres: string | null;
}

export interface GrupoConsultaDia {
  doctorId: string | null;
  doctor: string | null;
  citas: CitaDiaWeb[];
}

export interface TareaSocial {
  id: string;
  tipo: TareaTipo;
  estado: TareaEstado;
  venceEn: string;
  asignadaA: string | null;
  resultado: string | null;
  resueltaEn: string | null;
  citaId: string | null;
  vencida: boolean;
  paciente: {
    id: string;
    nombres: string;
    etiqueta: Etiqueta;
    banda: Banda;
    telefono: string | null;
    responsables: Profesional[];
  };
  cita: { fecha: string; horaEstimada: string | null; estado: CitaEstado } | null;
}

export interface Aviso {
  id: string;
  tipo: string;
  canal: Canal;
  estado: "PROGRAMADO" | "ENVIADO" | "FALLIDO";
  programadoPara: string;
  enviadoEn: string | null;
  mensaje: string;
  cita: { paciente: { nombres: string } };
}
