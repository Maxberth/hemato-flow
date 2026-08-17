import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/modules/auth/infrastructure/password-hash";
import { AesGcmCifradoAdapter } from "../src/infrastructure/cifrado/aes-gcm.adapter";

const prisma = new PrismaClient();
const cifrado = new AesGcmCifradoAdapter();

/** Nombres de fantasía para la demo (sin datos clínicos reales). */
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

async function main() {
  // ── Usuarios del panel (RBAC) ─────────────────────────
  const usuarios = [
    {
      username: process.env.SUPERADMIN_USERNAME ?? "superadmin",
      password: process.env.SUPERADMIN_PASSWORD ?? "superadmin-2026",
      rol: "SUPERADMIN" as const,
      nombre: "Superadministrador",
    },
    {
      username: process.env.ADMIN_USERNAME ?? "admin",
      password: process.env.ADMIN_PASSWORD ?? "admin-2026",
      rol: "ADMIN" as const,
      nombre: "Administrador",
    },
    {
      username: process.env.MEDICO_USERNAME ?? "medico",
      password: process.env.MEDICO_PASSWORD ?? "medico-2026",
      rol: "MEDICO" as const,
      nombre: "Dr. Ana Torres",
    },
    {
      username: process.env.SOCIAL_USERNAME ?? "social",
      password: process.env.SOCIAL_PASSWORD ?? "social-2026",
      rol: "ASISTENTE_SOCIAL" as const,
      nombre: "María Quispe",
    },
    {
      username: process.env.ENFERMERO_USERNAME ?? "enfermero",
      password: process.env.ENFERMERO_PASSWORD ?? "enfermero-2026",
      rol: "ENFERMERO" as const,
      nombre: "Lic. Carlos Paredes",
    },
  ];

  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { username: u.username },
      update: { rol: u.rol, nombre: u.nombre, activo: true },
      create: {
        username: u.username,
        passwordHash: hashPassword(u.password),
        rol: u.rol,
        nombre: u.nombre,
      },
    });
    console.log(`✔ Usuario creado/verificado: ${u.username} (${u.rol})`);
  }

  // ── Configuración operativa ───────────────────────────
  const configInicial = [
    {
      clave: "turnos",
      valor: {
        duracionEstimadaMin: 45,
        horasApertura: "08:00",
        diasPlazoConfirmacion: 3,
        camillasPorDia: 2,
      },
      descripcion: "Motor de turnos ambulatorios: duración estimada, apertura y plazo de confirmación",
    },
    {
      clave: "consultas",
      valor: { duracionEstimadaMin: 20, diasPlazoConfirmacion: 3, periodoDias: 14 },
      descripcion: "Consultas: solo pacientes nuevos o seguimiento quincenal (periodoDias) del tratamiento",
    },
    {
      clave: "bandas",
      valor: {
        CERCANA: { horasAvanceAviso: 24 },
        REGIONAL: { horasAvanceAviso: 48 },
        DISTANTE: { horasAvanceAviso: 72 },
      },
      descripcion: "Horas de anticipación del aviso de cita por banda",
    },
    {
      clave: "notificaciones",
      valor: {
        ventanaRecordatorioHoras: 12,
        reintentosMax: 3,
        reintentoEsperaMin: 5,
        recordatoriosHoras: [24, 3],
      },
      descripcion: "Recordatorios escalonados (hasta 3 avisos según cercanía) y reintentos",
    },
    {
      clave: "trabajo_social",
      valor: { horasPreviasCita: 48, slaHoras: 24 },
      descripcion: "Detector de silencios y SLA de tareas sociales",
    },
  ];

  for (const cfg of configInicial) {
    await prisma.configuracion.upsert({
      where: { clave: cfg.clave },
      update: { valor: cfg.valor },
      create: cfg,
    });
  }
  console.log(`✔ ${configInicial.length} configuraciones sembradas`);

  // ── Catálogo de tipos de procedimiento ────────────────
  const tipos = [
    { nombre: "CONTROL", duracionMin: 30 },
    { nombre: "QUIMIOTERAPIA", duracionMin: 120 },
    { nombre: "PROCEDIMIENTO", duracionMin: 60 },
  ];

  for (const t of tipos) {
    await prisma.tipoProcedimiento.upsert({
      where: { nombre: t.nombre },
      update: { duracionMin: t.duracionMin },
      create: t,
    });
  }
  console.log(`✔ ${tipos.length} tipos de procedimiento sembrados`);

  // ── Profesionales de ejemplo (equipo responsable) ─────
  const profesionales = [
    { nombre: "Dra. Ana Torres", especialidad: "Hematología pediátrica" },
    { nombre: "Dr. Luis Mendoza", especialidad: "Oncohematología" },
    { nombre: "Lic. Rosa Huamán", especialidad: "Enfermería oncológica" },
  ];

  for (const p of profesionales) {
    const existe = await prisma.profesional.findFirst({ where: { nombre: p.nombre } });
    if (!existe) {
      await prisma.profesional.create({ data: p });
    }
  }
  console.log(`✔ ${profesionales.length} profesionales sembrados`);

  // ── Cohort demo (20 pacientes con números ficticios + responsables) ──
  const profesionalesDb = await prisma.profesional.findMany({ orderBy: { nombre: "asc" } });
  const tiposDb = await prisma.tipoProcedimiento.findMany();

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let demoImportados = 0;
  let demoDuplicados = 0;

  for (const [indice, demo] of DEMO_PACIENTES.entries()) {
    const telefono = `+519100000${String(indice + 1).padStart(3, "0")}`;
    const numeroHash = cifrado.hashNumero(telefono);
    const existente = await prisma.paciente.findUnique({ where: { numeroHash } });
    if (existente) {
      demoDuplicados += 1;
      continue;
    }

    const tipo = tiposDb.find((t) => t.nombre === demo.tipo)!;
    const servicio = demo.tipo === "CONTROL" ? ("CONSULTA" as const) : ("AMBULATORIO" as const);
    const fechaObjetivo = new Date(hoy);
    fechaObjetivo.setDate(fechaObjetivo.getDate() + 14 + indice * 2);

    const paciente = await prisma.paciente.create({
      data: {
        numeroHash,
        numeroCifrado: cifrado.cifrarNumero(telefono),
        nombres: demo.nombres,
        etiqueta: demo.etiqueta,
        banda: demo.banda,
        fechaObjetivo,
        canal: indice % 3 === 0 ? "TELEGRAM" : "WHATSAPP",
        tipoProcedimientoId: tipo.id,
        frecuenciaDias: demo.frecuencia,
        servicio,
      },
    });

    // Responsable del equipo (distribución rotativa).
    const profesional = profesionalesDb[demo.profesional % profesionalesDb.length]!;
    await prisma.pacienteProfesional.create({
      data: { pacienteId: paciente.id, profesionalId: profesional.id, asignadoPor: "seed" },
    });
    demoImportados += 1;
  }
  console.log(`✔ Cohort demo: ${demoImportados} pacientes (${demoDuplicados} ya existían)`);

  // Backfill idempotente: pacientes ya existentes (seed previo) heredan su
  // servicio del tipo de procedimiento (CONTROL → CONSULTA; el resto → AMBULATORIO).
  const backfill = await prisma.$executeRawUnsafe(`
    UPDATE "Paciente" p
    SET "servicio" = CASE WHEN t."nombre" = 'CONTROL' THEN 'CONSULTA'::"Servicio" ELSE 'AMBULATORIO'::"Servicio" END
    FROM "TipoProcedimiento" t
    WHERE t."id" = p."tipoProcedimientoId" AND p."servicio" IS DISTINCT FROM
      (CASE WHEN t."nombre" = 'CONTROL' THEN 'CONSULTA'::"Servicio" ELSE 'AMBULATORIO'::"Servicio" END)
  `);
  if (backfill > 0) console.log(`✔ Servicio backfill: ${backfill} pacientes actualizados`);

  // ── Cupos diarios (ambulatorio) + horarios médicos (consulta): 20 días hábiles ──
  let diasCupo = 0;
  for (let i = 0; i < 40 && diasCupo < 20; i += 1) {
    const dia = new Date(hoy);
    dia.setDate(dia.getDate() + 1 + i);
    const diaSemana = dia.getDay();
    if (diaSemana === 0 || diaSemana === 6) continue;
    await prisma.cupoDiario.upsert({
      where: { fecha: dia },
      update: {},
      create: { fecha: dia, cantidad: 12, camillas: 2 },
    });
    for (const prof of profesionalesDb) {
      await prisma.horarioMedico.upsert({
        where: { profesionalId_fecha: { profesionalId: prof.id, fecha: dia } },
        update: {},
        create: { profesionalId: prof.id, fecha: dia, cupo: 8 },
      });
    }
    diasCupo += 1;
  }
  console.log(`✔ Cupos: ${diasCupo} días hábiles (12 ambulatorio/día, 3 doctores × 8 consultas/día)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
