import type { Rol } from "@prisma/client";
import { NoEncontradoError } from "../../../common/errors/dominio.error";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { TareaSocialRepository } from "../domain/tarea-social.repository";

export class TomarTareaUseCase {
  constructor(
    private readonly tareas: TareaSocialRepository,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(tareaId: string, actor: { actorId: string; actorRol: Rol | null }) {
    const tarea = await this.tareas.buscarPorId(tareaId);
    if (!tarea) throw new NoEncontradoError("Tarea no existe");
    if (tarea.estado === "RESUELTA") {
      throw new NoEncontradoError("La tarea ya fue resuelta");
    }

    const tomada = await this.tareas.tomar(tareaId, actor.actorId);

    await this.auditoria.registrar({
      accion: "TOMAR_TAREA",
      entidad: "TAREA_SOCIAL",
      entidadId: tareaId,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
    });

    return tomada;
  }
}
