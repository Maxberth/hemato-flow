import { CifradoReversiblePort } from "../../../infrastructure/cifrado/cifrado.port";
import { ConfiguracionService } from "../../configuracion/application/configuracion.service";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { TareaSocialRepository } from "../../trabajo-social/domain/tarea-social.repository";
import { CausaInasistenciaRepository } from "../../trabajo-social/domain/causa-inasistencia.repository";
import { PacienteRepository } from "../../pacientes/domain/paciente.repository";
import { CitaRepository } from "../../citas/domain/cita.repository";
import { CanalSalidaPort } from "../domain/canal-salida.port";
import { ClasificadorIntencionPort } from "../domain/clasificador-intencion.port";
import { ClasificadorCausaPort } from "../domain/clasificador-causa.port";
import { crearChatbotWorkflow, type ChatbotWorkflow } from "./chatbot.workflow";
import type { TwilioWebhookParsed } from "../dto/twilio-webhook.dto";

/**
 * Bot conversacional de citas (WhatsApp/Telegram): chatbot clásico if/else
 * implementado como workflow Mastra determinista (sin LLM).
 * NUNCA crea ni mueve citas por sí mismo (RNF-5).
 */
export class ProcesarMensajeUseCase {
  private readonly workflow: ChatbotWorkflow;

  constructor(
    cifrado: CifradoReversiblePort,
    pacienteRepo: PacienteRepository,
    citaRepo: CitaRepository,
    canalSalida: CanalSalidaPort,
    intencion: ClasificadorIntencionPort,
    causa: ClasificadorCausaPort,
    causaRepo: CausaInasistenciaRepository,
    tareas: TareaSocialRepository,
    config: ConfiguracionService,
    auditoria: AuditoriaRepository,
  ) {
    this.workflow = crearChatbotWorkflow({
      cifrado,
      pacienteRepo,
      citaRepo,
      canalSalida,
      intencion,
      causa,
      causaRepo,
      tareas,
      config,
      auditoria,
    });
  }

  async ejecutar(webhook: TwilioWebhookParsed): Promise<{ estado: string }> {
    const run = await this.workflow.createRun();
    const resultado = await run.start({ inputData: { webhook } });
    if (resultado.status !== "success" || !resultado.result) {
      const error = (resultado as { error?: { message?: string } }).error;
      throw new Error(`Chatbot falló (${resultado.status}): ${error?.message ?? "desconocido"}`);
    }
    return resultado.result as { estado: string };
  }
}
