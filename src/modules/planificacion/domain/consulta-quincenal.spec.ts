import { describe, expect, test } from "bun:test";
import {
  consultaQuincenalVencida,
  PERIODO_CONSULTA_DEFAULT,
  type PacienteRegla,
} from "./consulta-quincenal";

function regla(overrides: Partial<PacienteRegla> = {}): PacienteRegla {
  return {
    id: "pac-1",
    servicio: "AMBULATORIO",
    fechaObjetivo: new Date(2026, 7, 15),
    citas: [],
    ...overrides,
  };
}

const hoy = new Date(2026, 7, 15);
const hasta = new Date(2026, 9, 14); // hoy + 60

describe("consultaQuincenalVencida", () => {
  test("en tratamiento sin consultas previas → vencida desde el inicio del tratamiento + 14 días", () => {
    const res = consultaQuincenalVencida(regla(), hoy, hasta, PERIODO_CONSULTA_DEFAULT);
    expect(res).not.toBeNull();
    expect(res?.fechaObjetivo).toEqual(new Date(2026, 7, 29));
  });

  test("última consulta asistida hace 14 días → vencida en +14 desde esa", () => {
    const res = consultaQuincenalVencida(
      regla({
        citas: [
          { estado: "ASISTIDA", servicio: "CONSULTA", fecha: new Date(2026, 7, 1) },
        ],
      }),
      hoy,
      hasta,
      PERIODO_CONSULTA_DEFAULT,
    );
    expect(res?.fechaObjetivo).toEqual(new Date(2026, 7, 15));
  });

  test("con cita CONSULTA activa → no vencida (ya tiene seguimiento programado)", () => {
    const res = consultaQuincenalVencida(
      regla({ citas: [{ estado: "PROGRAMADA", servicio: "CONSULTA", fecha: new Date(2026, 7, 20) }] }),
      hoy,
      hasta,
      PERIODO_CONSULTA_DEFAULT,
    );
    expect(res).toBeNull();
  });

  test("consulta ASISTIDA hoy → no vencida (no re-proponer el mismo día)", () => {
    const res = consultaQuincenalVencida(
      regla({ citas: [{ estado: "ASISTIDA", servicio: "CONSULTA", fecha: hoy }] }),
      hoy,
      hasta,
      PERIODO_CONSULTA_DEFAULT,
    );
    expect(res).toBeNull();
  });

  test("paciente nuevo (servicio CONSULTA) → no aplica la regla quincenal", () => {
    const res = consultaQuincenalVencida(regla({ servicio: "CONSULTA" }), hoy, hasta);
    expect(res).toBeNull();
  });

  test("fuera de la ventana del motor → no vencida", () => {
    const res = consultaQuincenalVencida(regla({ fechaObjetivo: new Date(2026, 10, 1) }), hoy, hasta);
    expect(res).toBeNull();
  });
});
