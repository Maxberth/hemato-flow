import { describe, expect, test } from "bun:test";
import type { Banda, Etiqueta, Servicio } from "@prisma/client";
import {
  planificar,
  type CupoDia,
  type PacientePendiente,
  type PlanificacionConfig,
} from "./planificador";

const CONFIG: PlanificacionConfig = {
  diasVentana: 7,
  diasMinHorizonte: 1,
  bandas: {
    CERCANA: { horasAvanceAviso: 24 },
    REGIONAL: { horasAvanceAviso: 48 },
    DISTANTE: { horasAvanceAviso: 72 },
  },
  horasApertura: "08:00",
};

function fecha(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

function cupo(fechaDia: Date, cantidad: number, servicio: Servicio = "AMBULATORIO", doctorId: string | null = null): CupoDia {
  return { fecha: fechaDia, servicio, doctorId, cantidad };
}

/** Días consecutivos desde `desde`, todos con cupo ambulatorio `cantidad`. */
function serieCupos(desde: Date, n: number, cantidad = 3): CupoDia[] {
  const lista: CupoDia[] = [];
  for (let i = 0; i < n; i += 1) {
    lista.push(cupo(new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i), cantidad));
  }
  return lista;
}

function paciente(
  id: string,
  etiqueta: Etiqueta,
  banda: Banda,
  fechaObjetivo: Date,
  servicio: Servicio = "AMBULATORIO",
  duracionMin = 45,
  horaPreferida?: string | null,
): PacientePendiente {
  return { id, etiqueta, banda, fechaObjetivo, duracionMin, servicio, horaPreferida };
}

describe("planificador (turnos)", () => {
  const HOY = fecha(2026, 8, 1);

  test("determinismo: dos corridas idénticas producen el mismo plan", () => {
    const pendientes = [
      paciente("p2", "VERDE", "DISTANTE", fecha(2026, 8, 5)),
      paciente("p1", "ROJA", "CERCANA", fecha(2026, 8, 10)),
    ];
    const cupos = serieCupos(HOY, 10, 5);

    const a = planificar(pendientes, cupos, CONFIG, HOY);
    const b = planificar(pendientes, cupos, CONFIG, HOY);
    expect(a).toEqual(b);
  });

  test("ordena por etiqueta: ROJA antes que AMARILLA antes que VERDE", () => {
    const pendientes = [
      paciente("pV", "VERDE", "CERCANA", fecha(2026, 8, 3)),
      paciente("pR", "ROJA", "CERCANA", fecha(2026, 8, 3)),
      paciente("pA", "AMARILLA", "CERCANA", fecha(2026, 8, 3)),
    ];
    const resultado = planificar(pendientes, serieCupos(HOY, 10), CONFIG, HOY);
    expect(resultado.propuestas.map((p) => p.pacienteId)).toEqual(["pR", "pA", "pV"]);
  });

  test("respeta el lead por banda: DISTANTE no antes de hoy+3, CERCANA hoy+1", () => {
    const pendientes = [
      paciente("d", "VERDE", "DISTANTE", fecha(2026, 8, 2)),
      paciente("c", "VERDE", "CERCANA", fecha(2026, 8, 2)),
    ];
    const resultado = planificar(pendientes, serieCupos(HOY, 10), CONFIG, HOY);
    const porId = new Map(resultado.propuestas.map((p) => [p.pacienteId, p]));
    expect(porId.get("d")?.fecha).toEqual(fecha(2026, 8, 4)); // hoy+3
    expect(porId.get("c")?.fecha).toEqual(fecha(2026, 8, 2)); // hoy+1
  });

  test("banda DISTANTE ordena primero dentro de la misma etiqueta (posiciones)", () => {
    const pendientes = [
      paciente("c", "VERDE", "CERCANA", fecha(2026, 8, 3)),
      paciente("d", "VERDE", "DISTANTE", fecha(2026, 8, 3)),
    ];
    const resultado = planificar(pendientes, serieCupos(HOY, 10), CONFIG, HOY);
    // Ambos en el mismo día (hoy+1 no aplica a DISTANTE por lead: d va a hoy+3,
    // así que para comparar posiciones usamos un horizonte sin lead).
    expect(resultado.propuestas.map((p) => p.pacienteId)).toEqual(["d", "c"]);
    expect(resultado.propuestas[0]?.turno).toBe(1);
  });

  test("llena días por cupo: prefiere el día más temprano con cupo restante", () => {
    // Día 2 con cupo 2 (parcialmente lleno), día 3 con cupo 2 (vacío).
    const cupos = [
      cupo(fecha(2026, 8, 2), 1),
      cupo(fecha(2026, 8, 3), 2),
      cupo(fecha(2026, 8, 4), 2),
    ];
    const pendientes = [
      paciente("a", "VERDE", "CERCANA", fecha(2026, 8, 5)),
      paciente("b", "VERDE", "CERCANA", fecha(2026, 8, 5)),
    ];
    const resultado = planificar(pendientes, cupos, CONFIG, HOY);
    // a llena el día 2 (cupo 1); b va al día 3 (el más temprano con cupo).
    expect(resultado.propuestas[0]?.fecha).toEqual(fecha(2026, 8, 2));
    expect(resultado.propuestas[0]?.turno).toBe(1);
    expect(resultado.propuestas[1]?.fecha).toEqual(fecha(2026, 8, 3));
    expect(resultado.propuestas[1]?.turno).toBe(1);
  });

  test("concentra: pacientes consecutivos comparten el día hasta llenar el cupo, turnos 1..N", () => {
    const pendientes = [
      paciente("a", "ROJA", "CERCANA", fecha(2026, 8, 10)),
      paciente("b", "ROJA", "CERCANA", fecha(2026, 8, 10)),
      paciente("c", "ROJA", "CERCANA", fecha(2026, 8, 10)),
    ];
    const resultado = planificar(pendientes, serieCupos(HOY, 10, 3), CONFIG, HOY);
    const fechas = new Set(resultado.propuestas.map((p) => p.fecha.toISOString()));
    expect(fechas.size).toBe(1); // los 3 en el mismo día (llenar por cupo)
    expect(resultado.propuestas.map((p) => p.turno)).toEqual([1, 2, 3]);
  });

  test("horaEstimada acumula duraciones: turno 1 = 08:00, turno 2 = 08:45 (45 min)", () => {
    const pendientes = [
      paciente("a", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 45),
      paciente("b", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 45),
      paciente("c", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 60),
    ];
    const resultado = planificar(pendientes, serieCupos(HOY, 10, 5), CONFIG, HOY);
    expect(resultado.propuestas[0]?.turno).toBe(1);
    expect(resultado.propuestas[0]?.horaEstimada).toBe("08:00");
    expect(resultado.propuestas[1]?.turno).toBe(2);
    expect(resultado.propuestas[1]?.horaEstimada).toBe("08:45");
    expect(resultado.propuestas[2]?.turno).toBe(3);
    expect(resultado.propuestas[2]?.horaEstimada).toBe("09:30"); // 08:45 + 45
  });

  test("horas fijas seriales: las camillas no duplican horas — turno 1 = 08:00, turno 2 = 08:45, turno 3 = 09:45", () => {
    const pendientes = [
      paciente("a", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 45),
      paciente("b", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 60),
      paciente("c", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 45),
    ];
    const cuposCon2Camillas: CupoDia[] = [
      { fecha: fecha(2026, 8, 5), servicio: "AMBULATORIO", doctorId: null, cantidad: 5, camillas: 2 },
    ];
    const resultado = planificar(pendientes, cuposCon2Camillas, CONFIG, HOY);
    expect(resultado.propuestas[0]?.horaEstimada).toBe("08:00");
    expect(resultado.propuestas[1]?.horaEstimada).toBe("08:45"); // 08:00 + 45
    expect(resultado.propuestas[2]?.horaEstimada).toBe("09:45"); // 08:45 + 60
  });

  test("consulta asigna el doctor del día con más cupo restante", () => {
    const cupos = [
      cupo(fecha(2026, 8, 2), 1, "CONSULTA", "docA"),
      cupo(fecha(2026, 8, 2), 3, "CONSULTA", "docB"),
    ];
    const pendientes = [
      paciente("a", "VERDE", "CERCANA", fecha(2026, 8, 5), "CONSULTA", 20),
      paciente("b", "VERDE", "CERCANA", fecha(2026, 8, 5), "CONSULTA", 20),
    ];
    const resultado = planificar(pendientes, cupos, CONFIG, HOY);
    expect(resultado.propuestas.map((p) => p.doctorId)).toEqual(["docB", "docB"]);
    expect(resultado.propuestas.map((p) => p.turno)).toEqual([1, 2]);
    expect(resultado.propuestas[1]?.horaEstimada).toBe("08:20"); // 08:00 + 20
  });

  test("AMBULATORIO tiene prioridad sobre CONSULTA con misma prioridad/banda/fecha", () => {
    const cupos = [
      cupo(fecha(2026, 8, 2), 2, "AMBULATORIO"),
      cupo(fecha(2026, 8, 2), 2, "CONSULTA", "docA"),
    ];
    const pendientes = [
      paciente("consulta-1", "VERDE", "CERCANA", fecha(2026, 8, 5), "CONSULTA", 20),
      paciente("amb-1", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 45),
    ];
    const resultado = planificar(pendientes, cupos, CONFIG, HOY);
    expect(resultado.propuestas.map((p) => p.pacienteId)).toEqual(["amb-1", "consulta-1"]);
  });

  test("horaPreferida (receta): el bloque inicia en la hora fija asignada, sin solaparse", () => {
    const pendientes = [
      paciente("a", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 60),
      paciente("b", "VERDE", "CERCANA", fecha(2026, 8, 5), "AMBULATORIO", 45, "10:00"),
    ];
    const resultado = planificar(pendientes, serieCupos(HOY, 10, 3), CONFIG, HOY);
    expect(resultado.propuestas[0]?.horaEstimada).toBe("08:00"); // 08:00 + 60 min
    expect(resultado.propuestas[1]?.horaEstimada).toBe("10:00"); // preferida (nunca antes del fin anterior)
    expect(resultado.propuestas[1]?.turno).toBe(2);
  });

  test("sinCupo jamás sobrecupa: cupo agotado → sinCupo", () => {
    const cupos = [cupo(fecha(2026, 8, 2), 1)];
    const pendientes = [
      paciente("a", "VERDE", "CERCANA", fecha(2026, 8, 5)),
      paciente("b", "VERDE", "CERCANA", fecha(2026, 8, 5)),
    ];
    const resultado = planificar(pendientes, cupos, CONFIG, HOY);
    expect(resultado.propuestas).toHaveLength(1);
    expect(resultado.sinCupo.map((p) => p.id)).toEqual(["b"]);
  });

  test("sinCupo en consulta cuando todos los doctores agotan su cupo", () => {
    const cupos = [cupo(fecha(2026, 8, 2), 1, "CONSULTA", "docA")];
    const pendientes = [
      paciente("a", "VERDE", "CERCANA", fecha(2026, 8, 5), "CONSULTA", 20),
      paciente("b", "VERDE", "CERCANA", fecha(2026, 8, 5), "CONSULTA", 20),
    ];
    const resultado = planificar(pendientes, cupos, CONFIG, HOY);
    expect(resultado.propuestas).toHaveLength(1);
    expect(resultado.sinCupo.map((p) => p.id)).toEqual(["b"]);
  });

  test("horizonte: fechaObjetivo fuera de [hoy+lead, fechaObjetivo+diasVentana] → sin cupo", () => {
    const pendientes = [paciente("v", "VERDE", "CERCANA", fecha(2026, 7, 22))];
    const resultado = planificar(pendientes, serieCupos(HOY, 10), CONFIG, HOY);
    expect(resultado.sinCupo.map((p) => p.id)).toEqual(["v"]);
    expect(resultado.propuestas).toHaveLength(0);
  });

  test("extiende a [fechaObjetivo, fechaObjetivo+diasVentana] cuando ya pasó la fecha", () => {
    const pendientes = [paciente("a", "VERDE", "CERCANA", fecha(2026, 7, 31))];
    const resultado = planificar(pendientes, serieCupos(HOY, 10), CONFIG, HOY);
    expect(resultado.propuestas[0]?.fecha).toEqual(fecha(2026, 8, 2)); // primer día válido
  });

  test("sin pacientes pendientes → plan vacío", () => {
    const resultado = planificar([], serieCupos(HOY, 5), CONFIG, HOY);
    expect(resultado).toEqual({ propuestas: [], sinCupo: [] });
  });
});
