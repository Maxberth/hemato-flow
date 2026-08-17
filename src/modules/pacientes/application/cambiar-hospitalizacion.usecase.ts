import type { Rol } from "@prisma/client";
import { NoEncontradoError } from "../../../common/errors/dominio.error";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { PacienteRepository } from "../domain/paciente.repository";

export class CambiarHospitalizacionUseCase {
  constructor(
    private readonly repo: PacienteRepository,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(
    id: string,
    hospitalizado: boolean,
    actor: { actorId: string; actorRol: Rol | null },
  ) {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NoEncontradoError("Paciente no existe");

    const actualizado = await this.repo.actualizar(id, { hospitalizado });

    await this.auditoria.registrar({
      accion: "HOSPITALIZACION",
      entidad: "PACIENTE",
      entidadId: id,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { hospitalizado },
    });

    return actualizado;
  }
}
