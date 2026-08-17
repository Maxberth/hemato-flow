/**
 * Simulador E2E de HematoFlow (turnos + camillas).
 * Requiere la API corriendo (bun run dev) y la BD sembrada.
 *   bun run sim
 *
 * Flujo: cupos/horarios → cohorte → lote por turnos → aprobación → avisos con
 * turno → confirmación por webhook → cierre-turnos (confirmado primero) →
 * abrir día → camillas (esperado EN_ATENCION → retirar ASISTIDA) → walk-in →
 * NO_LLEGO automático del esperado → causa por webhook → recurrencia y
 * trabajo social. Aísla el lote: solo los pacientes del sim quedan pendientes.
 */
import { di } from "../src/config/di";
import { prisma } from "../src/infrastructure/prisma/prisma.service";
import { sumarDias } from "../src/common/hora";

const API = process.env.API_BASE_URL ?? "http://localhost:3100";

const TEL = {
  maria: "+51900000101", // AMBULATORIO ROJA (esperada turno 1)
  juan: "+51900000102", // AMBULATORIO AMARILLA (confirmada; esperada tras atender)
  carlos: "+51900000103", // CONSULTA
} as const;

let asserts = 0;
let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    asserts += 1;
    console.log(`  ✅ ${msg}`);
  } else {
    fallos += 1;
    console.error(`  ❌ ${msg}`);
  }
}

function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fechaUtcDe(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiJson<T>(
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  ruta: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const resp = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await resp.json().catch(() => null)) as { success?: boolean; data?: T } | null;
  if (!resp.ok || !json?.success) {
    throw new Error(`API ${metodo} ${ruta} → ${resp.status}`);
  }
  return json.data as T;
}

/** Firma X-Twilio-Signature (mismo algoritmo que twilio-signature.ts). */
// Base por timestamp: evita que sids (TG-<update_id>) colisionen con corridas
// anteriores y el dedup por idempotencia descarte los webhooks del sim.
let updateSeq = Math.floor(Date.now() / 1000);

/**
 * Envía un update de Telegram al bot (long polling del server los consume).
 * Si `contactoTelefono` va presente, es un mensaje de "Compartir número" →
 * vincula el chat con el paciente registrado con ese celular (flujo real).
 */
async function enviarWebhookTg(from: string, body: string, contactoTelefono?: string): Promise<number> {
  const url = `${API}/webhooks/telegram`;
  const chatId = from.replace(/^tg:/, "");
  const numId = Number(chatId) || chatId;
  const update = {
    update_id: ++updateSeq,
    message: {
      message_id: updateSeq + 100_000,
      chat: { id: numId },
      from: { id: numId },
      text: body || undefined,
      ...(contactoTelefono
        ? { contact: { phone_number: contactoTelefono, user_id: numId } }
        : {}),
    },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  return resp.status;
}

async function limpiarSim(): Promise<void> {
  const hashes = Object.values(TEL).map((t) => di.cifrado.hashNumero(t));
  const pacientes = await prisma.paciente.findMany({
    where: { numeroHash: { in: hashes } },
    select: { id: true },
  });
  const ids = pacientes.map((p) => p.id);

  await prisma.cita.deleteMany({ where: { lote: { estado: "ABIERTO" } } });
  await prisma.lotePlanificacion.deleteMany({ where: { estado: "ABIERTO" } });

  if (ids.length === 0) return;

  await prisma.$transaction([
    prisma.mensaje.deleteMany({ where: { pacienteId: { in: ids } } }),
    prisma.causaInasistencia.deleteMany({ where: { cita: { pacienteId: { in: ids } } } }),
    prisma.tareaSocial.deleteMany({ where: { pacienteId: { in: ids } } }),
    prisma.aviso.deleteMany({ where: { cita: { pacienteId: { in: ids } } } }),
    prisma.cita.deleteMany({ where: { pacienteId: { in: ids } } }),
    prisma.pacienteProfesional.deleteMany({ where: { pacienteId: { in: ids } } }),
    prisma.camillaEvento.deleteMany({ where: { pacienteId: { in: ids } } }),
    prisma.paciente.deleteMany({ where: { id: { in: ids } } }),
    prisma.webhookEvent.deleteMany({ where: { fromHash: { in: hashes } } }),
  ]);
}

interface PropuestaLote {
  id: string;
  nombres: string;
  servicio: string;
  doctor: string | null;
  turno: number | null;
  horaEstimada: string | null;
  duracionMin: number;
  fecha: string;
  origen: string;
}

async function main(): Promise<void> {
  console.log("🧪 Simulador HematoFlow (turnos + camillas)");
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia1 = sumarDias(hoy, 1);
  const dia2 = sumarDias(hoy, 2);
  const fechaObj = fechaISO(sumarDias(hoy, 30));

  // ── Fase 1: login + limpieza + aislamiento + cohorte ──
  console.log("\n— Fase 1: login, cupos, cohorte —");
  const login = await apiJson<{ token: string }>("POST", "/api/auth/login", {
    username: "medico",
    password: process.env.MEDICO_PASSWORD ?? "medico-2026",
  });
  const token = login.token;
  assert(!!token, "login médico OK");

  const loginEnf = await apiJson<{ token: string }>("POST", "/api/auth/login", {
    username: "enfermero",
    password: process.env.ENFERMERO_PASSWORD ?? "enfermero-2026",
  });
  const tokenEnfermero = loginEnf.token;
  assert(!!tokenEnfermero, "login enfermero OK");

  await limpiarSim();

  // Aislamiento del lote: solo los pacientes del sim quedan pendientes.
  const hospitalizadosPrevios = await prisma.paciente.findMany({
    where: { hospitalizado: true },
    select: { id: true },
  });
  const idsHospitalizadosPrevios = new Set(hospitalizadosPrevios.map((p) => p.id));
  await prisma.paciente.updateMany({
    where: { hospitalizado: false },
    data: { hospitalizado: true },
  });

  // Walk-in (sin cita): hospitalizado para que el motor NO lo incluya en el lote.
  const telWalkIn = "+51900000999";
  await prisma.paciente.upsert({
    where: { numeroHash: di.cifrado.hashNumero(telWalkIn) },
    update: {},
    create: {
      numeroHash: di.cifrado.hashNumero(telWalkIn),
      numeroCifrado: di.cifrado.cifrarNumero(telWalkIn),
      nombres: "Diego Walkin Sim",
      etiqueta: "VERDE",
      banda: "CERCANA",
      fechaObjetivo: new Date(`${fechaObj}T00:00:00`),
      canal: "WHATSAPP",
      tipoProcedimientoId: (await prisma.tipoProcedimiento.findFirst({ where: { nombre: "CONTROL" } }))!.id,
      servicio: "AMBULATORIO",
      hospitalizado: true,
    },
  });

  // Cupos ambulatorios (2 días, cantidad 4, 1 camilla) + horario médico.
  for (const dia of [dia1, dia2]) {
    await apiJson("PUT", "/api/cupos", {
      fecha: fechaISO(dia),
      cantidad: 4,
      camillas: 1,
    }, token);
  }
  const cupoHoy = await apiJson<{ cantidad: number }>("PUT", "/api/cupos", {
    fecha: fechaISO(hoy),
    cantidad: 4,
    camillas: 1,
  }, token);
  assert(cupoHoy.cantidad === 4, "cupo de hoy creado (4 posiciones, 1 camilla)");

  const profesionales = await apiJson<{ items: Array<{ id: string; nombre: string }> }>(
    "GET",
    "/api/profesionales",
    undefined,
    token,
  );
  const doctor = profesionales.items[0]!;
  for (const dia of [dia1, dia2]) {
    await apiJson("PUT", `/api/horario-medico/${doctor.id}/${fechaISO(dia)}`, { cupo: 8 }, token);
  }
  assert(!!doctor.id, `horario médico configurado (${doctor.nombre})`);

  // Tipo 45 min para el ambulatorio del sim (turno 1 = 08:00, turno 2 = 08:45).
  let tipoAmb = await prisma.tipoProcedimiento.findFirst({ where: { nombre: "SIM_AMBULATORIO" } });
  if (!tipoAmb) {
    tipoAmb = await prisma.tipoProcedimiento.create({ data: { nombre: "SIM_AMBULATORIO", duracionMin: 45 } });
  }
  const control = (await prisma.tipoProcedimiento.findFirst({ where: { nombre: "CONTROL" } }))!;

  const importado = await apiJson<{ importados: number; duplicados: number }>(
    "POST",
    "/api/pacientes/importar",
    {
      pacientes: [
        { nombres: "María Sim", telefono: TEL.maria, etiqueta: "ROJA", banda: "CERCANA", fechaObjetivo: fechaObj, tipoProcedimientoId: tipoAmb.id, frecuenciaDias: 15, servicio: "AMBULATORIO" },
        { nombres: "Juan Sim", telefono: TEL.juan, etiqueta: "AMARILLA", banda: "CERCANA", fechaObjetivo: fechaObj, tipoProcedimientoId: tipoAmb.id, frecuenciaDias: 30, servicio: "AMBULATORIO" },
        { nombres: "Carlos Sim", telefono: TEL.carlos, etiqueta: "VERDE", banda: "CERCANA", fechaObjetivo: fechaObj, tipoProcedimientoId: control.id, servicio: "CONSULTA" },
      ],
    },
    token,
  );
  assert(importado.importados === 3, `cohorte importada (${importado.importados})`);

  const simHashes = Object.values(TEL).map((t) => di.cifrado.hashNumero(t));
  const nombresSim = ["María Sim", "Juan Sim", "Carlos Sim"];

  // Limpieza de fechas del escenario: las citas de OTROS pacientes en hoy..hoy+3
  // son residuo de corridas previas y romperían colas y cierre-turnos.
  const fechasSim = [hoy, dia1, dia2, sumarDias(hoy, 3)].map((d) => fechaUtcDe(d));
  await prisma.cita.deleteMany({
    where: { fecha: { in: fechasSim }, paciente: { numeroHash: { notIn: simHashes } } },
  });
  await prisma.camillaDia.deleteMany({ where: { fecha: fechaUtcDe(hoy) } });

  // ── Fase 2: lote por turnos + aprobación + avisos ─────
  console.log("\n— Fase 2: lote por turnos y avisos —");
  // La consulta quincenal (periodoDias=14) haría pendientes a los pacientes demo
  // que ya tienen cita activa → el lote dejaría de ser hermético. Se neutraliza
  // para esta fase (la regla se cubre con unit tests) y se restaura tras aprobar.
  const configConsultas = await prisma.configuracion.findUnique({ where: { clave: "consultas" } });
  const valorConsultas = (configConsultas?.valor ?? {}) as Record<string, unknown>;
  await prisma.configuracion.update({
    where: { clave: "consultas" },
    data: { valor: { ...valorConsultas, periodoDias: 9999 } },
  });
  // Misma razón: el demo tiene CERCANA.horasAvanceAviso = 0 (lote del mismo día),
  // lo que anula la escalera de recordatorios. Temporalmente se restaura 24h
  // para validar la cascada de avisos y se devuelve tras la fase.
  const configBandas = await prisma.configuracion.findUnique({ where: { clave: "bandas" } });
  const valorBandas = (configBandas?.valor ?? {}) as Record<string, { horasAvanceAviso: number }>;
  await prisma.configuracion.update({
    where: { clave: "bandas" },
    data: {
      valor: { ...valorBandas, CERCANA: { horasAvanceAviso: 24 } },
    },
  });

  const generado = await apiJson<{ loteId: string; propuestas: number; sinCupo: string[] }>(
    "POST",
    "/api/planificacion/lotes",
    undefined,
    token,
  );
  assert(generado.propuestas === 3, `lote generado con 3 propuestas (${generado.propuestas})`);

  const loteDetalle = await apiJson<{ horasApertura: string; propuestas: PropuestaLote[] }>(
    "GET",
    `/api/planificacion/lotes/${generado.loteId}`,
    undefined,
    token,
  );
  assert(loteDetalle.horasApertura === "08:00", "horasApertura 08:00 en el detalle del lote");

  const propuestasSim = loteDetalle.propuestas.filter((p) => nombresSim.includes(p.nombres));
  assert(propuestasSim.length === 3, `3 propuestas del sim en el lote (${propuestasSim.length})`);

  const maria = propuestasSim.find((p) => p.nombres === "María Sim")!;
  const juan = propuestasSim.find((p) => p.nombres === "Juan Sim")!;
  const carlos = propuestasSim.find((p) => p.nombres === "Carlos Sim")!;
  assert(maria.servicio === "AMBULATORIO" && maria.turno === 1 && maria.horaEstimada === "08:00",
    `María AMB turno 1 = 08:00 (${maria.horaEstimada})`);
  assert(juan.servicio === "AMBULATORIO" && juan.turno === 2 && juan.horaEstimada === "08:45",
    `Juan AMB turno 2 = 08:45 (${juan.horaEstimada}) — acumula 45 min`);
  assert(carlos.servicio === "CONSULTA" && carlos.doctor !== null && carlos.turno === 1 && carlos.horaEstimada === "08:00",
    `Carlos CONSULTA con doctor (${carlos.doctor}) turno 1 = 08:00`);

  const aprobado = await apiJson<{ aprobadas: number }>(
    "POST",
    `/api/planificacion/lotes/${generado.loteId}/aprobar`,
    undefined,
    token,
  );
  assert(aprobado.aprobadas === 3, `lote aprobado (${aprobado.aprobadas} propuestas)`);
  await prisma.configuracion.update({
    where: { clave: "consultas" },
    data: { valor: { ...valorConsultas, periodoDias: 14 } },
  });
  await prisma.configuracion.update({
    where: { clave: "bandas" },
    data: { valor: valorBandas },
  });

  const citasSim = await prisma.cita.findMany({
    where: { paciente: { numeroHash: { in: simHashes } } },
    include: { paciente: true },
    orderBy: { creadoEn: "asc" },
  });
  assert(citasSim.length === 3 && citasSim.every((c) => c.estado === "PROGRAMADA"), "3 citas del sim PROGRAMADA");

  const avisosSim = await prisma.aviso.findMany({
    where: { cita: { paciente: { numeroHash: { in: simHashes } } } },
    orderBy: { programadoPara: "asc" },
  });
  assert(avisosSim.length === 6, `6 avisos del sim (${avisosSim.length})`);
  const avisoConTurno = avisosSim.find((a) => a.tipo === "AVISO_CITA");
  assert(!!avisoConTurno && /turno #\d/.test(avisoConTurno.mensaje), "aviso contiene 'turno #N'");
  assert(!!avisoConTurno && /a las \d{2}:\d{2}/.test(avisoConTurno.mensaje), "aviso contiene 'a las HH:mm'");

  // Dispatcher: se fuerza el aviso de Juan a vencido y se espera ENVIADO.
  const avisoJuan = avisosSim.find(
    (a) => a.tipo === "AVISO_CITA" && a.citaId === citasSim.find((c) => c.paciente.numeroHash === di.cifrado.hashNumero(TEL.juan))?.id,
  );
  if (avisoJuan) {
    await prisma.aviso.update({
      where: { id: avisoJuan.id },
      data: { programadoPara: new Date(Date.now() - 60_000) },
    });
  }
  console.log("  ⏳ esperando ciclo del dispatcher…");
  let juanEnviado = false;
  for (let i = 0; i < 30 && !juanEnviado; i += 1) {
    await esperar(5_000);
    const estado = await prisma.aviso.findUnique({
      where: { id: avisoJuan?.id ?? "" },
      select: { estado: true, mensaje: true, enviadoEn: true },
    });
    juanEnviado = estado?.estado === "ENVIADO";
    if (juanEnviado) {
      assert(
        /turno #\d/.test(estado?.mensaje ?? "") && /el \d{2}\/\d{2}\/\d{4} a las \d{2}:\d{2}/.test(estado?.mensaje ?? ""),
        "mensaje ENVIADO con fecha/hora y turno",
      );
      assert(!!estado?.enviadoEn, "enviadoEn registrado por el dispatcher");
    }
  }
  assert(juanEnviado, "aviso de Juan ENVIADO por el dispatcher");

  // ── Fase 3: confirmación por webhook ───────────────────
  console.log("\n— Fase 3: bot confirma por Telegram (vincular chat → SÍ) —");
  // El chat del paciente se vincula compartiendo su celular con el bot.
  const statusVincular = await enviarWebhookTg("tg:700102", "", TEL.juan);
  assert(statusVincular === 200, `webhook vincular aceptado (HTTP ${statusVincular})`);
  await esperar(1_000);
  const status = await enviarWebhookTg("tg:700102", "SÍ");
  assert(status === 200, `webhook SÍ aceptado (HTTP ${status})`);

  await esperar(1_500);
  const citaJuan = citasSim.find((c) => c.paciente.numeroHash === di.cifrado.hashNumero(TEL.juan))!;
  const citaJuanDb = await prisma.cita.findUnique({ where: { id: citaJuan.id } });
  assert(citaJuanDb?.estado === "CONFIRMADA", "cita de Juan CONFIRMADA por el bot");
  assert(!!citaJuanDb?.confirmadaEn, "confirmadaEn registrado");

  const mensajes = await prisma.mensaje.count({
    where: { paciente: { numeroHash: di.cifrado.hashNumero(TEL.juan) } },
  });
  assert(mensajes >= 1, "conversación auditada en Mensaje");

  // ── Fase 4: cierre-turnos (confirmado primero) ─────────
  console.log("\n— Fase 4: cierre-turnos reordena la cola —");
  const cierreFecha = sumarDias(hoy, 3);
  const cierreUtc = fechaUtcDe(cierreFecha);
  await prisma.cita.updateMany({
    where: { id: { in: citasSim.map((c) => c.id) } },
    data: { fecha: cierreUtc },
  });
  const cierre = await di.cronHematoflow!.cierreTurnos();
  assert(cierre.fecha === fechaISO(cierreFecha), `cierre-turnos corrió para ${cierre.fecha}`);

  const colaCierre = await prisma.cita.findMany({
    where: { fecha: cierreUtc, servicio: "AMBULATORIO", paciente: { numeroHash: { in: simHashes } } },
    orderBy: { turno: "asc" },
  });
  assert(colaCierre[0]?.estado === "CONFIRMADA" && colaCierre[0]?.turno === 1,
    "confirmado (Juan) queda en turno 1");
  assert(colaCierre[1]?.estado === "PROGRAMADA" && colaCierre[1]?.turno === 2,
    "no confirmado (María, ROJA) va al final: turno 2");
  assert(colaCierre[0]?.horaEstimada === "08:00" && colaCierre[1]?.horaEstimada === "08:45",
    "horaEstimada recomputada tras el cierre (08:00 / 08:45)");

  const auditCierre = await prisma.auditoria.count({ where: { accion: "CIERRE_TURNOS" } });
  assert(auditCierre >= 1, "auditoría CIERRE_TURNOS registrada");

  // ── Fase 5: día de atención ambulatorio (camillas) ─────
  console.log("\n— Fase 5: camillas, EN_ATENCION, NO_LLEGO automático —");
  const hoyUtc = fechaUtcDe(hoy);
  // Objetivo arbitrario: la recurrencia debe AVANZARLO (fecha de la cita + 30)
  // al atender; antes el assert era vacío porque coincidía por casualidad.
  await prisma.paciente.update({
    where: { numeroHash: di.cifrado.hashNumero(TEL.juan) },
    data: { fechaObjetivo: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 10) },
  });
  await prisma.cita.updateMany({
    where: { id: { in: citasSim.map((c) => c.id) }, servicio: "AMBULATORIO" },
    data: { fecha: hoyUtc },
  });

  const abierto = await apiJson<{ camillas: number }>("POST", "/api/ambulatorio/dia/abrir", { fecha: fechaISO(hoy) }, tokenEnfermero);
  assert(abierto.camillas === 1, `día abierto: 1 camilla (${abierto.camillas})`);

  const diaAmb = await apiJson<{ camillas: Array<{ id: string; estado: string }>; citas: Array<{ id: string; nombres: string; turno: number; estado: string }> }>(
    "GET",
    `/api/ambulatorio/dia?fecha=${fechaISO(hoy)}`,
    undefined,
    tokenEnfermero,
  );
  const camilla = diaAmb.camillas[0]!;
  assert(camilla.estado === "LIBRE", "camilla inicial LIBRE");
  const citaMariaHoy = diaAmb.citas.find((c) => c.nombres === "María Sim")!;
  const citaJuanHoy = diaAmb.citas.find((c) => c.nombres === "Juan Sim")!;
  assert(citaJuanHoy.turno === 1 && citaMariaHoy.turno === 2, "cola del día: Juan turno 1 (confirmado), María turno 2");

  // Ocupar con el esperado (Juan, turno 1) → EN_ATENCION sin NO_LLEGO.
  const ocupar1 = await apiJson<{ citaId: string; noLlegos: string[] }>(
    "POST",
    `/api/ambulatorio/camillas/${camilla.id}/ocupar`,
    { citaId: citaJuanHoy.id },
    tokenEnfermero,
  );
  assert(ocupar1.noLlegos.length === 0, "ocupar con el esperado → sin NO_LLEGO");
  const juanAtencion = await prisma.cita.findUnique({ where: { id: citaJuanHoy.id } });
  assert(juanAtencion?.estado === "EN_ATENCION", "Juan EN_ATENCION en camilla");

  // Retirar → ASISTIDA; camilla PREPARACION → listo → LIBRE.
  await apiJson("POST", `/api/ambulatorio/camillas/${camilla.id}/retirar`, undefined, tokenEnfermero);
  const juanAsistida = await prisma.cita.findUnique({ where: { id: citaJuanHoy.id } });
  assert(juanAsistida?.estado === "ASISTIDA" && !!juanAsistida.asistidaEn, "retirar → Juan ASISTIDA con asistidaEn");
  await apiJson("POST", `/api/ambulatorio/camillas/${camilla.id}/listo`, undefined, tokenEnfermero);
  const camillaLibre = await apiJson<{ camillas: Array<{ id: string; estado: string }> }>(
    "GET",
    `/api/ambulatorio/dia?fecha=${fechaISO(hoy)}`,
    undefined,
    tokenEnfermero,
  );
  assert(camillaLibre.camillas[0]?.estado === "LIBRE", "listo → camilla LIBRE");

  // Walk-in (paciente sin cita): NO_LLEGO automático del esperado (María, turno 2).
  const walkIn = await prisma.paciente.findUnique({ where: { numeroHash: di.cifrado.hashNumero(telWalkIn) } });
  const ocupar2 = await apiJson<{ noLlegos: string[] }>(
    "POST",
    `/api/ambulatorio/camillas/${camilla.id}/ocupar`,
    { pacienteId: walkIn!.id },
    tokenEnfermero,
  );
  assert(ocupar2.noLlegos.length === 1, "walk-in → NO_LLEGO automático del esperado");
  const mariaNoLlego = await prisma.cita.findUnique({ where: { id: citaMariaHoy.id } });
  assert(mariaNoLlego?.estado === "NO_LLEGO", "María marcada NO_LLEGO automáticamente");

  const avisoMotivo = await prisma.aviso.findFirst({ where: { citaId: citaMariaHoy.id, tipo: "PREGUNTA_MOTIVO" } });
  assert(!!avisoMotivo, "aviso PREGUNTA_MOTIVO creado para el NO_LLEGO");
  const tareaInasistencia = await prisma.tareaSocial.findFirst({
    where: { citaId: citaMariaHoy.id, tipo: "INASISTENCIA" },
  });
  assert(!!tareaInasistencia && tareaInasistencia.venceEn > new Date(), "tarea INASISTENCIA con vencimiento futuro");

  const auditNoLlego = await prisma.auditoria.count({ where: { accion: "MARCAR_NO_LLEGO" } });
  assert(auditNoLlego >= 1, "auditoría MARCAR_NO_LLEGO (SISTEMA)");

  // Historial de camillas con duración.
  const historial = await apiJson<Array<{ estado: string; duracionMin: number | null }>>(
    "GET",
    `/api/ambulatorio/historial?fecha=${fechaISO(hoy)}`,
    undefined,
    tokenEnfermero,
  );
  assert(historial.length >= 2, `historial del día con eventos (${historial.length})`);
  assert(historial.some((e) => e.estado === "OCUPADA" && e.duracionMin !== null),
    "evento OCUPADA cerrado con duración");

  // ── Fase 6: motivo por webhook + causa ─────────────────
  console.log("\n— Fase 6: causa de inasistencia por webhook —");
  const statusVincularMaria = await enviarWebhookTg("tg:700101", "", TEL.maria);
  assert(statusVincularMaria === 200, `webhook vincular María aceptado (HTTP ${statusVincularMaria})`);
  await esperar(1_000);
  const statusMotivo = await enviarWebhookTg("tg:700101", "no tuve pasaje para el bus");
  assert(statusMotivo === 200, `webhook motivo aceptado (HTTP ${statusMotivo})`);
  await esperar(1_500);
  const causa = await prisma.causaInasistencia.findFirst({ where: { citaId: citaMariaHoy.id } });
  assert(causa?.causa === "TRANSPORTE", `causa clasificada TRANSPORTE (${causa?.causa ?? "ninguna"})`);

  // ── Fase 7: consultas del día (check-in FCFS) ──────────
  console.log("\n— Fase 7: consultas del día —");
  await prisma.cita.updateMany({
    where: { id: { in: citasSim.map((c) => c.id) }, servicio: "CONSULTA" },
    data: { fecha: hoyUtc },
  });
  const consultaDia = await apiJson<{ doctores: Array<{ doctor: string | null; citas: Array<{ id: string; turno: number | null }> }> }>(
    "GET",
    `/api/consulta/dia?fecha=${fechaISO(hoy)}`,
    undefined,
    token,
  );
  assert(consultaDia.doctores.length >= 1, "consulta/dia agrupa por doctor");
  const citaCarlos = citasSim.find((c) => c.paciente.numeroHash === di.cifrado.hashNumero(TEL.carlos))!;

  const llegada = await apiJson<{ id: string; llegadaEn: string | null }>(
    "POST",
    `/api/consulta/citas/${citaCarlos.id}/llegada`,
    undefined,
    token,
  );
  assert(!!llegada.llegadaEn, "check-in de Carlos registrado (FCFS)");
  const atenderCarlos = await apiJson<{ noLlegos: string[] }>(
    "POST",
    `/api/consulta/citas/${citaCarlos.id}/atender`,
    undefined,
    token,
  );
  assert(atenderCarlos.noLlegos.length === 0, "atender Carlos sin NO_LLEGO (es el turno 1)");
  const carlosFinalizado = await apiJson<{ estado: string }>(
    "POST",
    `/api/consulta/citas/${citaCarlos.id}/finalizar`,
    undefined,
    token,
  );
  assert(carlosFinalizado.estado === "ASISTIDA", "finalizar → Carlos ASISTIDA");

  // ── Fase 8: recurrencia y trabajo social ───────────────
  console.log("\n— Fase 8: recurrencia y silencios —");
  // Juan (frecuencia 30) atendido: su fechaObjetivo avanza +30 días.
  const juanPaciente = await prisma.paciente.findFirst({
    where: { numeroHash: di.cifrado.hashNumero(TEL.juan) },
  });
  const citaJuanPrisma = await prisma.cita.findUnique({ where: { id: citaJuanHoy.id } });
  const esperadoJuan = new Date(
    citaJuanPrisma!.fecha.getUTCFullYear(),
    citaJuanPrisma!.fecha.getUTCMonth(),
    citaJuanPrisma!.fecha.getUTCDate() + 30,
  );
  assert(
    juanPaciente!.fechaObjetivo.getTime() === esperadoJuan.getTime(),
    `recurrencia: fechaObjetivo de Juan avanza +30 días (${fechaISO(juanPaciente!.fechaObjetivo)})`,
  );

  // Silencio: Carlos vuelve a PROGRAMADA con fecha cercana → tarea SILENCIO.
  await prisma.cita.update({
    where: { id: citaCarlos.id },
    data: { estado: "PROGRAMADA", fecha: fechaUtcDe(sumarDias(hoy, 1)) },
  });
  await di.cronHematoflow!.detectarSilencios();
  const tareaSilencio = await prisma.tareaSocial.findFirst({
    where: { citaId: citaCarlos.id, tipo: "SILENCIO" },
  });
  assert(!!tareaSilencio, "detector de silencios creó tarea SILENCIO");

  // ── Restauración del estado de la demo ─────────────────
  await prisma.paciente.updateMany({
    where: { hospitalizado: true, id: { notIn: [...idsHospitalizadosPrevios] } },
    data: { hospitalizado: false },
  });

  // ── Resumen ────────────────────────────────────────────
  console.log(`\n📋 Resumen: ${asserts} asserts OK, ${fallos} fallos`);
  if (fallos > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
