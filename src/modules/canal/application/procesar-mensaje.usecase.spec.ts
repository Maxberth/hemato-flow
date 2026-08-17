import { describe, expect, test } from "bun:test";
import type { CausaCatalogo, Paciente } from "@prisma/client";
import { CifradoReversiblePort } from "../../../infrastructure/cifrado/cifrado.port";
import { ConfiguracionService } from "../../configuracion/application/configuracion.service";
import {
  ConfiguracionRepository,
  type ConfiguracionItem,
} from "../../configuracion/domain/configuracion.repository";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import { TareaSocialRepository } from "../../trabajo-social/domain/tarea-social.repository";
import { CausaInasistenciaRepository } from "../../trabajo-social/domain/causa-inasistencia.repository";
import { PacienteRepository, type PacienteListado } from "../../pacientes/domain/paciente.repository";
import { CitaRepository, type CitaListado } from "../../citas/domain/cita.repository";
import { CanalSalidaPort } from "../domain/canal-salida.port";
import {
  ClasificadorIntencionPort,
  type Intencion,
} from "../domain/clasificador-intencion.port";
import { ClasificadorCausaPort } from "../domain/clasificador-causa.port";
import { ProcesarMensajeUseCase } from "./procesar-mensaje.usecase";
import type { TwilioWebhookParsed } from "../dto/twilio-webhook.dto";

// ── Fakes ──────────────────────────────────────────────

class CifradoFake extends CifradoReversiblePort {
  hashNumero(n: string) {
    return `hash-${n}`;
  }
  cifrarNumero(n: string) {
    return `cif-${n}`;
  }
  descifrarNumero(c: string) {
    return c.replace(/^cif-/, "");
  }
}

class CanalFake extends CanalSalidaPort {
  enviados: Array<{ to: string; body: string }> = [];
  pedidosContacto: Array<{ to: string; body: string }> = [];
  async enviarMensaje(to: string, body: string): Promise<{ sid: string }> {
    this.enviados.push({ to, body });
    return { sid: "SM-fake" };
  }
  async pedirContacto(to: string, body: string): Promise<{ sid: string }> {
    this.pedidosContacto.push({ to, body });
    return { sid: "SM-fake" };
  }
}

class IntencionFake extends ClasificadorIntencionPort {
  constructor(private readonly resultado: Intencion) {
    super();
  }
  async clasificar(): Promise<Intencion> {
    return this.resultado;
  }
}

class CausaFake extends ClasificadorCausaPort {
  constructor(private readonly resultado: CausaCatalogo) {
    super();
  }
  async clasificar(): Promise<CausaCatalogo> {
    return this.resultado;
  }
}

class PacienteRepoFake extends PacienteRepository {
  paciente: Paciente | null;
  /** Ficha que se encuentra al compartir el celular ("+519…") con el bot. */
  porCelular: Paciente | null;
  actualizaciones: Array<{ id: string; datos: Record<string, unknown> }> = [];
  constructor(paciente: Paciente | null, porCelular: Paciente | null = null) {
    super();
    this.paciente = paciente;
    this.porCelular = porCelular;
  }
  async crear(d: never) {
    return d;
  }
  async buscarPorHash(hash: string) {
    if (!this.paciente && this.porCelular && hash.includes("hash-+519")) {
      return this.porCelular;
    }
    return this.paciente;
  }
  async buscarPorTelegramChat() {
    return null;
  }
  async buscarPorId() {
    return this.paciente;
  }
  async listar() {
    return {
      items: [] as never[],
      total: 0,
      pagina: 1,
      limite: 50,
      resumen: { rojas: 0, amarillas: 0, verdes: 0, distantes: 0 },
    };
  }
  async actualizar(id: string, datos: Record<string, unknown>) {
    this.actualizaciones.push({ id, datos });
    return { id, ...datos } as Paciente;
  }
  async asignarResponsable() {}
  async quitarResponsable() {}
}

class CitaRepoFake extends CitaRepository {
  citas: CitaListado[] = [];
  confirmadas: string[] = [];
  canceladas: Array<{ id: string; motivo: string | null }> = [];
  noLlegoPendiente: { id: string; fecha: Date; horaEstimada: string | null } | null = null;

  async listar() {
    return this.citas;
  }
  async listarPaginado() {
    return { items: this.citas, total: this.citas.length, pagina: 1, limite: 50 };
  }
  async buscarPorId() {
    return null;
  }
  async buscarConPaciente() {
    return null;
  }
  async marcarNoLlego(id: string) {
    return { id } as never;
  }
  async marcarEnAtencion(id: string) {
    return { id } as never;
  }
  async marcarAtendida(id: string) {
    return { id } as never;
  }
  async registrarLlegada(id: string) {
    return { id } as never;
  }
  async cancelar(id: string, motivo?: string) {
    this.canceladas.push({ id, motivo: motivo ?? null });
    return { id } as never;
  }
  async confirmar(id: string) {
    this.confirmadas.push(id);
    return { id } as never;
  }
  async buscarNoLlegoConCausaPendiente() {
    return this.noLlegoPendiente;
  }
  async citasPendientesDoctor() {
    return [];
  }
}

class TareasFake extends TareaSocialRepository {
  creadas: Array<{ pacienteId: string; citaId: string | null; tipo: string; resultado?: string | null }> = [];
  pendientePorCita: { id: string; resultado: string | null } | null = null;
  resultados: Array<{ id: string; resultado: string }> = [];
  resueltas: Array<{ id: string; resultado: string }> = [];
  async crear(t: { pacienteId: string; citaId?: string | null; tipo: string; resultado?: string | null }) {
    this.creadas.push({ pacienteId: t.pacienteId, citaId: t.citaId ?? null, tipo: t.tipo, resultado: t.resultado ?? null });
    return { id: "t1" } as never;
  }
  async listar() {
    return {
      items: [] as never[],
      total: 0,
      pagina: 1,
      limite: 50,
      resumen: { pendientes: 0, enProceso: 0, resueltas: 0, vencidas: 0, total: 0 },
    };
  }
  async buscarPorId() {
    return null;
  }
  async tomar() {
    return {} as never;
  }
  async resolver(id: string, resultado: string) {
    this.resueltas.push({ id, resultado });
    return { id, resultado } as never;
  }
  async existePendienteParaCita() {
    return false;
  }
  async buscarPendientePorCita() {
    return this.pendientePorCita as never;
  }
  async marcarResultado(id: string, resultado: string) {
    this.resultados.push({ id, resultado });
    return { id, resultado } as never;
  }
}

class CausasFake extends CausaInasistenciaRepository {
  registradas: Array<{ citaId: string; causa: string }> = [];
  async registrar(citaId: string, causa: CausaCatalogo) {
    this.registradas.push({ citaId, causa });
  }
  async existeParaCita() {
    return false;
  }
}

class AuditoriaFake extends AuditoriaRepository {
  registros: Array<{ accion: string; entidadId?: string }> = [];
  async registrar(r: { accion: string; entidadId?: string }) {
    this.registros.push(r);
  }
  async listar() {
    return [];
  }
}

class ConfigFake extends ConfiguracionRepository {
  async obtenerTodas() {
    return [];
  }
  async obtener(clave: string) {
    const items: ConfiguracionItem[] = [
      { clave: "trabajo_social", valor: { horasPreviasCita: 48, slaHoras: 24 } },
    ];
    return items.find((i) => i.clave === clave) ?? null;
  }
  async actualizar(clave: string, valor: unknown) {
    return { clave, valor } as ConfiguracionItem;
  }
}

function webhook(body: string): TwilioWebhookParsed {
  return {
    messageSid: `SM-${Math.random().toString(36).slice(2)}`,
    from: "+51999000111",
    to: "whatsapp:+14155238886",
    body,
    numMedia: 0,
  };
}

function paciente(): Paciente {
  return {
    id: "pac-1",
    numeroHash: "hash-+51999000111",
    numeroCifrado: "cif-+51999000111",
    telegramChatId: null,
    horaPreferida: null,
    nombres: "Juan Pérez",
    etiqueta: "ROJA",
    banda: "DISTANTE",
    fechaObjetivo: new Date(2026, 8, 1),
    canal: "WHATSAPP",
    tipoProcedimientoId: "tp-1",
    frecuenciaDias: 30,
    hospitalizado: false,
    activo: true,
    servicio: "CONSULTA",
    creadoEn: new Date(),
    updatedAt: new Date(),
  };
}

function cita(estado: CitaListado["estado"]): CitaListado {
  return {
    id: "cita-1",
    pacienteId: "pac-1",
    loteId: "lote-1",
    fecha: new Date(2026, 7, 17),
    servicio: "CONSULTA",
    doctorId: "doc-1",
    turno: 2,
    horaEstimada: "08:00",
    duracionMin: 20,
    tipoProcedimientoId: "tp-1",
    estado,
    origen: "INICIAL",
    citaPreviaId: null,
    llegadaEn: null,
    confirmadaEn: null,
    asistidaEn: null,
    motivoCancelacion: null,
    justificacion: null,
    creadoEn: new Date(),
    updatedAt: new Date(),
    paciente: { id: "pac-1", nombres: "Juan Pérez", etiqueta: "ROJA", banda: "DISTANTE", canal: "WHATSAPP" },
    tipoProcedimiento: { id: "tp-1", nombre: "CONTROL", duracionMin: 20 },
    lote: { id: "lote-1", estado: "APROBADO" },
    doctor: { nombre: "Dr. Ana Torres" },
    causaInasistencia: null,
  };
}

function crearUsecase(opts: {
  paciente?: Paciente | null;
  porCelular?: Paciente | null;
  citas?: CitaListado[];
  intencion?: Intencion;
  causa?: CausaCatalogo;
  noLlegoPendiente?: { id: string; fecha: Date; horaEstimada: string | null } | null;
  tareaNegacion?: { id: string; resultado: string | null } | null;
}) {
  const canal = new CanalFake();
  const repoPaciente = new PacienteRepoFake(opts.paciente ?? null, opts.porCelular ?? null);
  const citasRepo = new CitaRepoFake();
  citasRepo.citas = opts.citas ?? [];
  citasRepo.noLlegoPendiente = opts.noLlegoPendiente ?? null;
  const tareas = new TareasFake();
  tareas.pendientePorCita = opts.tareaNegacion ?? null;
  const causas = new CausasFake();
  const auditoria = new AuditoriaFake();

  const usecase = new ProcesarMensajeUseCase(
    new CifradoFake(),
    repoPaciente,
    citasRepo,
    canal,
    new IntencionFake(opts.intencion ?? "OTRA"),
    new CausaFake(opts.causa ?? "OTRO"),
    causas,
    tareas,
    new ConfiguracionService(new ConfigFake()),
    auditoria,
  );

  return { usecase, canal, citasRepo, tareas, causas, auditoria, repoPaciente };
}

describe("ProcesarMensajeUseCase", () => {
  test("número no registrado → NO_REGISTRADO", async () => {
    const { usecase, canal } = crearUsecase({ paciente: null });
    const res = await usecase.ejecutar(webhook("hola"));
    expect(res.estado).toBe("NO_REGISTRADO");
    expect(canal.enviados[0]?.body).toContain("No encontramos tu registro");
  });

  test("CONFIRMAR con cita PROGRAMADA → CONFIRMADA + confirmación con fecha/hora", async () => {
    const { usecase, canal, citasRepo, auditoria } = crearUsecase({
      paciente: paciente(),
      citas: [cita("PROGRAMADA")],
      intencion: "CONFIRMAR",
    });
    const res = await usecase.ejecutar(webhook("sí"));
    expect(res.estado).toBe("CONFIRMADA");
    expect(citasRepo.confirmadas).toEqual(["cita-1"]);
    expect(canal.enviados[0]?.body).toContain("17/08/2026 a las 08:00");
    expect(canal.enviados[0]?.body).toContain("quedó confirmada");
    expect(auditoria.registros.some((r) => r.accion === "CONFIRMAR_CITA")).toBe(true);
  });

  test("CONFIRMAR con cita ya CONFIRMADA → idempotente (no re-confirma)", async () => {
    const { usecase, citasRepo } = crearUsecase({
      paciente: paciente(),
      citas: [cita("CONFIRMADA")],
      intencion: "CONFIRMAR",
    });
    const res = await usecase.ejecutar(webhook("si"));
    expect(res.estado).toBe("CONFIRMADA");
    expect(citasRepo.confirmadas).toEqual([]);
  });

  test("NEGAR con cita activa → tarea SILENCIO + pregunta el motivo", async () => {
    const { usecase, canal, tareas } = crearUsecase({
      paciente: paciente(),
      citas: [cita("PROGRAMADA")],
      intencion: "NEGAR",
    });
    const res = await usecase.ejecutar(webhook("no puedo ir"));
    expect(res.estado).toBe("NEGADA");
    expect(canal.enviados[0]?.body).toContain("¿Cuál es el motivo");
    expect(tareas.creadas).toEqual([
      { pacienteId: "pac-1", citaId: "cita-1", tipo: "SILENCIO", resultado: "NEGACION" },
    ]);
  });

  test("negación: el paciente responde el motivo → causa registrada + oferta de reprogramación", async () => {
    const { usecase, canal, causas, tareas, auditoria } = crearUsecase({
      paciente: paciente(),
      citas: [cita("PROGRAMADA")],
      causa: "ECONOMICO",
      tareaNegacion: { id: "t1", resultado: "NEGACION" },
    });
    const res = await usecase.ejecutar(webhook("no tengo para el pasaje"));
    expect(res.estado).toBe("MOTIVO_NEGACION");
    expect(causas.registradas).toEqual([{ citaId: "cita-1", causa: "ECONOMICO" }]);
    expect(tareas.resultados).toEqual([
      { id: "t1", resultado: expect.stringContaining("ECONOMICO") },
    ]);
    expect(canal.enviados[0]?.body).toContain("¿Deseas reprogramar tu cita?");
    expect(auditoria.registros.some((r) => r.accion === "REGISTRAR_MOTIVO_NEGACION")).toBe(true);
  });

  test("negación: SÍ a reprogramar → cita cancelada + aviso de reprogramación", async () => {
    const { usecase, canal, citasRepo, tareas } = crearUsecase({
      paciente: paciente(),
      citas: [cita("PROGRAMADA")],
      intencion: "CONFIRMAR",
      tareaNegacion: { id: "t1", resultado: "NEGACION · ECONOMICO · no tengo para el pasaje" },
    });
    const res = await usecase.ejecutar(webhook("SÍ"));
    expect(res.estado).toBe("REPROGRAMADA");
    expect(citasRepo.canceladas).toEqual([{ id: "cita-1", motivo: "NEGACION_PACIENTE" }]);
    expect(citasRepo.confirmadas).toEqual([]); // no confirma la cita negada
    expect(tareas.resueltas).toEqual([{ id: "t1", resultado: "REPROGRAMADA" }]);
    expect(canal.enviados[0]?.body).toContain("reprogramada según tu prioridad");
  });

  test("negación: NO a reprogramar → Trabajo Social contactará al paciente", async () => {
    const { usecase, canal, citasRepo } = crearUsecase({
      paciente: paciente(),
      citas: [cita("PROGRAMADA")],
      intencion: "NEGAR",
      tareaNegacion: { id: "t1", resultado: "NEGACION · ECONOMICO · no tengo para el pasaje" },
    });
    const res = await usecase.ejecutar(webhook("NO"));
    expect(res.estado).toBe("CONTACTO_SOCIAL");
    expect(citasRepo.canceladas).toEqual([]); // no se cancela
    expect(canal.enviados[0]?.body).toContain("Un miembro del equipo te contactará");
  });

  test("CONSULTAR → próxima cita con fecha/hora y estado", async () => {
    const { usecase, canal } = crearUsecase({
      paciente: paciente(),
      citas: [cita("PROGRAMADA")],
      intencion: "CONSULTAR",
    });
    const res = await usecase.ejecutar(webhook("¿cuándo es mi cita?"));
    expect(res.estado).toBe("CONSULTADA");
    expect(canal.enviados[0]?.body).toContain("17/08/2026 a las 08:00");
    expect(canal.enviados[0]?.body).toContain("Está por confirmar");
  });

  test("CONSULTAR con cita CONFIRMADA → 'Está confirmada'", async () => {
    const { usecase, canal } = crearUsecase({
      paciente: paciente(),
      citas: [cita("CONFIRMADA")],
      intencion: "CONSULTAR",
    });
    await usecase.ejecutar(webhook("mi cita"));
    expect(canal.enviados[0]?.body).toContain("Está confirmada ✅");
  });

  test("sin cita activa → SIN_CITA", async () => {
    const { usecase, canal } = crearUsecase({
      paciente: paciente(),
      citas: [],
      intencion: "CONSULTAR",
    });
    const res = await usecase.ejecutar(webhook("mi cita"));
    expect(res.estado).toBe("SIN_CITA");
    expect(canal.enviados[0]?.body).toContain("Aún no tienes una cita programada");
  });

  test("causa pendiente (NO_LLEGO) → clasifica motivo, registra y responde MOTIVO_OK", async () => {
    const { usecase, canal, causas, auditoria } = crearUsecase({
      paciente: paciente(),
      causa: "TRANSPORTE",
      noLlegoPendiente: { id: "cita-1", fecha: new Date(2026, 7, 10), horaEstimada: "09:00" },
    });
    const res = await usecase.ejecutar(webhook("no tuve pasaje para llegar"));
    expect(res.estado).toBe("MOTIVO_REGISTRADO");
    expect(causas.registradas).toEqual([{ citaId: "cita-1", causa: "TRANSPORTE" }]);
    expect(auditoria.registros.some((r) => r.accion === "REGISTRAR_CAUSA")).toBe(true);
    expect(canal.enviados[0]?.body).toContain("Registramos el motivo");
  });

  test("intención OTRA → FALLBACK", async () => {
    const { usecase, canal } = crearUsecase({
      paciente: paciente(),
      citas: [cita("PROGRAMADA")],
      intencion: "OTRA",
    });
    const res = await usecase.ejecutar(webhook("gracias"));
    expect(res.estado).toBe("FALLBACK");
    expect(canal.enviados[0]?.body).toContain("escribe \"cita\"");
  });

  test("Telegram: paciente registrado por celular comparte su contacto → VINCULADO + chat guardado", async () => {
    const { usecase, canal, repoPaciente } = crearUsecase({
      paciente: null,
      porCelular: paciente(),
      citas: [cita("PROGRAMADA")],
    });
    const res = await usecase.ejecutar({
      messageSid: "TG-vinc-1",
      from: "tg:999888777",
      to: "tg:bot",
      body: "",
      numMedia: 0,
      contactoTelefono: "+51987654321",
    });
    expect(res.estado).toBe("CONSULTADA");
    expect(repoPaciente.actualizaciones).toEqual([
      { id: "pac-1", datos: { telegramChatId: "999888777", canal: "TELEGRAM" } },
    ]);
    expect(canal.enviados[0]?.body).toContain("Número vinculado");
    // Tras vincular responde con la cita pendiente (intención forzada a CONSULTAR).
    expect(canal.enviados[1]?.body).toContain("17/08/2026 a las 08:00");
  });

  test("Telegram: chat desconocido sin contacto → pide compartir el celular", async () => {
    const { usecase, canal } = crearUsecase({ paciente: null });
    const res = await usecase.ejecutar({
      messageSid: "TG-nuevo-1",
      from: "tg:555666777",
      to: "tg:bot",
      body: "hola",
      numMedia: 0,
    });
    expect(res.estado).toBe("NO_REGISTRADO");
    expect(canal.pedidosContacto).toHaveLength(1);
    expect(canal.pedidosContacto[0]?.to).toBe("tg:555666777");
    expect(canal.pedidosContacto[0]?.body).toContain("comparte tu número de celular");
    expect(canal.enviados).toHaveLength(0); // no responde "no encontrado"
  });
});
