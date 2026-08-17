import { ConflictoError, DominioError, NoEncontradoError } from "../../../common/errors/dominio.error";
import type { RegistrarNoLlego } from "../../citas/application/registrar-no-llego";
import type { CitaRepository } from "../../citas/domain/cita.repository";

const ESTADOS_ATENDIBLES = ["PROGRAMADA", "CONFIRMADA"] as const;

/**
 * Día de atención de consultas (rol MEDICO/ENFERMERO/ADMIN), FCFS:
 * - registrarLlegada → check-in manual (llegadaEn = ahora); 409 si ya llegó.
 * - atender → EN_ATENCION; auto NO_LLEGO de las citas del mismo (doctor, fecha)
 *   con turno menor, sin check-in y PROGRAMADA/CONFIRMADA (los que sí llegaron
 *   y se saltaron NO se marcan).
 * - finalizar → ASISTIDA + asistidaEn.
 */
export class AtenderConsultaUseCase {
  constructor(
    private readonly citas: CitaRepository,
    private readonly registrarNoLlego: RegistrarNoLlego,
  ) {}

  async registrarLlegada(citaId: string) {
    const cita = await this.citas.buscarConPaciente(citaId);
    if (!cita) throw new NoEncontradoError("Cita no existe");
    if (cita.servicio !== "CONSULTA") {
      throw new DominioError("SERVICIO_INVALIDO", "El check-in es solo para consultas", 400);
    }
    if (!(ESTADOS_ATENDIBLES as readonly string[]).includes(cita.estado)) {
      throw new DominioError(
        "ESTADO_INVALIDO",
        `No se puede registrar llegada de una cita ${cita.estado}`,
        400,
      );
    }
    if (cita.llegadaEn) {
      throw new ConflictoError("YA_LLEGO", "La cita ya tiene check-in registrado");
    }
    return this.citas.registrarLlegada(citaId, new Date());
  }

  async atender(citaId: string) {
    const cita = await this.citas.buscarConPaciente(citaId);
    if (!cita) throw new NoEncontradoError("Cita no existe");
    if (cita.servicio !== "CONSULTA") {
      throw new DominioError("SERVICIO_INVALIDO", "La atención es solo para consultas", 400);
    }
    if (!(ESTADOS_ATENDIBLES as readonly string[]).includes(cita.estado)) {
      throw new DominioError(
        "ESTADO_INVALIDO",
        `No se puede atender una cita ${cita.estado}`,
        400,
      );
    }

    const atendida = await this.citas.marcarEnAtencion(citaId);

    // Auto NO_LLEGO: mismo (doctor, fecha), turno menor, sin check-in.
    let noLlegos: string[] = [];
    if (cita.turno !== null && cita.doctorId) {
      const saltadas = await this.citas.citasPendientesDoctor(cita.fecha, cita.doctorId, cita.turno);
      noLlegos = saltadas.map((s) => s.id);
      for (const id of noLlegos) {
        await this.registrarNoLlego(id);
      }
    }

    return { cita: atendida, noLlegos };
  }

  async finalizar(citaId: string) {
    const cita = await this.citas.buscarConPaciente(citaId);
    if (!cita) throw new NoEncontradoError("Cita no existe");
    if (cita.estado !== "EN_ATENCION") {
      throw new DominioError(
        "ESTADO_INVALIDO",
        `Solo una cita EN_ATENCION se finaliza (está ${cita.estado})`,
        400,
      );
    }
    return this.citas.marcarAtendida(citaId, new Date());
  }
}
