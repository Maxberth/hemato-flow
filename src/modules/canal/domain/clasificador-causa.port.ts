import type { CausaCatalogo } from "@prisma/client";

export abstract class ClasificadorCausaPort {
  abstract clasificar(texto: string): Promise<CausaCatalogo>;
}
