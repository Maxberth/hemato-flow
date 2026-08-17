import type { Rol } from "@prisma/client";
import { DominioError, NoEncontradoError } from "../../../common/errors/dominio.error";
import { CifradoReversiblePort } from "../../../infrastructure/cifrado/cifrado.port";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { PacienteRepository } from "../domain/paciente.repository";
import { parseFecha, type EditarPacienteInput } from "../dto/paciente.dto";

export class EditarPacienteUseCase {
  constructor(
    private readonly repo: PacienteRepository,
    private readonly cifrado: CifradoReversiblePort,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(id: string, input: EditarPacienteInput, actor: { actorId: string; actorRol: Rol | null }) {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NoEncontradoError("Paciente no existe");

    const datos: Parameters<PacienteRepository["actualizar"]>[1] = {};
    if (input.nombres !== undefined) datos.nombres = input.nombres;
    if (input.etiqueta !== undefined) datos.etiqueta = input.etiqueta;
    if (input.banda !== undefined) datos.banda = input.banda;
    if (input.fechaObjetivo !== undefined) datos.fechaObjetivo = parseFecha(input.fechaObjetivo);
    if (input.canal !== undefined) datos.canal = input.canal;
    if (input.horaPreferida !== undefined) datos.horaPreferida = input.horaPreferida;
    if (input.telefono !== undefined) {
      // Cambio de número: re-hash + re-cifrado (RNF-01); el hash es la identidad
      // del canal (bot), así que debe ser único entre pacientes.
      const numeroHash = this.cifrado.hashNumero(input.telefono);
      const otro = await this.repo.buscarPorHash(numeroHash);
      if (otro && otro.id !== id) {
        throw new DominioError("PACIENTE_EXISTE", "Ya existe otro paciente con ese número", 409);
      }
      datos.numeroHash = numeroHash;
      datos.numeroCifrado = this.cifrado.cifrarNumero(input.telefono);
    }
    if (input.tipoProcedimientoId !== undefined) datos.tipoProcedimientoId = input.tipoProcedimientoId;
    if (input.frecuenciaDias !== undefined) datos.frecuenciaDias = input.frecuenciaDias;
    if (input.servicio !== undefined) datos.servicio = input.servicio;
    if (input.activo !== undefined) datos.activo = input.activo;
    if (input.hospitalizado !== undefined) datos.hospitalizado = input.hospitalizado;

    const actualizado = await this.repo.actualizar(id, datos);

    // La etiqueta es señal clínica: acción específica en auditoría (RF prioridad).
    const accion = input.etiqueta !== undefined && input.etiqueta !== existente.etiqueta
      ? "ASIGNAR_ETIQUETA"
      : "EDITAR_PACIENTE";
    await this.auditoria.registrar({
      accion,
      entidad: "PACIENTE",
      entidadId: id,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { campos: Object.keys(datos) },
    });

    return actualizado;
  }
}
