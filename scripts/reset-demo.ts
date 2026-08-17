/**
 * Reset demo: limpia TODA la data de negocio de la BD (pacientes, citas,
 * lotes, avisos, tareas, auditoría, webhooks, camillas, cupos) y conserva lo
 * que no es "data": cuentas de usuario (medico/admin/social/enfermero), equipo
 * médico (Profesional), catálogo de procedimientos y configuración operativa.
 *
 * Luego siembra un escenario listo para probar el flujo real como doctor:
 * cohorte demo de 20 pacientes (con responsables y bandas/etiquetas mixtas)
 * + cupos diarios ambulatorios y horarios médicos (20 días hábiles).
 *
 *   bun run reset:demo
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

async function main() {
  console.log("— 1/3 Limpiando data de negocio (se conservan usuarios, equipo, catálogos y configuración) —");
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

  // ── 2/3 Cohort demo (20 pacientes con números ficticios + responsables) ──
  console.log("\n— 2/3 Sembrando cohorte demo (20 pacientes) —");
  const profesionales = await prisma.profesional.findMany({ orderBy: { nombre: "asc" } });
  const tipos = await prisma.tipoProcedimiento.findMany();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  for (const [indice, demo] of DEMO_PACIENTES.entries()) {
    const telefono = `+519100000${String(indice + 1).padStart(3, "0")}`;
    const tipo = tipos.find((t) => t.nombre === demo.tipo)!;
    const servicio = demo.tipo === "CONTROL" ? ("CONSULTA" as const) : ("AMBULATORIO" as const);
    const fechaObjetivo = new Date(hoy);
    fechaObjetivo.setDate(fechaObjetivo.getDate() + 14 + indice * 2);

    const paciente = await prisma.paciente.create({
      data: {
        numeroHash: cifrado.hashNumero(telefono),
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
    const profesional = profesionales[demo.profesional % profesionales.length]!;
    await prisma.pacienteProfesional.create({
      data: { pacienteId: paciente.id, profesionalId: profesional.id, asignadoPor: "reset-demo" },
    });
  }
  console.log(`  ✔ ${DEMO_PACIENTES.length} pacientes con responsable asignado`);

  // ── 3/3 Cupos diarios (ambulatorio) + horarios médicos (consulta) ──
  console.log("\n— 3/3 Sembrando cupos (20 días hábiles) —");
  let diasCupo = 0;
  for (let i = 0; i < 40 && diasCupo < 20; i += 1) {
    const dia = new Date(hoy);
    dia.setDate(dia.getDate() + 1 + i);
    const diaSemana = dia.getDay();
    if (diaSemana === 0 || diaSemana === 6) continue;
    await prisma.cupoDiario.create({
      data: { fecha: dia, cantidad: 12, camillas: 2 },
    });
    for (const prof of profesionales) {
      await prisma.horarioMedico.create({
        data: { profesionalId: prof.id, fecha: dia, cupo: 8 },
      });
    }
    diasCupo += 1;
  }
  console.log(`  ✔ ${diasCupo} días hábiles (12 ambulatorio/día, ${profesionales.length} doctores × 8 consultas/día)`);

  console.log("\nEscenario listo. Entra como medico/medico-2026 → Genera lote → Aprueba.");}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
