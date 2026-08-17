import type { CamillaEstado, CitaEstado, Etiqueta, Servicio } from "@prisma/client";

/** Cita ambulatoria del día (cola viva). */
export interface CitaDia {
  id: string;
  pacienteId: string;
  fecha: Date;
  servicio: Servicio;
  nombres: string;
  etiqueta: Etiqueta;
  turno: number | null;
  horaEstimada: string | null;
  duracionMin: number;
  estado: CitaEstado;
  confirmadaEn: Date | null;
  llegadaEn: Date | null;
}

export interface CamillaDelDia {
  id: string;
  fecha: Date;
  numero: number;
  estado: CamillaEstado;
  citaId: string | null;
  estadoDesde: Date;
  cita: {
    id: string;
    pacienteId: string;
    nombres: string;
    turno: number | null;
  } | null;
}

export interface EventoCamilla {
  id: string;
  camillaDiaId: string;
  numero: number;
  citaId: string | null;
  pacienteId: string | null;
  estado: CamillaEstado;
  inicio: Date;
  fin: Date | null;
  duracionMin: number | null;
  nombres: string | null;
}

/** Operaciones atómicas del día sobre camillas y sus citas (TxCamilla). */
export interface TxCamilla {
  camilla(camillaId: string): Promise<CamillaDelDia | null>;
  citaParaCamilla(citaId: string): Promise<CitaDia | null>;
  ocuparCamilla(
    camillaId: string,
    citaId: string | null,
    pacienteId: string | null,
    estadoDesde: Date,
  ): Promise<void>;
  retirarCamilla(camillaId: string, estadoDesde: Date): Promise<void>;
  marcarCamillaListo(camillaId: string, estadoDesde: Date): Promise<void>;
  marcarEnAtencion(citaId: string): Promise<void>;
  marcarAtendida(citaId: string, asistidaEn: Date): Promise<void>;
  /** Citas AMBULATORIO del día (para la regla de NO_LLEGO automático). */
  citasAmbulatorioDia(fecha: Date): Promise<CitaDia[]>;
  crearEvento(data: {
    camillaDiaId: string;
    citaId: string | null;
    pacienteId: string | null;
    estado: CamillaEstado;
    inicio: Date;
  }): Promise<void>;
  /** Cierra el evento abierto del estado y calcula duracionMin = fin − inicio. */
  cerrarEventoAbierto(
    camillaDiaId: string,
    estado: CamillaEstado,
    fin: Date,
  ): Promise<void>;
}

export abstract class CamillaRepository {
  abstract listarDia(fecha: Date): Promise<CamillaDelDia[]>;
  /** Crea las camillas 1..n del día que falten; devuelve las camillas del día. */
  abstract crearDias(fecha: Date, n: number): Promise<CamillaDelDia[]>;
  /** Citas AMBULATORIO del día ordenadas por turno (cola viva). */
  abstract citasDelDia(fecha: Date): Promise<CitaDia[]>;
  /** Cupo ambulatorio del día (CupoDiario) o null si no hay fila. */
  abstract cupoDelDia(fecha: Date): Promise<{ cantidad: number; camillas: number } | null>;
  abstract historial(fecha: Date): Promise<EventoCamilla[]>;
  /** Cita activa (PROGRAMADA/CONFIRMADA/EN_ATENCION) de un paciente, la más próxima. */
  abstract buscarCitaActiva(
    pacienteId: string,
  ): Promise<{ id: string; estado: CitaEstado } | null>;
  abstract enTransaccion<T>(fn: (tx: TxCamilla) => Promise<T>): Promise<T>;
}
