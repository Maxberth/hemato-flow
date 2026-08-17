import { sumarDias } from "../../../common/hora";

/**
 * Regla de negocio del sistema: el enfoque principal son las citas
 * AMBULATORIAS (pacientes oncológicos). Las consultas son SOLO para:
 *   1. Pacientes nuevos que recién ingresan (servicio CONSULTA).
 *   2. Pacientes en tratamiento (AMBULATORIO) cada `periodoDias` (14) para
 *      control de su estado a lo largo del tiempo.
 */

export const PERIODO_CONSULTA_DEFAULT = 14;

/** Ventana operativa del motor (días) — compartida por generar-lote y el resumen. */
export const DIAS_VENTANA_MOTOR = 60;

export const ESTADOS_CITA_ACTIVOS = ["PROPUESTA", "PROGRAMADA", "CONFIRMADA", "EN_ATENCION"] as const;

export interface CitaRegla {
  estado: string;
  servicio: string;
  fecha: Date;
}

export interface PacienteRegla {
  id: string;
  servicio: string;
  fechaObjetivo: Date;
  citas: CitaRegla[];
}

export function citasDe(p: PacienteRegla, servicio: string): CitaRegla[] {
  return p.citas.filter((c) => c.servicio === servicio);
}

/** ¿Hay una cita activa (PROPUESTA/PROGRAMADA/CONFIRMADA/EN_ATENCION) del servicio? */
export function tieneCitaActiva(p: PacienteRegla, servicio: string): boolean {
  return citasDe(p, servicio).some((c) => (ESTADOS_CITA_ACTIVOS as readonly string[]).includes(c.estado));
}

/** ¿Fue atendido (ASISTIDA) hoy o tiene cita ASISTIDA en el futuro? → no re-proponer. */
export function atendidoHoyOFuturo(p: PacienteRegla, servicio: string, hoyUtc: Date): boolean {
  return citasDe(p, servicio).some((c) => c.estado === "ASISTIDA" && c.fecha >= hoyUtc);
}

export interface ConsultaQuincenal {
  /** fechaObjetivo de la consulta de seguimiento (última asistida + período). */
  fechaObjetivo: Date;
}

/**
 * Consulta de seguimiento para un paciente EN TRATAMIENTO (servicio AMBULATORIO).
 * Vencida si no hay CONSULTA activa ni atendida hoy/futuro y el período desde la
 * última consulta asistida (o desde el inicio del tratamiento si nunca tuvo)
 * ya cayó dentro de la ventana del motor.
 */
export function consultaQuincenalVencida(
  p: PacienteRegla,
  hoy: Date,
  hasta: Date,
  periodoDias = PERIODO_CONSULTA_DEFAULT,
): ConsultaQuincenal | null {
  if (p.servicio !== "AMBULATORIO") return null;
  if (tieneCitaActiva(p, "CONSULTA")) return null;
  const hoyUtc = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  if (atendidoHoyOFuturo(p, "CONSULTA", hoyUtc)) return null;
  const asistidas = citasDe(p, "CONSULTA")
    .filter((c) => c.estado === "ASISTIDA")
    .map((c) => c.fecha)
    .sort((a, b) => b.getTime() - a.getTime());
  const ultima = asistidas[0] ?? p.fechaObjetivo;
  const fechaObjetivo = sumarDias(ultima, periodoDias);
  if (fechaObjetivo > hasta) return null;
  return { fechaObjetivo };
}
