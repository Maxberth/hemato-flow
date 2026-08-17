import { format, parse } from "date-fns";
import { es } from "date-fns/locale";

/** ISO "YYYY-MM-DD" (campo fecha de cita/capacidad) → "dd/MM/yyyy" */
export function fechaCorta(iso: string): string {
  const d = parse(iso, "yyyy-MM-dd", new Date());
  return format(d, "dd/MM/yyyy", { locale: es });
}

/** ISO fecha + hora "HH:mm" → "dd/MM/yyyy a las HH:mm" */
export function fechaHora(iso: string, hora: string): string {
  const [hh, mm] = hora.split(":");
  const d = parse(iso, "yyyy-MM-dd", new Date());
  d.setHours(Number(hh ?? 0), Number(mm ?? 0), 0, 0);
  return format(d, "dd/MM/yyyy 'a las' HH:mm", { locale: es });
}

/** DateTime ISO → "dd/MM/yyyy HH:mm" */
export function fechaHoraIso(iso: string | Date): string {
  return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: es });
}
