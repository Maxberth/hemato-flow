import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import type { AvisoTipo } from "@prisma/client";

/** Fecha + hora "HH:mm" → "dd/MM/yyyy a las HH:mm" (locale es). */
export function fechaHoraTexto(fecha: Date, hora: string): string {
  const [hh, mm] = hora.split(":");
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  d.setHours(Number(hh ?? 0), Number(mm ?? 0), 0, 0);
  return format(d, "dd/MM/yyyy 'a las' HH:mm", { locale: es });
}

export function renderPlantilla(texto: string, vars: Record<string, string>): string {
  let salida = texto;
  for (const [clave, valor] of Object.entries(vars)) {
    salida = salida.replaceAll(`{${clave}}`, valor);
  }
  return salida;
}

/** Texto de un aviso programado sobre una cita concreta (turno + hora estimada). */
export function textoAviso(
  tipo: AvisoTipo,
  ctx: { nombres: string; fecha: Date; hora: string; turno?: number },
): string {
  const fechaHora = fechaHoraTexto(ctx.fecha, ctx.hora);
  const turno = ctx.turno ? ` (turno #${ctx.turno})` : "";
  switch (tipo) {
    case "AVISO_CITA":
      return `Hola ${ctx.nombres} 👋 Tienes una cita en el Consultorio de Hematología del INSN el ${fechaHora}${turno}. ¿Podrás asistir? Responde SÍ o NO.`;
    case "REPROGRAMACION":
      return `Hola ${ctx.nombres} 🙌 Tu cita fue reprogramada para el ${fechaHora}${turno}. ¿Podrás asistir? Responde SÍ o NO.`;
    case "RECORDATORIO":
      return `Hola ${ctx.nombres}, te recordamos tu cita del ${fechaHora}${turno} en el INSN. ¡Te esperamos!`;
    case "PREGUNTA_MOTIVO":
      return `Hola ${ctx.nombres}, vimos que no pudiste asistir a tu cita del ${fechaHora}. Cuéntanos el motivo para ayudarte mejor 🙏`;
  }
}

/** Plantillas de respuesta del bot. {fechaHora} = dd/MM/yyyy a las HH:mm. */
export const PLANTILLAS = {
  CONFIRMACION_OK: "¡Listo! Tu cita del {fechaHora} quedó confirmada ✅",
  NEGAR_MOTIVO: "Entendido 🙏 ¿Cuál es el motivo por el que no podrás asistir?",
  REPROGRAMAR_OFERTA: "Gracias por contarnos. ¿Deseas reprogramar tu cita? Responde SÍ o NO.",
  REPROGRAMADA: "¡Listo! Tu cita fue reprogramada según tu prioridad; te avisaremos la nueva fecha.",
  CONTACTO_SOCIAL: "Entendido. Un miembro del equipo te contactará para ayudarte.",
  CONSULTA: "Tu próxima cita es el {fechaHora}. {estado}",
  SIN_CITA: "Aún no tienes una cita programada. Te avisaremos por aquí cuando esté lista.",
  NO_REGISTRADO: "No encontramos tu registro. Por favor contacta al consultorio.",
  VINCULADO: "✅ ¡Número vinculado! A partir de ahora te avisamos por este chat de Telegram.",
  PEDIR_CONTACTO: "Hola 👋 Para encontrarte en nuestro registro, comparte tu número de celular con el bot:",
  MOTIVO_OK: "Gracias por contarnos 🙏 Registramos el motivo para mejorar.",
  FALLBACK: "Entendido. Si tienes dudas sobre tu cita escribe \"cita\".",
} as const;

export type PlantillaBot = keyof typeof PLANTILLAS;

export function textoBot(
  plantilla: PlantillaBot,
  vars: Record<string, string> = {},
): string {
  return renderPlantilla(PLANTILLAS[plantilla], vars);
}

/** Convierte "yyyy-MM-dd" → Date a medianoche local. */
export function parseFechaISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
