import { z } from "zod";

export const etiquetaSchema = z.enum(["ROJA", "AMARILLA", "VERDE"]);
export const bandaSchema = z.enum(["CERCANA", "REGIONAL", "DISTANTE"]);
export const canalSchema = z.enum(["WHATSAPP", "TELEGRAM"]);
export const servicioSchema = z.enum(["AMBULATORIO", "CONSULTA"]);

/** Fecha "yyyy-MM-dd" → Date a medianoche local. */
export function parseFecha(iso: string): Date {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Fecha inválida: ${iso}`);
  }
  return d;
}

export const crearPacienteSchema = z.object({
  nombres: z.string().min(1, "nombres es obligatorio"),
  telefono: z.string().min(5, "telefono es obligatorio"),
  etiqueta: etiquetaSchema.default("VERDE"),
  banda: bandaSchema.default("CERCANA"),
  fechaObjetivo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fechaObjetivo debe ser yyyy-MM-dd"),
  canal: canalSchema.default("WHATSAPP"),
  tipoProcedimientoId: z.string().min(1),
  frecuenciaDias: z.number().int().positive().nullable().optional(),
  servicio: servicioSchema.default("CONSULTA"),
});

export type CrearPacienteInput = z.infer<typeof crearPacienteSchema>;

export const editarPacienteSchema = z
  .object({
    nombres: z.string().min(1).optional(),
    etiqueta: etiquetaSchema.optional(),
    banda: bandaSchema.optional(),
    fechaObjetivo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "fechaObjetivo debe ser yyyy-MM-dd")
      .optional(),
    canal: canalSchema.optional(),
    telefono: z.string().min(5, "telefono debe tener al menos 5 caracteres").optional(),
    horaPreferida: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horaPreferida debe ser HH:mm")
      .nullable()
      .optional(),
    tipoProcedimientoId: z.string().min(1).optional(),
    frecuenciaDias: z.number().int().positive().nullable().optional(),
    servicio: servicioSchema.optional(),
    activo: z.boolean().optional(),
    hospitalizado: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Sin campos para actualizar" });

export type EditarPacienteInput = z.infer<typeof editarPacienteSchema>;

export const importarCohorteSchema = z.object({
  pacientes: z.array(crearPacienteSchema).min(1),
});

export type ImportarCohorteInput = z.infer<typeof importarCohorteSchema>;

export const hospitalizacionSchema = z.object({
  hospitalizado: z.boolean(),
});

export const responsableSchema = z.object({
  profesionalId: z.string().min(1),
});
