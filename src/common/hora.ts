/** "HH:mm" (24h) → minutos desde medianoche. */
export function horaAMinutos(hora: string): number {
  const [hh, mm] = hora.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

/** Minutos desde medianoche → "HH:mm" (24h, cero-padded). */
export function minutosAHora(min: number): string {
  const hh = Math.floor(min / 60).toString().padStart(2, "0");
  const mm = (min % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** ¿Misma fecha calendario local? */
export function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Suma días a una fecha a medianoche local. */
export function sumarDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Prisma devuelve columnas `@db.Date` como instantes de medianoche UTC.
 * Normaliza al MISMO día calendario a medianoche local para comparaciones
 * y cálculos de fecha consistentes (Perú, UTC-5).
 */
export function fechaDbALocal(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Minutos de la hora preferida del paciente ("HH:mm" asignada por la enfermera
 * según la receta). 0 si no tiene o el formato es inválido.
 */
export function horaPreferidaMin(horaPreferida: string | null | undefined): number {
  if (!horaPreferida) return 0;
  const m = horaAMinutos(horaPreferida);
  return Number.isFinite(m) ? m : 0;
}
