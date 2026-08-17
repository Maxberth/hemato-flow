import type { Rol } from "@prisma/client";
import { CifradoReversiblePort } from "../../../infrastructure/cifrado/cifrado.port";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { PacienteRepository } from "../domain/paciente.repository";
import { DominioError } from "../../../common/errors/dominio.error";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import { parseFecha, type CrearPacienteInput } from "../dto/paciente.dto";

export interface ActorAuditoria {
  actorId: string;
  actorRol: Rol | null;
}

export class RegistrarPacienteUseCase {
  constructor(
    private readonly repo: PacienteRepository,
    private readonly cifrado: CifradoReversiblePort,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(input: CrearPacienteInput, actor: ActorAuditoria) {
    const numeroHash = this.cifrado.hashNumero(input.telefono);
    const existente = await this.repo.buscarPorHash(numeroHash);
    if (existente) {
      throw new DominioError("PACIENTE_EXISTE", "Ya existe un paciente con ese número", 409);
    }

    const tipoExiste = await prisma.tipoProcedimiento.findUnique({
      where: { id: input.tipoProcedimientoId },
    });
    if (!tipoExiste) {
      throw new DominioError("TIPO_INVALIDO", "Tipo de procedimiento no existe", 400);
    }

    const paciente = await this.repo.crear({
      numeroHash,
      numeroCifrado: this.cifrado.cifrarNumero(input.telefono),
      nombres: input.nombres,
      etiqueta: input.etiqueta,
      banda: input.banda,
      fechaObjetivo: parseFecha(input.fechaObjetivo),
      canal: input.canal,
      tipoProcedimientoId: input.tipoProcedimientoId,
      frecuenciaDias: input.frecuenciaDias ?? null,
      servicio: input.servicio,
    });

    await this.auditoria.registrar({
      accion: "EDITAR_PACIENTE",
      entidad: "PACIENTE",
      entidadId: paciente.id,
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { tipo: "CREACION", nombres: paciente.nombres },
    });

    return paciente;
  }
}
