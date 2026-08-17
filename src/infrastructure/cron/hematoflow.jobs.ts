import { CifradoReversiblePort } from "../cifrado/cifrado.port";
import { ConfiguracionService } from "../../modules/configuracion/application/configuracion.service";
import { AuditoriaRepository } from "../../modules/auditoria/domain/auditoria.repository";
import { AvisoRepository } from "../../modules/avisos/domain/aviso.repository";
import { TareaSocialRepository } from "../../modules/trabajo-social/domain/tarea-social.repository";
import { WebhookEventRepository } from "../../modules/canal/domain/webhook-event.repository";
import { formatearDestino } from "../../modules/canal/domain/destino";
import { getCanalParaAviso } from "../../modules/canal/infrastructure/canal-salida.factory";
import { encolarPorHash } from "../../modules/canal/application/procesar-entrante";
import type { RegistrarNoLlego } from "../../modules/citas/application/registrar-no-llego";
import type { AbrirDia } from "../../modules/ambulatorio/application/abrir-dia";
import { fechaDbALocal, horaAMinutos, horaPreferidaMin, minutosAHora, sumarDias } from "../../common/hora";
import { prisma } from "../prisma/prisma.service";
import { logger } from "../../common/logger";
import type { TwilioWebhookParsed } from "../../modules/canal/dto/twilio-webhook.dto";

interface ConfigNotificaciones {
  ventanaRecordatorioHoras: number;
  reintentosMax: number;
  reintentoEsperaMin: number;
}

interface ConfigTrabajoSocial {
  horasPreviasCita: number;
  slaHoras: number;
}

interface ConfigTurnos {
  duracionEstimadaMin: number;
  horasApertura: string;
  diasPlazoConfirmacion: number;
  camillasPorDia: number;
}

const ORDEN_ETIQUETA: Record<string, number> = { ROJA: 0, AMARILLA: 1, VERDE: 2 };

export interface CronHematoflowDeps {
  cifrado: CifradoReversiblePort;
  avisos: AvisoRepository;
  tareas: TareaSocialRepository;
  webhookEventRepo: WebhookEventRepository;
  config: ConfiguracionService;
  auditoria: AuditoriaRepository;
  procesarMensaje: { ejecutar(webhook: TwilioWebhookParsed): Promise<{ estado: string }> };
  registrarNoLlego: RegistrarNoLlego;
  abrirDia: AbrirDia;
}

/**
 * Jobs de HematoFlow (turnos y camillas):
 * - dispatcher-avisos (60 s): envía avisos PROGRAMADO vencidos + reintenta webhooks.
 * - detector-silencios (5 min): citas PROGRAMADA sin respuesta → tarea SILENCIO.
 * - abrir-dia (diario 00:05): crea las camillas 1..N del día de hoy.
 * - cierre-turnos (diario 01:00): reordena la cola del día en T-3 (confirmados
 *   primero por prioridad; no confirmados al final) y renumera turno/horaEstimada.
 * - cierre-dia (diario 23:59): pendientes del día → NO_LLEGO; EN_ATENCION → ASISTIDA;
 *   camillas abiertas → LIBRE con eventos cerrados.
 */
export class CronHematoflow {
  constructor(private readonly deps: CronHematoflowDeps) {}

  /** Ciclo rápido (60 s): avisos + reintento de webhooks. */
  async ejecutarCicloRapido(): Promise<{ avisosEnviados: number; webhooksReintentados: number }> {
    const avisosEnviados = await this.dispatchAvisos();
    const webhooksReintentados = await this.reintentarWebhooks();
    return { avisosEnviados, webhooksReintentados };
  }

  /** Ciclo lento (5 min): detectores. */
  async ejecutarCicloLento(): Promise<{ silencios: number }> {
    const silencios = await this.detectarSilencios();
    return { silencios };
  }

  /**
   * Ciclo diario con guardas de hora (00:05 / 01:00 / 23:59). Compatible con
   * Bun.cron y con el fallback setInterval de Windows (se llama cada minuto).
   */
  async ejecutarCicloDiario(): Promise<void> {
    const ahora = new Date();
    const hh = ahora.getHours();
    const mm = ahora.getMinutes();
    if (hh === 0 && mm === 5) await this.abrirDia();
    if (hh === 1 && mm === 0) await this.cierreTurnos();
    if (hh === 23 && mm === 59) await this.cierreDia();
  }

  async dispatchAvisos(): Promise<number> {
    const config = await this.deps.config.obtener<ConfigNotificaciones>("notificaciones");
    const ahora = new Date();
    const pendientes = await this.deps.avisos.listarPendientesDeEnvio(ahora);
    let enviados = 0;

    for (const aviso of pendientes) {
      try {
        const paciente = aviso.cita.paciente;
        // Paciente vinculado por celular (flujo "compartir contacto"): el chat
        // de Telegram está guardado en telegramChatId, no en el número cifrado.
        const destino =
          paciente.canal === "TELEGRAM" && paciente.telegramChatId
            ? `tg:${paciente.telegramChatId}`
            : formatearDestino(this.deps.cifrado.descifrarNumero(paciente.numeroCifrado));
        const canal = getCanalParaAviso(aviso.canal);
        const botones =
          aviso.tipo === "AVISO_CITA" || aviso.tipo === "REPROGRAMACION" ? ["SÍ", "NO"] : undefined;
        await canal.enviarMensaje(destino, aviso.mensaje, undefined, botones);
        await this.deps.avisos.marcarEnviado(aviso.id, new Date());
        enviados += 1;
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : "error desconocido";
        if (aviso.intentos + 1 < config.reintentosMax) {
          await this.deps.avisos.marcarErrorReintento(aviso.id, mensaje, config.reintentoEsperaMin);
          logger.warn({ avisoId: aviso.id, mensaje }, "Aviso con error, se reintentará");
        } else {
          await this.deps.avisos.marcarFallido(aviso.id, mensaje);
          logger.error({ avisoId: aviso.id, mensaje }, "Aviso FALLIDO tras reintentos");
        }
      }
    }
    return enviados;
  }

  /** Reintenta webhooks en ERROR. */
  async reintentarWebhooks(): Promise<number> {
    const config = await this.deps.config.obtener<ConfigNotificaciones>("notificaciones");
    const fallidos = await this.deps.webhookEventRepo.listarFallidos(config.reintentosMax, 20);

    for (const evento of fallidos) {
      const payload = (evento.payload ?? undefined) as TwilioWebhookParsed | undefined;
      if (!payload?.messageSid) continue;

      await this.deps.webhookEventRepo.incrementarIntentos(evento.sid);
      void encolarPorHash(evento.fromHash, async () => {
        try {
          await this.deps.procesarMensaje.ejecutar(payload);
          await this.deps.webhookEventRepo.marcarProcesado(evento.sid);
          logger.info({ sid: evento.sid }, "Webhook reintentado procesado");
        } catch (err) {
          await this.deps.webhookEventRepo.marcarError(
            evento.sid,
            err instanceof Error ? err.message : "error",
          );
        }
      });
    }
    return fallidos.length;
  }

  /** Citas PROGRAMADA dentro de horasPreviasCita sin tarea SILENCIO → tarea con SLA. */
  async detectarSilencios(): Promise<number> {
    const config = await this.deps.config.obtener<ConfigTrabajoSocial>("trabajo_social");
    const ahora = new Date();
    const limite = new Date(ahora.getTime() + config.horasPreviasCita * 3_600_000);
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    // El límite de fechas DB (medianoche UTC) para incluir el día de hoy.
    const hoyUtc = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

    const citas = await prisma.cita.findMany({
      where: {
        estado: "PROGRAMADA",
        fecha: { gte: hoyUtc, lte: limite },
        tareasSociales: {
          none: { tipo: "SILENCIO", estado: { in: ["PENDIENTE", "EN_PROCESO"] } },
        },
      },
      select: { id: true, pacienteId: true },
    });

    for (const cita of citas) {
      await this.deps.tareas.crear({
        pacienteId: cita.pacienteId,
        citaId: cita.id,
        tipo: "SILENCIO",
        venceEn: new Date(ahora.getTime() + config.slaHoras * 3_600_000),
      });
      await this.deps.auditoria.registrar({
        accion: "GENERAR_TAREA",
        entidad: "TAREA_SOCIAL",
        entidadId: cita.id,
        actorId: "SISTEMA",
        actorRol: null,
        detalle: { tipo: "SILENCIO" },
      });
    }
    if (citas.length > 0) {
      logger.info({ silencios: citas.length }, "Detector de silencios: tareas creadas");
    }
    return citas.length;
  }

  /** Crea las camillas 1..N del día de hoy (N = CupoDiario.camillas ?? config). */
  async abrirDia(): Promise<{ camillas: number }> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const resultado = await this.deps.abrirDia(hoy);
    await this.deps.auditoria.registrar({
      accion: "ABRIR_DIA",
      entidad: "DIA",
      entidadId: hoy.toISOString().slice(0, 10),
      actorId: "SISTEMA",
      actorRol: null,
      detalle: resultado,
    });
    logger.info({ fecha: hoy.toISOString().slice(0, 10), ...resultado }, "abrir-dia: camillas listas");
    return resultado;
  }

  /**
   * Reordena la cola del día en fecha = hoy + diasPlazoConfirmacion:
   * confirmados primero (etiqueta asc → confirmadaEn asc), no confirmados al
   * final (etiqueta asc → turno asc); renumera turno 1..N por cola y recomputa
   * horaEstimada (fórmula del motor: apertura + Σ duraciones previas).
   */
  async cierreTurnos(): Promise<{ fecha: string; reordenados: number }> {
    const turnos = await this.deps.config.obtener<ConfigTurnos>("turnos");
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaCierre = sumarDias(hoy, turnos.diasPlazoConfirmacion);
    const fechaUtc = new Date(
      Date.UTC(fechaCierre.getFullYear(), fechaCierre.getMonth(), fechaCierre.getDate()),
    );
    const aperturaMin = horaAMinutos(turnos.horasApertura);
    const iso = fechaCierre.toISOString().slice(0, 10);

    const citas = await prisma.cita.findMany({
      where: { fecha: fechaUtc, estado: { in: ["PROGRAMADA", "CONFIRMADA"] } },
      include: { paciente: { select: { etiqueta: true, horaPreferida: true } } },
    });

    // Colas: ambulatorio = día; consulta = (día, doctor).
    const colas = new Map<string, typeof citas>();
    for (const cita of citas) {
      const clave = `${cita.servicio}|${cita.doctorId ?? ""}`;
      const cola = colas.get(clave) ?? [];
      cola.push(cita);
      colas.set(clave, cola);
    }

    let reordenados = 0;
    for (const cola of colas.values()) {
      const porEtiqueta = (a: (typeof citas)[number], b: (typeof citas)[number]) =>
        (ORDEN_ETIQUETA[a.paciente.etiqueta] ?? 9) - (ORDEN_ETIQUETA[b.paciente.etiqueta] ?? 9);
      const confirmados = cola
        .filter((c) => c.confirmadaEn !== null)
        .sort((a, b) => porEtiqueta(a, b) || a.confirmadaEn!.getTime() - b.confirmadaEn!.getTime());
      const noConfirmados = cola
        .filter((c) => c.confirmadaEn === null)
        .sort((a, b) => porEtiqueta(a, b) || (a.turno ?? 999) - (b.turno ?? 999));
      const orden = [...confirmados, ...noConfirmados];

      let sumaMin = 0;
      for (let i = 0; i < orden.length; i += 1) {
        const cita = orden[i]!;
        // Ambulatorio: el bloque inicia en la horaPreferida del paciente si está
        // libre (nunca antes del fin del anterior). Consulta: serial por doctor.
        const inicio =
          cita.servicio === "AMBULATORIO"
            ? Math.max(
                sumaMin,
                Math.max(0, horaPreferidaMin(cita.paciente.horaPreferida) - aperturaMin),
              )
            : sumaMin;
        await prisma.cita.update({
          where: { id: cita.id },
          data: { turno: i + 1, horaEstimada: minutosAHora(aperturaMin + inicio) },
        });
        sumaMin = inicio + cita.duracionMin;
        reordenados += 1;
      }
    }

    await this.deps.auditoria.registrar({
      accion: "CIERRE_TURNOS",
      entidad: "DIA",
      entidadId: iso,
      actorId: "SISTEMA",
      actorRol: null,
      detalle: { fecha: iso, reordenados },
    });
    logger.info({ fecha: iso, reordenados }, "cierre-turnos: cola reordenada");
    return { fecha: iso, reordenados };
  }

  /**
   * Cierre del día: PROGRAMADA/CONFIRMADA de hoy → NO_LLEGO (downstream);
   * EN_ATENCION → ASISTIDA; camillas abiertas → LIBRE cerrando eventos.
   */
  async cierreDia(): Promise<{ noLlegos: number; atendidas: number; camillas: number }> {
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const hoyUtc = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

    const pendientes = await prisma.cita.findMany({
      where: { fecha: hoyUtc, estado: { in: ["PROGRAMADA", "CONFIRMADA"] } },
      select: { id: true },
    });
    for (const cita of pendientes) {
      await this.deps.registrarNoLlego(cita.id);
    }

    const enAtencion = await prisma.cita.findMany({
      where: { fecha: hoyUtc, estado: "EN_ATENCION" },
      select: { id: true },
    });
    for (const cita of enAtencion) {
      await prisma.cita.update({
        where: { id: cita.id },
        data: { estado: "ASISTIDA", asistidaEn: ahora },
      });
    }

    const camillasAbiertas = await prisma.camillaDia.findMany({
      where: { fecha: hoyUtc, estado: { not: "LIBRE" } },
      select: { id: true },
    });
    for (const camilla of camillasAbiertas) {
      const abierto = await prisma.camillaEvento.findFirst({
        where: { camillaDiaId: camilla.id, fin: null },
        orderBy: { inicio: "desc" },
        select: { id: true, inicio: true },
      });
      if (abierto) {
        await prisma.camillaEvento.update({
          where: { id: abierto.id },
          data: { fin: ahora, duracionMin: Math.max(0, Math.round((ahora.getTime() - abierto.inicio.getTime()) / 60_000)) },
        });
      }
      await prisma.camillaDia.update({
        where: { id: camilla.id },
        data: { estado: "LIBRE", citaId: null, estadoDesde: ahora },
      });
    }

    if (pendientes.length + enAtencion.length + camillasAbiertas.length > 0) {
      logger.info(
        { noLlegos: pendientes.length, atendidas: enAtencion.length, camillas: camillasAbiertas.length },
        "cierre-dia: día cerrado",
      );
    }
    return {
      noLlegos: pendientes.length,
      atendidas: enAtencion.length,
      camillas: camillasAbiertas.length,
    };
  }
}
