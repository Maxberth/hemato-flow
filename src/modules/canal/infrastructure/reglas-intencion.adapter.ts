import { ClasificadorIntencionPort, type Intencion } from "../domain/clasificador-intencion.port";

// Reglas del plan (orden de precedencia: confirmar → negar → saludo/consultar).
const RE_CONFIRMAR = /s[íi]|si\b|yes/i;
const RE_NEGAR = /no\b|nop/i;
const RE_SALUDO = /^(hola|buenas?|buenos d[ií]as|buenas tardes|buenas noches|saludos|hi|hey)/i;
const RE_CONSULTAR = /cita|cuando|cu[aá]ndo|fecha/i;

/**
 * Clasificador por reglas (sin LLM). Se usa cuando OPENCODE_API_KEY está vacía
 * (convención del repo: modo reglas como respaldo determinista).
 */
export class ReglasIntencionAdapter extends ClasificadorIntencionPort {
  async clasificar(texto: string): Promise<Intencion> {
    const t = texto.trim().toLowerCase();
    if (RE_CONFIRMAR.test(t)) return "CONFIRMAR";
    if (RE_NEGAR.test(t)) return "NEGAR";
    // Saludo → CONSULTAR: el bot responde con la próxima cita en lugar de FALLBACK.
    if (RE_SALUDO.test(t)) return "CONSULTAR";
    if (RE_CONSULTAR.test(t)) return "CONSULTAR";
    return "OTRA";
  }
}
