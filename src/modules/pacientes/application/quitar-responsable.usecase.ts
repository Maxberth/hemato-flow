import type { Rol } from "@prisma/client";
import { NoEncontradoError } from "../../../common/errors/dominio.error";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { PacienteRepository } from "../domain/paciente.repository";

export class QuitarResponsableUseCase {
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

    const vinculo = await prisma.pacienteProfesional.findUnique({
      where: { pacienteId_profesionalId: { pacienteId, profesionalId } },
    });
    if (!vinculo) throw new NoEncontradoError("El paciente no tiene ese responsable");

    await this.repo.quitarResponsable(pacienteId, profesionalId);

    await this.auditoria.registrar({
      accion: "ASIGNAR_RESPONSABLE",
      entidad: "PACIENTE",
      entidadId: pacienteId,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { profesionalId, tipo: "QUITAR" },
    });
  }
}
