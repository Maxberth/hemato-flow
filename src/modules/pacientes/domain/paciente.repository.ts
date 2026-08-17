import type { Banda, Canal, Etiqueta, Paciente, Profesional, Servicio, TipoProcedimiento } from "@prisma/client";
import type { Paginacion, Paginado } from "../../../common/paginacion";

export interface PacienteNuevo {
  numeroHash: string;
  numeroCifrado: string;
  telegramChatId?: string | null;
  nombres: string;
  etiqueta: Etiqueta;
  banda: Banda;
  fechaObjetivo: Date;
  canal: Canal;
  horaPreferida?: string | null;
  tipoProcedimientoId: string;
  frecuenciaDias?: number | null;
  servicio: Servicio;
}

export interface PacienteListado extends Paciente {
  tipoProcedimiento: TipoProcedimiento;
  responsables: Array<{
    profesional: Pick<Profesional, "id" | "nombre" | "especialidad">;
  }>;
}

export interface FiltrosPaciente {
  etiqueta?: Etiqueta;
  banda?: Banda;
  activo?: boolean;
  hospitalizado?: boolean;
  q?: string;
}

export interface ResumenPacientes {
  rojas: number;
  amarillas: number;
  verdes: number;
  distantes: number;
}

export interface ListadoPacientes extends Paginado<PacienteListado> {
  resumen: ResumenPacientes;
}

export abstract class PacienteRepository {
  abstract crear(datos: PacienteNuevo): Promise<Paciente>;
  abstract buscarPorHash(numeroHash: string): Promise<Paciente | null>;
  /** Vinculación por chat de Telegram (flujo "compartir contacto"). */
  abstract buscarPorTelegramChat(chatId: string): Promise<Paciente | null>;
  abstract buscarPorId(id: string): Promise<Paciente | null>;
  abstract listar(filtros: FiltrosPaciente, pag: Paginacion): Promise<ListadoPacientes>;
  abstract actualizar(
    id: string,
    datos: Partial<
      Pick<
        Paciente,
        | "nombres"
        | "etiqueta"
        | "banda"
        | "fechaObjetivo"
        | "canal"
        | "tipoProcedimientoId"
        | "frecuenciaDias"
        | "servicio"
        | "hospitalizado"
        | "activo"
        | "numeroHash"
        | "numeroCifrado"
        | "telegramChatId"
        | "horaPreferida"
      >
    >,
  ): Promise<Paciente>;
  abstract asignarResponsable(
    pacienteId: string,
    profesionalId: string,
    asignadoPor?: string,
  ): Promise<void>;
  abstract quitarResponsable(pacienteId: string, profesionalId: string): Promise<void>;
}
