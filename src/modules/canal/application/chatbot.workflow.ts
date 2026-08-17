import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import { CifradoReversiblePort } from "../../../infrastructure/cifrado/cifrado.port";
import { fechaDbALocal } from "../../../common/hora";
import { ConfiguracionService } from "../../configuracion/application/configuracion.service";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { TareaSocialRepository } from "../../trabajo-social/domain/tarea-social.repository";
import { CausaInasistenciaRepository } from "../../trabajo-social/domain/causa-inasistencia.repository";
import { PacienteRepository } from "../../pacientes/domain/paciente.repository";
import { CitaRepository } from "../../citas/domain/cita.repository";
import { CanalSalidaPort } from "../domain/canal-salida.port";
import { ClasificadorIntencionPort } from "../domain/clasificador-intencion.port";
import { ClasificadorCausaPort } from "../domain/clasificador-causa.port";
import { fechaHoraTexto, textoBot } from "./plantillas";
import type { TwilioWebhookParsed } from "../dto/twilio-webhook.dto";

/**
 * Chatbot clásico de citas implementado como workflow Mastra DETERMINISTA
 * (sin LLM): pasos + ramas condicionales exclusivas (if/else). Nunca crea ni
 * mueve citas por sí mismo (RNF-5); toda creación/reprogramación pasa por
 * aprobación del médico.
 */

const webhookSchema = z.object({
  messageSid: z.string(),
  from: z.string(),
  to: z.string(),
  body: z.string(),
  numMedia: z.number(),
  mediaContentType: z.string().optional().nullable(),
  mediaUrl: z.string().optional().nullable(),
  contactoTelefono: z.string().optional().nullable(),
});

const pacienteSchema = z
  .object({
    id: z.string(),
    nombres: z.string(),
    canal: z.enum(["WHATSAPP", "TELEGRAM"]),
  })
  .nullable();

const causaPendienteSchema = z
  .object({
    id: z.string(),
    fecha: z.string(),
    horaEstimada: z.string().nullable(),
  })
  .nullable();

const citaActivaSchema = z
  .object({
    id: z.string(),
    estado: z.string(),
    fecha: z.string(),
    turno: z.number().nullable(),
    horaEstimada: z.string().nullable(),
  })
  .nullable();

const lookupOutputSchema = z.object({
  webhook: webhookSchema,
  paciente: pacienteSchema,
  causaPendiente: causaPendienteSchema,
  intencion: z.string(),
  citaActiva: citaActivaSchema,
  // Tarea SILENCIO del bot en curso para la cita activa (flujo de negación):
  // resultado null = esperando motivo; con resultado = esperando SÍ/NO de reprogramación.
  tareaNegacion: z
    .object({ id: z.string(), resultado: z.string().nullable() })
    .nullable(),
});

const estadoSchema = z.object({ estado: z.string() });

const ESTADOS_BOT_ACTIVOS = ["PROGRAMADA", "CONFIRMADA", "EN_ATENCION"] as const;

/**
 * Variantes del celular compartido por Telegram para cruzar contra numeroHash:
 * tal cual, "+<dígitos>" (E.164) y "+51<dígitos>" (número nacional peruano).
 */
function candidatosTelefono(tel: string): string[] {
  const solo = tel.replace(/\D/g, "");
  const candidatos = new Set<string>([tel, `+${solo}`]);
  if (!solo.startsWith("51")) candidatos.add(`+51${solo}`);
  return [...candidatos];
}

export interface ChatbotDeps {
  cifrado: CifradoReversiblePort;
  pacienteRepo: PacienteRepository;
  citaRepo: CitaRepository;
  canalSalida: CanalSalidaPort;
  intencion: ClasificadorIntencionPort;
  causa: ClasificadorCausaPort;
  causaRepo: CausaInasistenciaRepository;
  tareas: TareaSocialRepository;
  config: ConfiguracionService;
  auditoria: AuditoriaRepository;
}

interface ConfigTrabajoSocial {
  horasPreviasCita: number;
  slaHoras: number;
}

export function crearChatbotWorkflow(deps: ChatbotDeps) {
  // ── Step 1: lookup (paciente + causa pendiente + intención + cita activa) ──
  const lookup = createStep({
    id: "lookup",
    inputSchema: z.object({ webhook: webhookSchema }),
    outputSchema: lookupOutputSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      const fromHash = deps.cifrado.hashNumero(webhook.from);
      let paciente = await deps.pacienteRepo.buscarPorHash(fromHash);
      const esTelegram = webhook.from.startsWith("tg:");
      const chatId = esTelegram ? webhook.from.replace(/^tg:/i, "") : null;

      // Chat ya vinculado (flujo "compartir contacto" completado antes).
      if (!paciente && chatId) {
        paciente = await deps.pacienteRepo.buscarPorTelegramChat(chatId);
      }

      // Vinculación nueva: el paciente compartió su celular con el bot.
      // Se cruza contra la ficha (numeroHash) y se guarda el chatId + canal.
      let vinculadoAhora = false;
      if (!paciente && esTelegram && chatId && webhook.contactoTelefono) {
        for (const tel of candidatosTelefono(webhook.contactoTelefono)) {
          const porCelular = await deps.pacienteRepo.buscarPorHash(deps.cifrado.hashNumero(tel));
          if (porCelular) {
            await deps.pacienteRepo.actualizar(porCelular.id, {
              telegramChatId: chatId,
              canal: "TELEGRAM",
            });
            paciente = porCelular;
            vinculadoAhora = true;
            await deps.canalSalida
              .enviarMensaje(webhook.from, textoBot("VINCULADO"))
              .catch(() => {});
            break;
          }
        }
      }

      if (!paciente) {
        return {
          webhook,
          paciente: null,
          causaPendiente: null,
          intencion: "",
          citaActiva: null,
          tareaNegacion: null,
        };
      }

      // Auditoría de conversación (modelo Mensaje).
      await prisma.mensaje
        .create({
          data: {
            pacienteId: paciente.id,
            sid: webhook.messageSid,
            remitente: "PACIENTE",
            contenido: webhook.body.slice(0, 1000),
          },
        })
        .catch(() => {});

      const causaPendiente = vinculadoAhora
        ? null // el mensaje de vinculación (compartir contacto) no trae texto ni causa
        : await deps.citaRepo.buscarNoLlegoConCausaPendiente(paciente.id);
      // Contacto recién vinculado: el mensaje no trae texto → responder con la cita.
      const intencion = vinculadoAhora
        ? "CONSULTAR"
        : await deps.intencion.clasificar(webhook.body);

      const citas = await deps.citaRepo.listar({ pacienteId: paciente.id });
      const citaActiva =
        citas.find((c) => (ESTADOS_BOT_ACTIVOS as readonly string[]).includes(c.estado)) ?? null;

      // Tarea de negación en curso (SILENCIO creada por el bot con marcador
      // resultado="NEGACION"). Las tareas del detector-silencios (resultado
      // null) NO son una negación del paciente → se ignoran para este flujo.
      const tareaNegacionRaw = citaActiva
        ? await deps.tareas.buscarPendientePorCita(citaActiva.id, "SILENCIO")
        : null;
      const tareaNegacion =
        tareaNegacionRaw && tareaNegacionRaw.resultado !== null
          ? { id: tareaNegacionRaw.id, resultado: tareaNegacionRaw.resultado }
          : null;

      return {
        webhook,
        paciente: { id: paciente.id, nombres: paciente.nombres, canal: paciente.canal },
        causaPendiente: causaPendiente
          ? {
              id: causaPendiente.id,
              fecha: causaPendiente.fecha.toISOString(),
              horaEstimada: causaPendiente.horaEstimada,
            }
          : null,
        intencion,
        tareaNegacion: tareaNegacion
          ? { id: tareaNegacion.id, resultado: tareaNegacion.resultado }
          : null,
        citaActiva: citaActiva
          ? {
              id: citaActiva.id,
              estado: citaActiva.estado,
              fecha: citaActiva.fecha.toISOString(),
              turno: citaActiva.turno,
              horaEstimada: citaActiva.horaEstimada,
            }
          : null,
      };
    },
  });

  // ── Ramas (if/else clásico: condiciones mutuamente excluyentes) ──
  const noRegistrado = createStep({
    id: "no-registrado",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      // Chat de Telegram desconocido sin contacto compartido: pedir el celular
      // para vincular (el bot no puede ver el número por su cuenta).
      if (webhook.from.startsWith("tg:") && !webhook.contactoTelefono) {
        await deps.canalSalida.pedirContacto(webhook.from, textoBot("PEDIR_CONTACTO")).catch(() => {});
      } else {
        await deps.canalSalida.enviarMensaje(webhook.from, textoBot("NO_REGISTRADO")).catch(() => {});
      }
      return { estado: "NO_REGISTRADO" };
    },
  });

  const registrarMotivo = createStep({
    id: "motivo",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      const causa = await deps.causa.clasificar(webhook.body);
      await deps.causaRepo.registrar(inputData.causaPendiente!.id, causa, webhook.body.slice(0, 500));
      await deps.auditoria.registrar({
        accion: "REGISTRAR_CAUSA",
        entidad: "CITA",
        entidadId: inputData.causaPendiente!.id,
        actorId: "SISTEMA",
        actorRol: null,
        detalle: { causa, texto: webhook.body.slice(0, 200) },
      });
      await deps.canalSalida.enviarMensaje(webhook.from, textoBot("MOTIVO_OK")).catch(() => {});
      return { estado: "MOTIVO_REGISTRADO" };
    },
  });

  const confirmarCita = createStep({
    id: "confirmar",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      const cita = inputData.citaActiva;
      if (!cita) {
        await deps.canalSalida.enviarMensaje(webhook.from, textoBot("SIN_CITA")).catch(() => {});
        return { estado: "SIN_CITA" };
      }
      if (cita.estado === "PROGRAMADA") {
        await deps.citaRepo.confirmar(cita.id);
        await deps.auditoria.registrar({
          accion: "CONFIRMAR_CITA",
          entidad: "CITA",
          entidadId: cita.id,
          actorId: "SISTEMA",
          actorRol: null,
        });
      }
      // Idempotente: si ya estaba CONFIRMADA, misma respuesta.
      const fechaHora = fechaHoraTexto(
        fechaDbALocal(new Date(cita.fecha)),
        cita.horaEstimada ?? "08:00",
      );
      await deps.canalSalida
        .enviarMensaje(webhook.from, textoBot("CONFIRMACION_OK", { fechaHora }))
        .catch(() => {});
      return { estado: "CONFIRMADA" };
    },
  });

  const negarCita = createStep({
    id: "negar",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      const cita = inputData.citaActiva;
      if (!cita) {
        await deps.canalSalida.enviarMensaje(webhook.from, textoBot("SIN_CITA")).catch(() => {});
        return { estado: "SIN_CITA" };
      }
      // Etapa 1: pregunta el motivo. La tarea SILENCIO informa a Trabajo Social
      // (contacto requerido) mientras el bot espera la razón del paciente.
      const config = await deps.config.obtener<ConfigTrabajoSocial>("trabajo_social");
      await deps.tareas.crear({
        pacienteId: inputData.paciente!.id,
        citaId: cita.id,
        tipo: "SILENCIO",
        venceEn: new Date(Date.now() + config.slaHoras * 3_600_000),
        resultado: "NEGACION",
      });
      await deps.canalSalida.enviarMensaje(webhook.from, textoBot("NEGAR_MOTIVO")).catch(() => {});
      return { estado: "NEGADA" };
    },
  });

  // Etapa 2: el paciente responde el motivo de su negación → se registra la
  // causa (visible para Trabajo Social en la tarea) y se ofrece reprogramar.
  const negacionMotivo = createStep({
    id: "negacion-motivo",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      const cita = inputData.citaActiva!;
      const tarea = inputData.tareaNegacion!;
      const causa = await deps.causa.clasificar(webhook.body);
      await deps.causaRepo.registrar(cita.id, causa, webhook.body.slice(0, 500));
      await deps.tareas.marcarResultado(tarea.id, `NEGACION · ${causa} · ${webhook.body.slice(0, 300)}`);
      await deps.auditoria.registrar({
        accion: "REGISTRAR_MOTIVO_NEGACION",
        entidad: "CITA",
        entidadId: cita.id,
        actorId: "SISTEMA",
        actorRol: null,
        detalle: { causa, texto: webhook.body.slice(0, 200) },
      });
      await deps.canalSalida
        .enviarMensaje(webhook.from, textoBot("REPROGRAMAR_OFERTA"), undefined, ["SÍ", "NO"])
        .catch(() => {});
      return { estado: "MOTIVO_NEGACION" };
    },
  });

  // Etapa 3a: SÍ → la cita se cancela (motivo negación) y el paciente queda
  // pendiente → el próximo lote lo reprograma según su etiqueta/prioridad.
  const reprogramarSi = createStep({
    id: "reprogramar-si",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      const cita = inputData.citaActiva!;
      const tarea = inputData.tareaNegacion!;
      await deps.citaRepo.cancelar(cita.id, "NEGACION_PACIENTE");
      await deps.tareas.resolver(tarea.id, "REPROGRAMADA");
      await deps.auditoria.registrar({
        accion: "REPROGRAMAR_POR_NEGACION",
        entidad: "CITA",
        entidadId: cita.id,
        actorId: "SISTEMA",
        actorRol: null,
      });
      await deps.canalSalida.enviarMensaje(webhook.from, textoBot("REPROGRAMADA")).catch(() => {});
      return { estado: "REPROGRAMADA" };
    },
  });

  // Etapa 3b: NO → la tarea queda PENDIENTE para que Trabajo Social tome acción.
  const reprogramarNo = createStep({
    id: "reprogramar-no",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      await deps.canalSalida.enviarMensaje(webhook.from, textoBot("CONTACTO_SOCIAL")).catch(() => {});
      return { estado: "CONTACTO_SOCIAL" };
    },
  });

  const consultarCita = createStep({
    id: "consultar",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const webhook = inputData.webhook as TwilioWebhookParsed;
      const cita = inputData.citaActiva;
      if (!cita) {
        await deps.canalSalida.enviarMensaje(webhook.from, textoBot("SIN_CITA")).catch(() => {});
        return { estado: "SIN_CITA" };
      }
      const fechaHora = fechaHoraTexto(
        fechaDbALocal(new Date(cita.fecha)),
        cita.horaEstimada ?? "08:00",
      );
      if (cita.estado === "CONFIRMADA") {
        await deps.canalSalida
          .enviarMensaje(
            webhook.from,
            textoBot("CONSULTA", { fechaHora, estado: "Está confirmada ✅" }),
          )
          .catch(() => {});
      } else {
        // Pendiente de confirmación: guía + botones SÍ/NO.
        await deps.canalSalida
          .enviarMensaje(
            webhook.from,
            textoBot("CONSULTA", {
              fechaHora,
              estado: "Está por confirmar. ¿Podrás asistir? Responde SÍ o NO.",
            }),
            undefined,
            ["SÍ", "NO"],
          )
          .catch(() => {});
      }
      return { estado: "CONSULTADA" };
    },
  });

  const fallback = createStep({
    id: "fallback",
    inputSchema: lookupOutputSchema,
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      await deps.canalSalida.enviarMensaje(inputData.webhook.from, textoBot("FALLBACK")).catch(() => {});
      return { estado: "FALLBACK" };
    },
  });

  // ── Normalizador final: único { estado } como salida del workflow ──
  const normalizar = createStep({
    id: "normalizar",
    inputSchema: z.object({
      "no-registrado": estadoSchema.optional(),
      motivo: estadoSchema.optional(),
      "negacion-motivo": estadoSchema.optional(),
      "reprogramar-si": estadoSchema.optional(),
      "reprogramar-no": estadoSchema.optional(),
      confirmar: estadoSchema.optional(),
      negar: estadoSchema.optional(),
      consultar: estadoSchema.optional(),
      fallback: estadoSchema.optional(),
    }),
    outputSchema: estadoSchema,
    execute: async ({ inputData }) => {
      const ramas = [
        "no-registrado",
        "motivo",
        "negacion-motivo",
        "reprogramar-si",
        "reprogramar-no",
        "confirmar",
        "negar",
        "consultar",
        "fallback",
      ] as const;
      for (const rama of ramas) {
        const salida = inputData[rama];
        if (salida?.estado) return { estado: salida.estado };
      }
      throw new Error("Ninguna rama del chatbot se ejecutó");
    },
  });

  return createWorkflow({
    id: "chatbot-citas",
    inputSchema: z.object({ webhook: webhookSchema }),
    outputSchema: estadoSchema,
  })
    .then(lookup)
    .branch([
      // Condiciones EXCLUSIVAS: Mastra ejecuta toda rama cuya condición sea
      // verdadera; el else-if clásico se construye negando las anteriores.
      [async (c) => !c.inputData.paciente, noRegistrado],
      [async (c) => !!c.inputData.paciente && !!c.inputData.causaPendiente, registrarMotivo],
      // Negación en curso: tarea del bot (resultado empieza en "NEGACION").
      //  - resultado === "NEGACION" → esperando el motivo (texto libre, no SÍ/NO).
      //  - resultado distinto → esperando SÍ/NO de reprogramación.
      [
        async (c) =>
          !!c.inputData.paciente &&
          !c.inputData.causaPendiente &&
          !!c.inputData.citaActiva &&
          !!c.inputData.tareaNegacion &&
          c.inputData.tareaNegacion.resultado === "NEGACION" &&
          !["CONFIRMAR", "NEGAR"].includes(c.inputData.intencion),
        negacionMotivo,
      ],
      [
        async (c) =>
          !!c.inputData.paciente &&
          !c.inputData.causaPendiente &&
          !!c.inputData.citaActiva &&
          !!c.inputData.tareaNegacion &&
          c.inputData.tareaNegacion.resultado !== "NEGACION" &&
          c.inputData.intencion === "CONFIRMAR",
        reprogramarSi,
      ],
      [
        async (c) =>
          !!c.inputData.paciente &&
          !c.inputData.causaPendiente &&
          !!c.inputData.citaActiva &&
          !!c.inputData.tareaNegacion &&
          c.inputData.tareaNegacion.resultado !== "NEGACION" &&
          c.inputData.intencion === "NEGAR",
        reprogramarNo,
      ],
      [
        async (c) =>
          !!c.inputData.paciente &&
          !c.inputData.causaPendiente &&
          !c.inputData.tareaNegacion &&
          c.inputData.intencion === "CONFIRMAR",
        confirmarCita,
      ],
      [
        async (c) =>
          !!c.inputData.paciente &&
          !c.inputData.causaPendiente &&
          !c.inputData.tareaNegacion &&
          c.inputData.intencion === "NEGAR",
        negarCita,
      ],
      [
        async (c) =>
          !!c.inputData.paciente && !c.inputData.causaPendiente && c.inputData.intencion === "CONSULTAR",
        consultarCita,
      ],
      // Else clásico: paciente registrado, sin causa pendiente e intención no
      // cubierta por CONFIRMAR/NEGAR/CONSULTAR (las condiciones deben ser
      // EXCLUSIVAS — Mastra ejecuta toda rama cuya condición sea verdadera).
      // Excluye la negación en etapa 1 (esperando motivo): ahí responde el bot
      // con la oferta de reprogramación, no con el fallback genérico.
      [
        async (c) =>
          !!c.inputData.paciente &&
          !c.inputData.causaPendiente &&
          (c.inputData.tareaNegacion === null ||
            c.inputData.tareaNegacion.resultado !== "NEGACION") &&
          !["CONFIRMAR", "NEGAR", "CONSULTAR"].includes(c.inputData.intencion),
        fallback,
      ],
    ])
    .then(normalizar)
    .commit();
}

export type ChatbotWorkflow = ReturnType<typeof crearChatbotWorkflow>;
