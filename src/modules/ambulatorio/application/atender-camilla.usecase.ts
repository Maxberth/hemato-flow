import type { Rol } from "@prisma/client";
import { ConflictoError, NoEncontradoError } from "../../../common/errors/dominio.error";
import { fechaDbALocal, mismoDia } from "../../../common/hora";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import type { RegistrarNoLlego } from "../../citas/application/registrar-no-llego";
import type { CamillaRepository } from "../domain/camilla.repository";

const ESTADOS_ATENDIBLES = ["PROGRAMADA", "CONFIRMADA"] as const;

/**
 * Día de atención ambulatorio (rol ENFERMERO/ADMIN): cola viva de camillas.
 * - ocupar con cita esperada → EN_ATENCION; las citas anteriores (turno menor)
 *   PROGRAMADA/CONFIRMADA pasan a NO_LLEGO automáticamente (efecto downstream).
 * - ocupar con paciente sin cita (walk-in) → uso normal en CamillaEvento SIN
 *   crear Cita (RNF-5); el paciente esperado de turno más bajo pasa a NO_LLEGO.
 * - retirar → PREPARACION (la cita EN_ATENCION pasa a ASISTIDA); listo → LIBRE.
 */
export class AtenderCamillaUseCase {
  constructor(
    private readonly camillas: CamillaRepository,
    private readonly registrarNoLlego: RegistrarNoLlego,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ocupar(
    camillaId: string,
    input: { citaId?: string } | { pacienteId?: string },
    actor: { actorId: string; actorRol: Rol | null },
  ): Promise<{ camillaId: string; citaId: string | null; noLlegos: string[] }> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const resultado = await this.camillas.enTransaccion(async (tx) => {
      const camilla = await tx.camilla(camillaId);
      if (!camilla) throw new NoEncontradoError("Camilla no existe");
      if (camilla.estado !== "LIBRE") {
        throw new ConflictoError(
          "CAMILLA_OCUPADA",
          `La camilla ${camilla.numero} no está libre (${camilla.estado})`,
        );
      }
      const ahora = new Date();

      if ("citaId" in input && input.citaId) {
        const cita = await tx.citaParaCamilla(input.citaId);
        if (!cita) throw new NoEncontradoError("Cita no existe");
        if (!mismoDia(fechaDbALocal(cita.fecha), hoy) || cita.servicio !== "AMBULATORIO") {
          throw new ConflictoError("CITA_INVALIDA", "La cita no es ambulatoria de hoy");
        }
        if (!(ESTADOS_ATENDIBLES as readonly string[]).includes(cita.estado)) {
          throw new ConflictoError(
            "CITA_INVALIDA",
            `La cita está ${cita.estado}; solo PROGRAMADA/CONFIRMADA entran a camilla`,
          );
        }

        await tx.ocuparCamilla(camillaId, cita.id, null, ahora);
        await tx.marcarEnAtencion(cita.id);
        await tx.crearEvento({
          camillaDiaId: camilla.id,
          citaId: cita.id,
          pacienteId: cita.pacienteId,
          estado: "OCUPADA",
          inicio: ahora,
        });

        // Auto NO_LLEGO: citas ambulatorias del día con turno menor pendientes.
        const delDia = await tx.citasAmbulatorioDia(hoy);
        const saltados = delDia.filter(
          (c) =>
            c.turno !== null &&
            cita.turno !== null &&
            c.turno < cita.turno &&
            (ESTADOS_ATENDIBLES as readonly string[]).includes(c.estado),
        );

        await this.auditoria.registrar({
          accion: "OCUPAR_CAMILLA",
          entidad: "CAMILLA",
          entidadId: camillaId,
          actorId: actor.actorId,
          actorRol: actor.actorRol,
          detalle: { citaId: cita.id, camilla: camilla.numero },
        });

        return { citaId: cita.id, noLlegos: saltados.map((c) => c.id) };
      }

      // Walk-in: uso normal sin crear Cita; el esperado de turno más bajo → NO_LLEGO.
      const pacienteId = "pacienteId" in input && input.pacienteId ? input.pacienteId : null;
      if (!pacienteId) {
        throw new ConflictoError("DATOS_INVALIDOS", "Debes indicar citaId o pacienteId");
      }
      await tx.ocuparCamilla(camillaId, null, pacienteId, ahora);
      await tx.crearEvento({
        camillaDiaId: camilla.id,
        citaId: null,
        pacienteId,
        estado: "OCUPADA",
        inicio: ahora,
      });

      const delDia = await tx.citasAmbulatorioDia(hoy);
      const esperado = delDia
        .filter((c) => (ESTADOS_ATENDIBLES as readonly string[]).includes(c.estado))
        .sort((a, b) => (a.turno ?? 999) - (b.turno ?? 999))[0];

      await this.auditoria.registrar({
        accion: "OCUPAR_CAMILLA",
        entidad: "CAMILLA",
        entidadId: camillaId,
        actorId: actor.actorId,
        actorRol: actor.actorRol,
        detalle: { walkIn: true, pacienteId, camilla: camilla.numero },
      });

      return { citaId: null, noLlegos: esperado ? [esperado.id] : [] };
    });

    // Efecto downstream fuera de la transacción de camilla (helper con su
    // propia transacción idempotente).
    for (const id of resultado.noLlegos) {
      await this.registrarNoLlego(id);
    }

    return { camillaId, citaId: resultado.citaId, noLlegos: resultado.noLlegos };
  }

  async retirar(
    camillaId: string,
    actor: { actorId: string; actorRol: Rol | null },
  ): Promise<{ camillaId: string; citaId: string | null }> {
    return this.camillas.enTransaccion(async (tx) => {
      const camilla = await tx.camilla(camillaId);
      if (!camilla) throw new NoEncontradoError("Camilla no existe");
      if (camilla.estado !== "OCUPADA") {
        throw new ConflictoError("CAMILLA_NO_OCUPADA", `La camilla ${camilla.numero} no está OCUPADA`);
      }
      const ahora = new Date();

      await tx.retirarCamilla(camillaId, ahora);
      if (camilla.citaId) {
        const cita = await tx.citaParaCamilla(camilla.citaId);
        if (cita && cita.estado === "EN_ATENCION") {
          await tx.marcarAtendida(cita.id, ahora);
        }
      }
      await tx.cerrarEventoAbierto(camillaId, "OCUPADA", ahora);

      await this.auditoria.registrar({
        accion: "RETIRAR_CAMILLA",
        entidad: "CAMILLA",
        entidadId: camillaId,
        actorId: actor.actorId,
        actorRol: actor.actorRol,
        detalle: { camilla: camilla.numero, citaId: camilla.citaId },
      });

      return { camillaId, citaId: camilla.citaId };
    });
  }

  async listo(
    camillaId: string,
    actor: { actorId: string; actorRol: Rol | null },
  ): Promise<{ camillaId: string }> {
    return this.camillas.enTransaccion(async (tx) => {
      const camilla = await tx.camilla(camillaId);
      if (!camilla) throw new NoEncontradoError("Camilla no existe");
      if (camilla.estado !== "PREPARACION") {
        throw new ConflictoError("CAMILLA_NO_LISTA", `La camilla ${camilla.numero} no está en PREPARACION`);
      }
      const ahora = new Date();

      await tx.marcarCamillaListo(camillaId, ahora);
      await tx.cerrarEventoAbierto(camillaId, "PREPARACION", ahora);

      await this.auditoria.registrar({
        accion: "LISTO_CAMILLA",
        entidad: "CAMILLA",
        entidadId: camillaId,
        actorId: actor.actorId,
        actorRol: actor.actorRol,
        detalle: { camilla: camilla.numero },
      });

      return { camillaId };
    });
  }
}
