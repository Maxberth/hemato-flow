import type { Rol } from "@prisma/client";
import { DominioError, NoEncontradoError } from "../../../common/errors/dominio.error";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { AvisoRepository } from "../../avisos/domain/aviso.repository";
import { CitaRepository } from "../domain/cita.repository";

export class CancelarCitaUseCase {
  constructor(
    private readonly citas: CitaRepository,
    private readonly avisos: AvisoRepository,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(citaId: string, motivo: string, actor: { actorId: string; actorRol: Rol | null }) {
    const cita = await this.citas.buscarPorId(citaId);
    if (!cita) throw new NoEncontradoError("Cita no existe");

    if (["ASISTIDA", "NO_SHOW", "CANCELADA"].includes(cita.estado)) {
      throw new DominioError(
        "ESTADO_INVALIDO",
        `No se puede cancelar una cita ${cita.estado}`,
        400,
      );
    }

    const cancelada = await this.citas.cancelar(citaId, motivo);

    // Avisos pendientes de una cita cancelada jamás se envían.
    await this.avisos.cancelarPendientesDeCita(citaId, "CITA_CANCELADA");

    await this.auditoria.registrar({
      accion: "CANCELAR_CITA",
      entidad: "CITA",
      entidadId: citaId,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { motivo },
    });

    return cancelada;
  }
}
