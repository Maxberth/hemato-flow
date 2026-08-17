import { prisma } from "../../../infrastructure/prisma/prisma.service";
import { fechaDbALocal } from "../../../common/hora";
import { ConfiguracionService } from "../../configuracion/application/configuracion.service";
import { textoAviso } from "../../canal/application/plantillas";

interface ConfigTrabajoSocial {
  horasPreviasCita: number;
  slaHoras: number;
}

export interface RegistrarNoLlegoDeps {
  config: ConfiguracionService;
}

/**
 * Marca una cita NO_LLEGO con sus efectos downstream en una transacción
 * interna e idempotente:
 * - estado → NO_LLEGO;
 * - Aviso PREGUNTA_MOTIVO (programadoPara = ahora) si no existe;
 * - TareaSocial INASISTENCIA con SLA de trabajo_social si no hay pendiente;
 * - Auditoría MARCAR_NO_LLEGO (actor SISTEMA).
 *
 * Reutilizado por ambulatorio (camillas), consulta (atender) y cierre-día.
 */
export function crearRegistrarNoLlego(deps: RegistrarNoLlegoDeps) {
  return async function registrarNoLlego(citaId: string): Promise<void> {
    const config = await deps.config.obtener<ConfigTrabajoSocial>("trabajo_social");
    const ahora = new Date();

    await prisma.$transaction(async (tx) => {
      const cita = await tx.cita.findUnique({
        where: { id: citaId },
        select: {
          id: true,
          pacienteId: true,
          fecha: true,
          horaEstimada: true,
          estado: true,
          paciente: { select: { nombres: true, canal: true } },
        },
      });
      if (!cita || cita.estado === "NO_LLEGO") return; // idempotente

      await tx.cita.update({ where: { id: citaId }, data: { estado: "NO_LLEGO" } });

      const avisoExistente = await tx.aviso.findFirst({
        where: { citaId, tipo: "PREGUNTA_MOTIVO" },
        select: { id: true },
      });
      if (!avisoExistente) {
        await tx.aviso.create({
          data: {
            citaId,
            tipo: "PREGUNTA_MOTIVO",
            canal: cita.paciente.canal,
            mensaje: textoAviso("PREGUNTA_MOTIVO", {
              nombres: cita.paciente.nombres,
              fecha: fechaDbALocal(cita.fecha),
              hora: cita.horaEstimada ?? "08:00",
            }),
            programadoPara: ahora,
          },
        });
      }

      const tareaExistente = await tx.tareaSocial.findFirst({
        where: { citaId, tipo: "INASISTENCIA", estado: { in: ["PENDIENTE", "EN_PROCESO"] } },
        select: { id: true },
      });
      if (!tareaExistente) {
        await tx.tareaSocial.create({
          data: {
            pacienteId: cita.pacienteId,
            citaId,
            tipo: "INASISTENCIA",
            venceEn: new Date(ahora.getTime() + config.slaHoras * 3_600_000),
          },
        });
      }

      await tx.auditoria.create({
        data: {
          accion: "MARCAR_NO_LLEGO",
          entidad: "CITA",
          entidadId: citaId,
          actorId: "SISTEMA",
          actorRol: null,
          detalle: { automatico: true },
        },
      });
    });
  };
}

export type RegistrarNoLlego = (citaId: string) => Promise<void>;
