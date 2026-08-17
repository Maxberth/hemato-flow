import { AesGcmCifradoAdapter } from "../infrastructure/cifrado/aes-gcm.adapter";
import { getCanalSalida } from "../modules/canal/infrastructure/canal-salida.factory";
import { PrismaWebhookEventRepository } from "../modules/canal/infrastructure/prisma-webhook-event.repository";
import { PrismaConfiguracionRepository } from "../modules/configuracion/infrastructure/prisma-configuracion.repository";
import { ConfiguracionService } from "../modules/configuracion/application/configuracion.service";
import { PrismaAuditoriaRepository } from "../modules/auditoria/infrastructure/prisma-auditoria.repository";
import { PrismaPacienteRepository } from "../modules/pacientes/infrastructure/prisma-paciente.repository";
import { RegistrarPacienteUseCase } from "../modules/pacientes/application/registrar-paciente.usecase";
import { EditarPacienteUseCase } from "../modules/pacientes/application/editar-paciente.usecase";
import { ImportarCohorteUseCase } from "../modules/pacientes/application/importar-cohorte.usecase";
import { CambiarHospitalizacionUseCase } from "../modules/pacientes/application/cambiar-hospitalizacion.usecase";
import { AsignarResponsableUseCase } from "../modules/pacientes/application/asignar-responsable.usecase";
import { QuitarResponsableUseCase } from "../modules/pacientes/application/quitar-responsable.usecase";
import { PrismaProfesionalRepository } from "../modules/profesionales/infrastructure/prisma-profesional.repository";
import { PrismaCitaRepository } from "../modules/citas/infrastructure/prisma-cita.repository";
import { crearRegistrarNoLlego, type RegistrarNoLlego } from "../modules/citas/application/registrar-no-llego";
import { CancelarCitaUseCase } from "../modules/citas/application/cancelar-cita.usecase";
import { PrismaCamillaRepository } from "../modules/ambulatorio/infrastructure/prisma-camilla.repository";
import { AtenderCamillaUseCase } from "../modules/ambulatorio/application/atender-camilla.usecase";
import { crearAbrirDia, type AbrirDia } from "../modules/ambulatorio/application/abrir-dia";
import { AtenderConsultaUseCase } from "../modules/consulta/application/atender-consulta.usecase";
import { PrismaAvisoRepository } from "../modules/avisos/infrastructure/prisma-aviso.repository";
import { PrismaTareaSocialRepository } from "../modules/trabajo-social/infrastructure/prisma-tarea-social.repository";
import { PrismaCausaInasistenciaRepository } from "../modules/trabajo-social/infrastructure/prisma-causa-inasistencia.repository";
import { TomarTareaUseCase } from "../modules/trabajo-social/application/tomar-tarea.usecase";
import { ResolverTareaUseCase } from "../modules/trabajo-social/application/resolver-tarea.usecase";
import { PrismaPlanificacionRepository } from "../modules/planificacion/infrastructure/prisma-planificacion.repository";
import { GenerarLoteUseCase } from "../modules/planificacion/application/generar-lote.usecase";
import { AprobarLoteUseCase } from "../modules/planificacion/application/aprobar-lote.usecase";
import { RechazarLoteUseCase } from "../modules/planificacion/application/rechazar-lote.usecase";
import { ProcesarMensajeUseCase } from "../modules/canal/application/procesar-mensaje.usecase";
import { ReglasIntencionAdapter } from "../modules/canal/infrastructure/reglas-intencion.adapter";
import { ReglasCausaAdapter } from "../modules/canal/infrastructure/reglas-causa.adapter";
import { CronHematoflow } from "../infrastructure/cron/hematoflow.jobs";
import type { TwilioWebhookParsed } from "../modules/canal/dto/twilio-webhook.dto";

/** Puerto mínimo que el procesador de mensajes debe satisfacer. */
export interface ProcesadorMensajePort {
  ejecutar(webhook: TwilioWebhookParsed): Promise<{ estado: string }>;
}

/** Composition root manual (wiring sin framework DI) */
export const di = {
  cifrado: new AesGcmCifradoAdapter(),
  canalSalida: getCanalSalida(),
  webhookEventRepo: new PrismaWebhookEventRepository(),
  configuracionRepo: new PrismaConfiguracionRepository(),
  configuracion: new ConfiguracionService(new PrismaConfiguracionRepository()),
  auditoria: new PrismaAuditoriaRepository(),
  pacienteRepo: new PrismaPacienteRepository(),
  registrarPaciente: null as RegistrarPacienteUseCase | null,
  editarPaciente: null as EditarPacienteUseCase | null,
  importarCohorte: null as ImportarCohorteUseCase | null,
  hospitalizacion: null as CambiarHospitalizacionUseCase | null,
  asignarResponsable: null as AsignarResponsableUseCase | null,
  quitarResponsable: null as QuitarResponsableUseCase | null,
  profesionalRepo: new PrismaProfesionalRepository(),
  citaRepo: new PrismaCitaRepository(),
  camillaRepo: new PrismaCamillaRepository(),
  avisoRepo: new PrismaAvisoRepository(),
  tareaRepo: new PrismaTareaSocialRepository(),
  causaRepo: new PrismaCausaInasistenciaRepository(),
  tomarTarea: null as TomarTareaUseCase | null,
  resolverTarea: null as ResolverTareaUseCase | null,
  registrarNoLlego: null as RegistrarNoLlego | null,
  cancelarCita: null as CancelarCitaUseCase | null,
  atenderCamilla: null as AtenderCamillaUseCase | null,
  abrirDia: null as AbrirDia | null,
  atenderConsulta: null as AtenderConsultaUseCase | null,
  planificacionRepo: new PrismaPlanificacionRepository(),
  generarLote: null as GenerarLoteUseCase | null,
  aprobarLote: null as AprobarLoteUseCase | null,
  rechazarLote: null as RechazarLoteUseCase | null,
  cronHematoflow: null as CronHematoflow | null,
  procesarMensaje: null as ProcesadorMensajePort | null,
};

di.registrarPaciente = new RegistrarPacienteUseCase(di.pacienteRepo, di.cifrado, di.auditoria);
di.editarPaciente = new EditarPacienteUseCase(di.pacienteRepo, di.cifrado, di.auditoria);
di.importarCohorte = new ImportarCohorteUseCase(di.pacienteRepo, di.cifrado, di.auditoria);
di.hospitalizacion = new CambiarHospitalizacionUseCase(di.pacienteRepo, di.auditoria);
di.asignarResponsable = new AsignarResponsableUseCase(di.pacienteRepo, di.auditoria);
di.quitarResponsable = new QuitarResponsableUseCase(di.pacienteRepo, di.auditoria);
di.registrarNoLlego = crearRegistrarNoLlego({ config: di.configuracion });
di.tomarTarea = new TomarTareaUseCase(di.tareaRepo, di.auditoria);
di.resolverTarea = new ResolverTareaUseCase(di.tareaRepo, di.auditoria);
di.cancelarCita = new CancelarCitaUseCase(di.citaRepo, di.avisoRepo, di.auditoria);
di.atenderCamilla = new AtenderCamillaUseCase(di.camillaRepo, di.registrarNoLlego, di.auditoria);
di.abrirDia = crearAbrirDia(di.camillaRepo, di.configuracion);
di.atenderConsulta = new AtenderConsultaUseCase(di.citaRepo, di.registrarNoLlego);
di.generarLote = new GenerarLoteUseCase(di.planificacionRepo, di.configuracion, di.auditoria);
di.aprobarLote = new AprobarLoteUseCase(di.planificacionRepo, di.configuracion, di.auditoria);
di.rechazarLote = new RechazarLoteUseCase(di.planificacionRepo, di.auditoria);

di.procesarMensaje = new ProcesarMensajeUseCase(
  di.cifrado,
  di.pacienteRepo,
  di.citaRepo,
  di.canalSalida,
  new ReglasIntencionAdapter(),
  new ReglasCausaAdapter(),
  di.causaRepo,
  di.tareaRepo,
  di.configuracion,
  di.auditoria,
);

di.cronHematoflow = new CronHematoflow({
  cifrado: di.cifrado,
  avisos: di.avisoRepo,
  tareas: di.tareaRepo,
  webhookEventRepo: di.webhookEventRepo,
  config: di.configuracion,
  auditoria: di.auditoria,
  procesarMensaje: di.procesarMensaje!,
  registrarNoLlego: di.registrarNoLlego!,
  abrirDia: di.abrirDia!,
});
