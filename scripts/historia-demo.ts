/**
 * Historia demo: limpia TODA la data de negocio (conservando usuarios, equipo
 * médico, catálogo de procedimientos y configuración) y siembra:
 *   1. Cohort demo (20 pacientes con responsables, bandas, etiquetas, servicio).
 *   2. Cupos: 20 días hábiles (CupoDiario) + horarios médicos (3 doctores).
 *   3. PASADO (1 mes ≈ 30 días): citas terminales (ASISTIDA / NO_LLEGO /
 *      CANCELADA) con avisos ENVIADOS, tareas sociales, causas de inasistencia,
 *      mensajes del bot, camillas con eventos y auditoría.
 *   4. FUTURO (2 semanas ≈ 14 días): pendientes para el próximo lote —
 *      12 pacientes NUEVOS + 8 pacientes ANTERIORES de la cohorte, todos con
 *      fechaObjetivo dentro del horizonte de 14 días.
 *
 * Determinista (PRNG con semilla fija).
 *
 *   bun run historia:demo
 */
import { PrismaClient } from "@prisma/client";
import { AesGcmCifradoAdapter } from "../src/infrastructure/cifrado/aes-gcm.adapter";

const prisma = new PrismaClient();
const cifrado = new AesGcmCifradoAdapter();

/** Misma cohorte de fantasía que prisma/seed.ts (números ficticios). */
const DEMO_PACIENTES = [
  { nombres: "Ana Quispe Huamán", banda: "DISTANTE", etiqueta: "ROJA", tipo: "QUIMIOTERAPIA", frecuencia: 21, profesional: 0 },
  { nombres: "Luis Cárdenas Ríos", banda: "REGIONAL", etiqueta: "ROJA", tipo: "QUIMIOTERAPIA", frecuencia: 28, profesional: 1 },
  { nombres: "Carmen Flores Tapia", banda: "DISTANTE", etiqueta: "ROJA", tipo: "CONTROL", frecuencia: 15, profesional: 0 },
  { nombres: "Jorge Mamani Apaza", banda: "CERCANA", etiqueta: "ROJA", tipo: "PROCEDIMIENTO", frecuencia: 30, profesional: 2 },
  { nombres: "Rosa Salazar Vega", banda: "REGIONAL", etiqueta: "AMARILLA", tipo: "CONTROL", frecuencia: 30, profesional: 0 },
  { nombres: "Miguel Chávez Oré", banda: "DISTANTE", etiqueta: "AMARILLA", tipo: "CONTROL", frecuencia: null, profesional: 1 },
  { nombres: "Sofía Rojas Cáceres", banda: "CERCANA", etiqueta: "AMARILLA", tipo: "CONTROL", frecuencia: 15, profesional: 2 },
  { nombres: "Daniel Torres Meléndez", banda: "REGIONAL", etiqueta: "AMARILLA", tipo: "PROCEDIMIENTO", frecuencia: 45, profesional: 0 },
  { nombres: "María Elena Paredes", banda: "DISTANTE", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: 30, profesional: 1 },
  { nombres: "Pedro Ramos Chumpitaz", banda: "CERCANA", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: null, profesional: 2 },
  { nombres: "Lucía Gutiérrez Barrios", banda: "REGIONAL", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: 60, profesional: 0 },
  { nombres: "Carlos Mendoza Silva", banda: "DISTANTE", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: null, profesional: 1 },
  { nombres: "Fiorella Ccopa Huallpa", banda: "CERCANA", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: 30, profesional: 2 },
  { nombres: "Diego Arce Villanueva", banda: "REGIONAL", etiqueta: "ROJA", tipo: "QUIMIOTERAPIA", frecuencia: 21, profesional: 1 },
  { nombres: "Paola Núñez Castro", banda: "DISTANTE", etiqueta: "AMARILLA", tipo: "CONTROL", frecuencia: 15, profesional: 0 },
  { nombres: "Renato Salas Quispe", banda: "CERCANA", etiqueta: "AMARILLA", tipo: "PROCEDIMIENTO", frecuencia: null, profesional: 2 },
  { nombres: "Valeria Zúñiga Padilla", banda: "REGIONAL", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: 30, profesional: 1 },
  { nombres: "Andrés Beltrán Díaz", banda: "DISTANTE", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: null, profesional: 0 },
  { nombres: "Camila Herrera Lozano", banda: "CERCANA", etiqueta: "ROJA", tipo: "QUIMIOTERAPIA", frecuencia: 21, profesional: 1 },
  { nombres: "Bruno Espinoza Roca", banda: "REGIONAL", etiqueta: "AMARILLA", tipo: "CONTROL", frecuencia: 30, profesional: 2 },
] as const;

/** Pacientes NUEVOS (2 semanas): sin citas, fechaObjetivo en los próximos 14 días. */
const NUEVOS_PACIENTES = [
  { nombres: "Ángel Poma Flores", banda: "CERCANA", etiqueta: "ROJA", tipo: "QUIMIOTERAPIA", frecuencia: 21 },
  { nombres: "Elena Ccahuana Rojas", banda: "REGIONAL", etiqueta: "ROJA", tipo: "PROCEDIMIENTO", frecuencia: 30 },
  { nombres: "Raúl Soto Ramírez", banda: "DISTANTE", etiqueta: "ROJA", tipo: "CONTROL", frecuencia: null },
  { nombres: "Fiorella Cano Díaz", banda: "CERCANA", etiqueta: "AMARILLA", tipo: "CONTROL", frecuencia: 15 },
  { nombres: "Hugo Paredes Vargas", banda: "REGIONAL", etiqueta: "AMARILLA", tipo: "QUIMIOTERAPIA", frecuencia: 28 },
  { nombres: "Luz Ticona Mamani", banda: "DISTANTE", etiqueta: "AMARILLA", tipo: "CONTROL", frecuencia: 30 },
  { nombres: "Marco Ríos Salazar", banda: "CERCANA", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: null },
  { nombres: "Katherine Llontop Chávez", banda: "REGIONAL", etiqueta: "VERDE", tipo: "CONTROL", frecuencia: 30 },
  { nombres: "Óscar Nina Huanca", banda: "DISTANTE", etiqueta: "VERDE", tipo: "PROCEDIMIENTO", frecuencia: null },
  { nombres: "Gabriela Córdova Meza", banda: "CERCANA", etiqueta: "ROJA", tipo: "CONTROL", frecuencia: 15 },
  { nombres: "Rodrigo Quispe Paredes", banda: "REGIONAL", etiqueta: "AMARILLA", tipo: "CONTROL", frecuencia: null },
  { nombres: "Milagros Vera Cruz", banda: "DISTANTE", etiqueta: "VERDE", tipo: "QUIMIOTERAPIA", frecuencia: 21 },
] as const;

/** Índices de la cohorte demo tratados como "pacientes anteriores" que requieren lote en 2 semanas. */
const ANTERIORES_INDICES = [1, 3, 5, 7, 9, 11, 13, 15] as const;

const CAUSAS = ["TRANSPORTE", "ECONOMICO", "FAMILIAR", "GEOGRAFICO", "SALUD", "OTRO"] as const;
const MOTIVOS = [
  "no pude conseguir pasaje para el bus",
  "el viaje salió muy caro esta semana",
  "tuve un problema familiar de último momento",
  "la lluvia bloqueó la carretera",
  "me sentí mal esa mañana",
  "se me complicó el trabajo",
];

/** PRNG determinista (mulberry32) para que la historia sea reproducible. */
function crearRng(semilla: number): () => number {
  let s = semilla | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fechaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function minutosAHora(min: number): string {
  const hh = Math.floor(min / 60).toString().padStart(2, "0");
  const mm = (min % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Fecha local del día + "HH:mm" → Date local. */
function fechaHoraLocal(dia: Date, hora: string): Date {
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hh ?? 0, mm ?? 0);
}

function fechaTexto(dia: Date): string {
  return `${String(dia.getDate()).padStart(2, "0")}/${String(dia.getMonth() + 1).padStart(2, "0")}/${dia.getFullYear()}`;
}

async function limpiar(): Promise<void> {
  const tablas = [
    "mensaje",
    "webhookEvent",
    "camillaEvento",
    "causaInasistencia",
    "tareaSocial",
    "aviso",
    "cita",
    "pacienteProfesional",
    "camillaDia",
    "lotePlanificacion",
    "cupoDiario",
    "horarioMedico",
    "paciente",
    "auditoria",
  ] as const;
  for (const tabla of tablas) {
    const modelo = (prisma as unknown as Record<string, { deleteMany: () => Promise<{ count: number }> }>)[tabla]!;
    const { count } = await modelo.deleteMany();
    console.log(`  ✔ ${tabla}: ${count} eliminados`);
  }
}

/** Crea un paciente con hash/cifrado y responsable rotativo. */
async function crearPaciente(datos: {
  telefono: string;
  nombres: string;
  etiqueta: "ROJA" | "AMARILLA" | "VERDE";
  banda: "CERCANA" | "REGIONAL" | "DISTANTE";
  tipo: string;
  frecuencia: number | null;
  fechaObjetivo: Date;
  profesionales: Array<{ id: string }>;
  tipos: Array<{ id: string; nombre: string }>;
  asignadoPor: string;
  indice: number;
}): Promise<void> {
  const tipo = datos.tipos.find((t) => t.nombre === datos.tipo)!;
  const servicio = datos.tipo === "CONTROL" ? "CONSULTA" : "AMBULATORIO";
  const paciente = await prisma.paciente.create({
    data: {
      numeroHash: cifrado.hashNumero(datos.telefono),
      numeroCifrado: cifrado.cifrarNumero(datos.telefono),
      nombres: datos.nombres,
      etiqueta: datos.etiqueta,
      banda: datos.banda,
      fechaObjetivo: datos.fechaObjetivo,
      canal: datos.indice % 3 === 0 ? "TELEGRAM" : "WHATSAPP",
      tipoProcedimientoId: tipo.id,
      frecuenciaDias: datos.frecuencia,
      servicio: servicio as "AMBULATORIO" | "CONSULTA",
    },
  });
  const profesional = datos.profesionales[datos.indice % datos.profesionales.length]!;
  await prisma.pacienteProfesional.create({
    data: { pacienteId: paciente.id, profesionalId: profesional.id, asignadoPor: datos.asignadoPor },
  });
}

async function main(): Promise<void> {
  const rng = crearRng(20260815);
  const configs = await prisma.configuracion.findMany();
  const valorDe = (clave: string) => configs.find((c) => c.clave === clave)?.valor as never;
  const bandas = (valorDe("bandas") ??
    { CERCANA: { horasAvanceAviso: 24 }, REGIONAL: { horasAvanceAviso: 48 }, DISTANTE: { horasAvanceAviso: 72 } }) as Record<
    string,
    { horasAvanceAviso: number }
  >;
  const notif = (valorDe("notificaciones") ?? { ventanaRecordatorioHoras: 12 }) as { ventanaRecordatorioHoras: number };
  const trabajoSocial = (valorDe("trabajo_social") ?? { slaHoras: 24 }) as { slaHoras: number };

  const profesionales = await prisma.profesional.findMany({ orderBy: { nombre: "asc" } });
  const pacientes = await prisma.paciente.findMany({
    include: { tipoProcedimiento: true },
    orderBy: { creadoEn: "asc" },
  });
  const ambPacientes = pacientes.filter((p) => p.servicio === "AMBULATORIO");
  const consPacientes = pacientes.filter((p) => p.servicio === "CONSULTA");

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let citasPasadas = 0;
  let avisos = 0;
  let tareas = 0;
  let causas = 0;
  let mensajes = 0;
  let camillasDias = 0;
  let idxAmb = 0;
  let idxCons = 0;
  let sid = 0;

  const elegirEstado = (): "ASISTIDA" | "NO_LLEGO" | "CANCELADA" => {
    const r = rng();
    if (r < 0.74) return "ASISTIDA";
    if (r < 0.9) return "NO_LLEGO";
    return "CANCELADA";
  };

  /** Avisos AVISO_CITA + RECORDATORIO de una cita pasada (ENVIADOS). */
  async function crearAvisos(
    p: (typeof pacientes)[number],
    citaId: string,
    dia: Date,
    horaEstimada: string,
  ): Promise<void> {
    const fechaHora = fechaHoraLocal(dia, horaEstimada);
    const leadHoras = bandas[p.banda]?.horasAvanceAviso ?? 24;
    const lista = [
      {
        tipo: "AVISO_CITA" as const,
        mensaje: `Hola ${p.nombres} 👋 Tienes una cita en el Consultorio de Hematología del INSN el ${fechaTexto(dia)} a las ${horaEstimada}. ¿Podrás asistir? Responde SÍ o NO.`,
        programadoPara: new Date(fechaHora.getTime() - leadHoras * 3_600_000),
      },
      {
        tipo: "RECORDATORIO" as const,
        mensaje: `Hola ${p.nombres}, te recordamos tu cita del ${fechaTexto(dia)} a las ${horaEstimada} en el INSN. ¡Te esperamos!`,
        programadoPara: new Date(fechaHora.getTime() - notif.ventanaRecordatorioHoras * 3_600_000),
      },
    ];
    for (const a of lista) {
      await prisma.aviso.create({
        data: {
          citaId,
          tipo: a.tipo,
          canal: p.canal,
          mensaje: a.mensaje,
          programadoPara: a.programadoPara,
          estado: "ENVIADO",
          enviadoEn: new Date(a.programadoPara.getTime() + 60_000),
          intentos: 1,
        },
      });
      avisos += 1;
    }
  }

  /** Efectos downstream de un NO_LLEGO pasado: PREGUNTA_MOTIVO, tarea, causa, mensaje, auditoría. */
  async function efectosNoLlego(
    p: (typeof pacientes)[number],
    citaId: string,
    dia: Date,
    horaEstimada: string,
  ): Promise<void> {
    const cuando = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1, 10, 0);
    await prisma.aviso.create({
      data: {
        citaId,
        tipo: "PREGUNTA_MOTIVO",
        canal: p.canal,
        mensaje: `Hola ${p.nombres}, vimos que no pudiste asistir a tu cita del ${fechaTexto(dia)} a las ${horaEstimada}. Cuéntanos el motivo para ayudarte mejor 🙏`,
        programadoPara: cuando,
        estado: "ENVIADO",
        enviadoEn: new Date(cuando.getTime() + 60_000),
        intentos: 1,
      },
    });
    avisos += 1;

    const respondio = rng() < 0.45;
    const venceEn = new Date(cuando.getTime() + trabajoSocial.slaHoras * 3_600_000);
    if (respondio) {
      await prisma.tareaSocial.create({
        data: {
          pacienteId: p.id,
          citaId,
          tipo: "INASISTENCIA",
          estado: "RESUELTA",
          venceEn,
          resueltaEn: new Date(venceEn.getTime() + 3 * 3_600_000),
          resultado: "Paciente contactado; registró el motivo de la inasistencia.",
          asignadaA: "ASISTENTE_SOCIAL",
        },
      });
    } else {
      await prisma.tareaSocial.create({
        data: { pacienteId: p.id, citaId, tipo: "INASISTENCIA", estado: "PENDIENTE", venceEn },
      });
    }
    tareas += 1;

    await prisma.auditoria.create({
      data: {
        accion: "MARCAR_NO_LLEGO",
        entidad: "CITA",
        entidadId: citaId,
        actorId: "SISTEMA",
        actorRol: null,
        detalle: { automatico: true },
      },
    });

    if (respondio) {
      const causa = CAUSAS[Math.floor(rng() * CAUSAS.length)]!;
      const motivo = MOTIVOS[Math.floor(rng() * MOTIVOS.length)]!;
      await prisma.causaInasistencia.create({ data: { citaId, causa, textoLibre: motivo } });
      causas += 1;
      sid += 1;
      await prisma.mensaje.create({
        data: { pacienteId: p.id, sid: `SM-hist-${sid}`, remitente: "PACIENTE", contenido: motivo },
      });
      mensajes += 1;
      await prisma.auditoria.create({
        data: {
          accion: "REGISTRAR_CAUSA",
          entidad: "CITA",
          entidadId: citaId,
          actorId: "SISTEMA",
          actorRol: null,
          detalle: { causa },
        },
      });
    }
  }

  // ── PASADO: 1 mes (30 días) ──────────────────────────────
  console.log("\n— 4/5 Generando PASADO (1 mes) —");
  let diaHabilesPasado = 0;
  for (let atras = 30; atras >= 1; atras -= 1) {
    const dia = new Date(hoy);
    dia.setDate(dia.getDate() - atras);
    const dw = dia.getDay();
    if (dw === 0 || dw === 6) continue;
    diaHabilesPasado += 1;
    const diaUtc = fechaUtc(dia);

    // Ambulatorio del día (2–3 citas) + camillas con eventos.
    const nAmb = 2 + Math.floor(rng() * 2);
    const ambDia: Array<{ citaId: string; horaInicio: Date; duracionMin: number }> = [];
    let sumaAmb = 0;
    for (let a = 0; a < nAmb; a += 1) {
      const p = ambPacientes[idxAmb % ambPacientes.length]!;
      idxAmb += 1;
      const estado = elegirEstado();
      const horaEstimada = minutosAHora(8 * 60 + sumaAmb);
      const duracionMin = p.tipoProcedimiento.duracionMin;
      sumaAmb += duracionMin;

      const cita = await prisma.cita.create({
        data: {
          pacienteId: p.id,
          fecha: diaUtc,
          servicio: "AMBULATORIO",
          turno: a + 1,
          horaEstimada,
          duracionMin,
          tipoProcedimientoId: p.tipoProcedimientoId,
          estado,
          origen: "INICIAL",
          ...(estado === "ASISTIDA" ? { asistidaEn: fechaHoraLocal(dia, horaEstimada) } : {}),
          ...(estado === "CANCELADA" ? { motivoCancelacion: "Cancelación por el paciente" } : {}),
        },
      });
      citasPasadas += 1;
      if (estado === "ASISTIDA") {
        ambDia.push({ citaId: cita.id, horaInicio: fechaHoraLocal(dia, horaEstimada), duracionMin });
      }
      await crearAvisos(p, cita.id, dia, horaEstimada);
      if (estado === "NO_LLEGO") await efectosNoLlego(p, cita.id, dia, horaEstimada);
    }

    if (ambDia.length > 0) {
      const camillas = [];
      for (let nc = 1; nc <= 2; nc += 1) {
        camillas.push(
          await prisma.camillaDia.create({
            data: {
              fecha: diaUtc,
              numero: nc,
              estado: "LIBRE",
              estadoDesde: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 18, 0),
            },
          }),
        );
      }
      camillasDias += 1;
      let nc = 0;
      for (const atendida of ambDia) {
        const camilla = camillas[nc % camillas.length]!;
        nc += 1;
        const prepInicio = new Date(atendida.horaInicio.getTime() - 10 * 60_000);
        await prisma.camillaEvento.create({
          data: {
            camillaDiaId: camilla.id,
            fecha: diaUtc,
            citaId: atendida.citaId,
            estado: "PREPARACION",
            inicio: prepInicio,
            fin: atendida.horaInicio,
            duracionMin: 10,
          },
        });
        const fin = new Date(atendida.horaInicio.getTime() + atendida.duracionMin * 60_000);
        await prisma.camillaEvento.create({
          data: {
            camillaDiaId: camilla.id,
            fecha: diaUtc,
            citaId: atendida.citaId,
            estado: "OCUPADA",
            inicio: atendida.horaInicio,
            fin,
            duracionMin: atendida.duracionMin,
          },
        });
        await prisma.auditoria.create({
          data: {
            accion: "OCUPAR_CAMILLA",
            entidad: "CAMILLA",
            entidadId: camilla.id,
            actorId: "historia-demo",
            actorRol: "ENFERMERO",
            detalle: { camilla: camilla.numero, citaId: atendida.citaId },
          },
        });
      }
    }

    // Consultas por doctor (1–2 por doctor).
    for (const prof of profesionales) {
      const nCons = 1 + Math.floor(rng() * 2);
      let sumaCons = 0;
      for (let c = 0; c < nCons; c += 1) {
        const p = consPacientes[idxCons % consPacientes.length]!;
        idxCons += 1;
        const estado = elegirEstado();
        const horaEstimada = minutosAHora(8 * 60 + sumaCons);
        sumaCons += 20;

        const cita = await prisma.cita.create({
          data: {
            pacienteId: p.id,
            fecha: diaUtc,
            servicio: "CONSULTA",
            doctorId: prof.id,
            turno: c + 1,
            horaEstimada,
            duracionMin: 20,
            tipoProcedimientoId: p.tipoProcedimientoId,
            estado,
            origen: "INICIAL",
            ...(estado === "ASISTIDA" ? { asistidaEn: fechaHoraLocal(dia, horaEstimada) } : {}),
            ...(estado === "CANCELADA" ? { motivoCancelacion: "Cancelación por el paciente" } : {}),
          },
        });
        citasPasadas += 1;
        await crearAvisos(p, cita.id, dia, horaEstimada);
        if (estado === "NO_LLEGO") await efectosNoLlego(p, cita.id, dia, horaEstimada);
      }
    }
  }

  // Tareas SILENCIO resueltas (seguimiento previo a citas del mes).
  const conCita = await prisma.cita.findMany({ select: { id: true, pacienteId: true }, take: 40 });
  const silencios = Math.min(8, conCita.length);
  for (let i = 0; i < silencios; i += 1) {
    const c = conCita[(i * 3) % conCita.length]!;
    const resueltaEn = new Date(Date.now() - (i + 1) * 3 * 24 * 3_600_000);
    await prisma.tareaSocial.create({
      data: {
        pacienteId: c.pacienteId,
        citaId: c.id,
        tipo: "SILENCIO",
        estado: "RESUELTA",
        venceEn: new Date(resueltaEn.getTime() - 24 * 3_600_000),
        resueltaEn,
        resultado: "Contactado por teléfono; paciente respondió confirmando la cita.",
        asignadaA: "ASISTENTE_SOCIAL",
      },
    });
    tareas += 1;
  }

  // Auditoría de lotes de ejemplo (cierre de ciclos pasados).
  for (let i = 0; i < 3; i += 1) {
    await prisma.auditoria.create({
      data: { accion: "GENERAR_LOTE", entidad: "LOTE", entidadId: `lote-hist-${i}`, actorId: "historia-demo", actorRol: "MEDICO", detalle: { propuestas: 20, sinCupo: 0 } },
    });
    await prisma.auditoria.create({
      data: { accion: "APROBAR_LOTE", entidad: "LOTE", entidadId: `lote-hist-${i}`, actorId: "historia-demo", actorRol: "MEDICO", detalle: { aprobadas: 20 } },
    });
  }
  console.log(`  ✔ ${diaHabilesPasado} días hábiles · ${citasPasadas} citas terminales`);

  // ── FUTURO: 2 semanas de pendientes (nuevos + anteriores) ──
  console.log("\n— 5/5 Generando FUTURO (2 semanas: pacientes pendientes para lote) —");
  const tipos = await prisma.tipoProcedimiento.findMany();

  // 12 pacientes NUEVOS con fechaObjetivo hoy+1 … hoy+12.
  for (const [i, nuevo] of NUEVOS_PACIENTES.entries()) {
    const objetivo = new Date(hoy);
    objetivo.setDate(objetivo.getDate() + i + 1);
    await crearPaciente({
      telefono: `+519200000${String(i + 1).padStart(3, "0")}`,
      nombres: nuevo.nombres,
      etiqueta: nuevo.etiqueta,
      banda: nuevo.banda,
      tipo: nuevo.tipo,
      frecuencia: nuevo.frecuencia,
      fechaObjetivo: objetivo,
      profesionales,
      tipos,
      asignadoPor: "historia-demo",
      indice: i,
    });
  }
  console.log(`  ✔ ${NUEVOS_PACIENTES.length} pacientes NUEVOS (objetivo hoy+1 … hoy+12, sin cita)`);

  // 8 pacientes ANTERIORES de la cohorte: su próxima sesión entra en 2 semanas.
  const pacientesPorIndice = await prisma.paciente.findMany({ orderBy: { creadoEn: "asc" } });
  for (const [i, idx] of ANTERIORES_INDICES.entries()) {
    const p = pacientesPorIndice[idx]!;
    if (!p) continue;
    const objetivo = new Date(hoy);
    objetivo.setDate(objetivo.getDate() + 2 + i); // hoy+2 … hoy+9 (dentro de las 2 semanas)
    await prisma.paciente.update({ where: { id: p.id }, data: { fechaObjetivo: objetivo } });
  }
  console.log(`  ✔ ${ANTERIORES_INDICES.length} pacientes ANTERIORES con fechaObjetivo adelantada (próxima sesión en 2 semanas)`);

  // ── Resumen ─────────────────────────────────────────────
  const pendientes = await prisma.paciente.count({
    where: {
      activo: true,
      hospitalizado: false,
      citas: { none: { estado: { in: ["PROPUESTA", "PROGRAMADA", "CONFIRMADA", "EN_ATENCION"] } } },
    },
  });
  const pendientes2semanas = await prisma.paciente.count({
    where: {
      activo: true,
      hospitalizado: false,
      fechaObjetivo: { lte: new Date(hoy.getTime() + 14 * 86_400_000) },
      citas: { none: { estado: { in: ["PROPUESTA", "PROGRAMADA", "CONFIRMADA", "EN_ATENCION"] } } },
    },
  });
  const totalCitas = await prisma.cita.count();
  const porEstado = await prisma.cita.groupBy({ by: ["estado"], _count: true });
  console.log(`\n  ✔ Totales: ${totalCitas} citas (${porEstado.map((e) => `${e.estado}:${e._count}`).join(" · ")})`);
  console.log(`  ✔ ${avisos} avisos · ${tareas} tareas · ${causas} causas · ${mensajes} mensajes · ${camillasDias} días de camillas`);
  console.log(`  ✔ ${pendientes} pacientes pendientes (${pendientes2semanas} con objetivo en los próximos 14 días)`);

  console.log("\nEscenario listo: 1 mes de historia + 2 semanas de pendientes (nuevos y anteriores) para el lote.");
  console.log("Entra como medico/medico-2026 → Bandeja → Generar Lote.");
}

// ── Orquestación ────────────────────────────────────────
console.log("— 1/5 Limpiando data de negocio (se conservan usuarios, equipo, catálogos y configuración) —");
await limpiar();

console.log("\n— 2/5 Sembrando cohorte demo (20 pacientes) —");
{
  const profesionales = await prisma.profesional.findMany({ orderBy: { nombre: "asc" } });
  const tipos = await prisma.tipoProcedimiento.findMany();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  for (const [indice, demo] of DEMO_PACIENTES.entries()) {
    const objetivo = new Date(hoy);
    objetivo.setDate(objetivo.getDate() + 14 + indice * 2);
    await crearPaciente({
      telefono: `+519100000${String(indice + 1).padStart(3, "0")}`,
      nombres: demo.nombres,
      etiqueta: demo.etiqueta,
      banda: demo.banda,
      tipo: demo.tipo,
      frecuencia: demo.frecuencia,
      fechaObjetivo: objetivo,
      profesionales,
      tipos,
      asignadoPor: "historia-demo",
      indice,
    });
  }
  console.log(`  ✔ ${DEMO_PACIENTES.length} pacientes con responsable asignado`);
}

console.log("\n— 3/5 Sembrando cupos (20 días hábiles) —");
{
  const profesionales = await prisma.profesional.findMany({ orderBy: { nombre: "asc" } });
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let diasCupo = 0;
  for (let i = 0; i < 40 && diasCupo < 20; i += 1) {
    const dia = new Date(hoy);
    dia.setDate(dia.getDate() + 1 + i);
    const diaSemana = dia.getDay();
    if (diaSemana === 0 || diaSemana === 6) continue;
    await prisma.cupoDiario.create({ data: { fecha: fechaUtc(dia), cantidad: 12, camillas: 2 } });
    for (const prof of profesionales) {
      await prisma.horarioMedico.create({ data: { profesionalId: prof.id, fecha: fechaUtc(dia), cupo: 8 } });
    }
    diasCupo += 1;
  }
  console.log(`  ✔ ${diasCupo} días hábiles (12 ambulatorio/día, ${profesionales.length} doctores × 8 consultas/día)`);
}

await main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
