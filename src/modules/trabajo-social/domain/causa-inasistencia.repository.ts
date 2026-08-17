import type { CausaCatalogo } from "@prisma/client";

export abstract class CausaInasistenciaRepository {
  abstract registrar(citaId: string, causa: CausaCatalogo, textoLibre?: string): Promise<void>;
  abstract existeParaCita(citaId: string): Promise<boolean>;
}
