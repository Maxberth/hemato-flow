import type { Rol } from "@prisma/client";
import { DominioError, NoEncontradoError } from "../../../common/errors/dominio.error";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { PacienteRepository } from "../domain/paciente.repository";

export class AsignarResponsableUseCase {
  constructor(
    private readonly repo: PacienteRepository,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(
    pacienteId: string,
    profesionalId: string,
    actor: { actorId: string; actorRol: Rol | null },
  ) {
    const paciente = await this.repo.buscarPorId(pacienteId);
    if (!paciente) throw new NoEncontradoError("Paciente no existe");

    const profesional = await prisma.profesional.findUnique({ where: { id: profesionalId } });
    if (!profesional || !profesional.activo) {
      throw new NoEncontradoError("Profesional no existe");
    }

    try {
      await this.repo.asignarResponsable(pacienteId, profesionalId, actor.actorId);
    } catch {
      throw new DominioError("RESPONSABLE_EXISTE", "El paciente ya tiene ese responsable", 409);
    }

    await this.auditoria.registrar({
      accion: "ASIGNAR_RESPONSABLE",
      entidad: "PACIENTE",
      entidadId: pacienteId,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { profesionalId },
    });
  }
}
