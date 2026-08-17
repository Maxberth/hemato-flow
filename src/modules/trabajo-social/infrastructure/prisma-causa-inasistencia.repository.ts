import type { CausaCatalogo } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import { CausaInasistenciaRepository } from "../domain/causa-inasistencia.repository";

export class PrismaCausaInasistenciaRepository extends CausaInasistenciaRepository {
  async registrar(citaId: string, causa: CausaCatalogo, textoLibre?: string): Promise<void> {
    await prisma.causaInasistencia.create({
      data: { citaId, causa, textoLibre: textoLibre ?? null },
    });
  }

  async existeParaCita(citaId: string): Promise<boolean> {
    const count = await prisma.causaInasistencia.count({ where: { citaId } });
    return count > 0;
  }
}
