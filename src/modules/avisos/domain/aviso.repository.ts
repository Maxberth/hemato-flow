import type { Aviso, AvisoEstado, AvisoTipo, Canal } from "@prisma/client";
import type { Paginacion, Paginado } from "../../../common/paginacion";

export interface AvisoNuevo {
  citaId: string;
  tipo: AvisoTipo;
  canal: Canal;
  mensaje: string;
  programadoPara: Date;
}

export interface FiltrosAviso {
  estado?: AvisoEstado;
  citaId?: string;
}

export interface AvisoListado extends Aviso {
  cita: {
    paciente: { nombres: string };
  };
}

/** Aviso listo para enviar con el destino del paciente descifrado. */
export interface AvisoPendienteEnvio extends Aviso {
  cita: {
    paciente: { numeroCifrado: string; canal: Canal; telegramChatId: string | null };
  };
}

export abstract class AvisoRepository {
  abstract crear(aviso: AvisoNuevo): Promise<Aviso>;
  abstract listar(filtros: FiltrosAviso): Promise<AvisoListado[]>;
  abstract listarPaginado(filtros: FiltrosAviso, pag: Paginacion): Promise<Paginado<AvisoListado>>;
  /** Avisos PROGRAMADO cuya cita no está cancelada/no-show y listos para enviar. */
  abstract listarPendientesDeEnvio(ahora: Date): Promise<AvisoPendienteEnvio[]>;
  abstract marcarEnviado(id: string, enviadoEn: Date): Promise<void>;
  abstract marcarErrorReintento(id: string, error: string, reintentoEsperaMin: number): Promise<void>;
  abstract marcarFallido(id: string, error: string): Promise<void>;
  /** Avisos PROGRAMADO de una cita → FALLIDO (p.ej. cita cancelada). */
  abstract cancelarPendientesDeCita(citaId: string, error: string): Promise<number>;
}
