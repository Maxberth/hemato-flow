import type { Rol } from "@prisma/client";
import { ConflictoError, NoEncontradoError } from "../../../common/errors/dominio.error";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { PlanificacionRepository } from "../domain/planificacion.repository";

export class RechazarLoteUseCase {
  constructor(
    private readonly planificacion: PlanificacionRepository,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(
    loteId: string,
    actor: { actorId: string; actorRol: Rol | null },
    motivo?: string,
  ) {
    const lote = await this.planificacion.buscarLoteConCitas(loteId);
    if (!lote) throw new NoEncontradoError("Lote no existe");
    if (lote.estado !== "ABIERTO") {
      throw new ConflictoError("LOTE_NO_ABIERTO", "El lote ya fue decidido");
    }

    await this.planificacion.rechazar(loteId, motivo ?? null, actor.actorId);

    await this.auditoria.registrar({
      accion: "RECHAZAR_LOTE",
      entidad: "LOTE",
      entidadId: loteId,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: motivo ? { motivo } : undefined,
    });

    return { loteId, estado: "RECHAZADO" as const };
  }
}
