import type { CausaCatalogo } from "@prisma/client";
import { ClasificadorCausaPort } from "../domain/clasificador-causa.port";

// Factores de inasistencia del concurso, mapeados por keywords.
const REGLAS: Array<[RegExp, CausaCatalogo]> = [
  [/pasaje|bus|movilidad|colectivo|combi/i, "TRANSPORTE"],
  [/dinero|plata|trabajo|pago|gasto/i, "ECONOMICO"],
  [/familia|hijo|hija|mam[aá]|pap[aá]|padre|madre|cuidad/i, "FAMILIAR"],
  [/colegio|clases|escuela|examen|estudio/i, "EDUCATIVO"],
  [/lejos|viaje|distancia|carretera|provincia/i, "GEOGRAFICO"],
  [/no sab[ií]a|no me avisaron|no me enter[eé]|no sab[ií]amos|no me lleg[oó]/i, "INFORMACION"],
  [/enferm|hospital|dolor|fiebre|tratamiento|malestar/i, "SALUD"],
];

/** Clasificador de causa por keywords (sin LLM, determinista). */
export class ReglasCausaAdapter extends ClasificadorCausaPort {
  async clasificar(texto: string): Promise<CausaCatalogo> {
    const t = texto.trim().toLowerCase();
    for (const [regex, causa] of REGLAS) {
      if (regex.test(t)) return causa;
    }
    return "OTRO";
  }
}
