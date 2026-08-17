import type { Rol } from "@prisma/client";
import { DominioError, NoEncontradoError } from "../../../common/errors/dominio.error";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { TareaSocialRepository } from "../domain/tarea-social.repository";

export class ResolverTareaUseCase {
  constructor(
    private readonly tareas: TareaSocialRepository,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(
    tareaId: string,
    resultado: string,
    actor: { actorId: string; actorRol: Rol | null },
  ) {
    const tarea = await this.tareas.buscarPorId(tareaId);
    if (!tarea) throw new NoEncontradoError("Tarea no existe");
    if (tarea.estado === "RESUELTA") {
      throw new DominioError("TAREA_RESUELTA", "La tarea ya fue resuelta", 409);
    }

    const resuelta = await this.tareas.resolver(tareaId, resultado);

    await this.auditoria.registrar({
      accion: "RESOLVER_TAREA",
      entidad: "TAREA_SOCIAL",
      entidadId: tareaId,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { resultado: resultado.slice(0, 500) },
    });

    return resuelta;
  }
}
