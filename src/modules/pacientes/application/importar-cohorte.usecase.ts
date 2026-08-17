import type { Rol } from "@prisma/client";
import { CifradoReversiblePort } from "../../../infrastructure/cifrado/cifrado.port";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { PacienteRepository } from "../domain/paciente.repository";
import { parseFecha, type ImportarCohorteInput } from "../dto/paciente.dto";

export class ImportarCohorteUseCase {
  constructor(
    private readonly repo: PacienteRepository,
    private readonly cifrado: CifradoReversiblePort,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async ejecutar(input: ImportarCohorteInput, actor: { actorId: string; actorRol: Rol | null }) {
    let importados = 0;
    let duplicados = 0;

    for (const item of input.pacientes) {
      const numeroHash = this.cifrado.hashNumero(item.telefono);
      const existente = await this.repo.buscarPorHash(numeroHash);
      if (existente) {
        duplicados += 1;
        continue;
      }
      await this.repo.crear({
        numeroHash,
        numeroCifrado: this.cifrado.cifrarNumero(item.telefono),
        nombres: item.nombres,
        etiqueta: item.etiqueta,
        banda: item.banda,
        fechaObjetivo: parseFecha(item.fechaObjetivo),
        canal: item.canal,
        tipoProcedimientoId: item.tipoProcedimientoId,
        frecuenciaDias: item.frecuenciaDias ?? null,
        servicio: item.servicio,
      });
      importados += 1;
    }

    await this.auditoria.registrar({
      accion: "IMPORTAR_COHORTE",
      entidad: "PACIENTE",
      actorId: actor.actorId,
      actorRol: actor.actorRol,
      detalle: { importados, duplicados },
    });

    return { importados, duplicados };
  }
}
