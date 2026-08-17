import { describe, expect, test } from "bun:test";
import type { Banda, Canal, CitaEstado, Etiqueta, OrigenCita } from "@prisma/client";
import { ConflictoError, DominioError } from "../../../common/errors/dominio.error";
import { CitaRepository, type CitaListado } from "../../citas/domain/cita.repository";
import { AtenderConsultaUseCase } from "./atender-consulta.usecase";

interface CitaEstadoFake {
  id: string;
  estado: CitaEstado;
  servicio: "CONSULTA" | "AMBULATORIO";
  doctorId: string | null;
  turno: number | null;
  fecha: Date;
  llegadaEn: Date | null;
  asistidaEn: Date | null;
}

class CitaRepoFake extends CitaRepository {
  citas = new Map<string, CitaEstadoFake>();

  private listado(c: CitaEstadoFake): CitaListado {
    return {
      id: c.id,
      pacienteId: "pac-1",
      loteId: null,
      fecha: c.fecha,
      servicio: c.servicio,
      doctorId: c.doctorId,
      turno: c.turno,
      horaEstimada: "08:00",
      duracionMin: 20,
      tipoProcedimientoId: "tp-1",
      estado: c.estado,
      origen: "INICIAL" as OrigenCita,
      citaPreviaId: null,
      llegadaEn: c.llegadaEn,
      confirmadaEn: null,
      asistidaEn: c.asistidaEn,
      motivoCancelacion: null,
      justificacion: null,
      creadoEn: new Date(),
      updatedAt: new Date(),
      paciente: { id: "pac-1", nombres: "Juan Pérez", etiqueta: "VERDE" as Etiqueta, banda: "CERCANA" as Banda, canal: "WHATSAPP" as Canal },
      tipoProcedimiento: { id: "tp-1", nombre: "CONTROL", duracionMin: 20 },
      lote: null,
      doctor: null,
      causaInasistencia: null,
    };
  }

  async listar() {
    return [];
  }
  async listarPaginado() {
    return { items: [], total: 0, pagina: 1, limite: 50 };
  }
  async buscarPorId() {
    return null;
  }
  async buscarConPaciente(id: string) {
    const c = this.citas.get(id);
    return c ? this.listado(c) : null;
  }
  async marcarNoLlego() {
    return {} as never;
  }
  async marcarEnAtencion(id: string) {
    const c = this.citas.get(id)!;
    c.estado = "EN_ATENCION";
    return this.listado(c);
  }
  async marcarAtendida(id: string, asistidaEn: Date) {
    const c = this.citas.get(id)!;
    c.estado = "ASISTIDA";
    c.asistidaEn = asistidaEn;
    return this.listado(c);
  }
  async registrarLlegada(id: string, llegadaEn: Date) {
    const c = this.citas.get(id)!;
    c.llegadaEn = llegadaEn;
    return this.listado(c);
  }
  async cancelar() {
    return {} as never;
  }
  async confirmar() {
    return {} as never;
  }
  async buscarNoLlegoConCausaPendiente() {
    return null;
  }
  async citasPendientesDoctor(fecha: Date, doctorId: string, turnoMax: number) {
    return [...this.citas.values()]
      .filter(
        (c) =>
          c.doctorId === doctorId &&
          c.fecha.getTime() === fecha.getTime() &&
          c.servicio === "CONSULTA" &&
          c.turno !== null &&
          c.turno < turnoMax &&
          c.llegadaEn === null &&
          (c.estado === "PROGRAMADA" || c.estado === "CONFIRMADA"),
      )
      .map((c) => ({ id: c.id }));
  }
}

class RegistrarNoLlegoFake {
  llamadas: string[] = [];
  async ejecutar(citaId: string) {
    this.llamadas.push(citaId);
  }
}

function escenario(citas: CitaEstadoFake[]) {
  const repo = new CitaRepoFake();
  const noLlego = new RegistrarNoLlegoFake();
  for (const c of citas) repo.citas.set(c.id, c);
  return { repo, noLlego, usecase: new AtenderConsultaUseCase(repo, noLlego.ejecutar.bind(noLlego)) };
}

function cita(
  id: string,
  overrides: Partial<CitaEstadoFake> = {},
): CitaEstadoFake {
  return {
    id,
    estado: "PROGRAMADA",
    servicio: "CONSULTA",
    doctorId: "doc-1",
    turno: 1,
    fecha: new Date(2026, 7, 17),
    llegadaEn: null,
    asistidaEn: null,
    ...overrides,
  };
}

describe("AtenderConsultaUseCase", () => {
  test("registrarLlegada → check-in (llegadaEn) de una cita PROGRAMADA", async () => {
    const { repo, usecase } = escenario([cita("c1")]);
    const res = await usecase.registrarLlegada("c1");
    expect(res.llegadaEn).toBeInstanceOf(Date);
    expect(repo.citas.get("c1")?.llegadaEn).toBeInstanceOf(Date);
  });

  test("registrarLlegada con check-in previo → 409 YA_LLEGO", async () => {
    const { usecase } = escenario([cita("c1", { llegadaEn: new Date() })]);
    await expect(usecase.registrarLlegada("c1")).rejects.toBeInstanceOf(ConflictoError);
  });

  test("registrarLlegada de una cita ambulatoria → SERVICIO_INVALIDO", async () => {
    const { usecase } = escenario([cita("c1", { servicio: "AMBULATORIO" })]);
    await expect(usecase.registrarLlegada("c1")).rejects.toMatchObject({ codigo: "SERVICIO_INVALIDO" });
  });

  test("atender con saltados sin check-in → NO_LLEGO automático de los no llegados", async () => {
    const { repo, noLlego, usecase } = escenario([
      cita("c1", { turno: 1 }),
      cita("c2", { turno: 2, estado: "CONFIRMADA" }),
      cita("c3", { turno: 3 }),
    ]);
    // c2 llegó (se saltó a c1): al atender c3, solo c1 (sin check-in) es NO_LLEGO.
    repo.citas.get("c2")!.llegadaEn = new Date();

    const res = await usecase.atender("c3");
    expect(res.cita.estado).toBe("EN_ATENCION");
    expect(res.noLlegos).toEqual(["c1"]);
    expect(noLlego.llamadas).toEqual(["c1"]);
  });

  test("atender sin saltados → sin NO_LLEGO", async () => {
    const { noLlego, usecase } = escenario([cita("c1", { turno: 1 })]);
    const res = await usecase.atender("c1");
    expect(res.noLlegos).toEqual([]);
    expect(noLlego.llamadas).toEqual([]);
  });

  test("finalizar → ASISTIDA + asistidaEn", async () => {
    const { repo, usecase } = escenario([cita("c1", { estado: "EN_ATENCION" })]);
    const res = await usecase.finalizar("c1");
    expect(res.estado).toBe("ASISTIDA");
    expect(repo.citas.get("c1")?.asistidaEn).toBeInstanceOf(Date);
  });

  test("finalizar sin EN_ATENCION → ESTADO_INVALIDO", async () => {
    const { usecase } = escenario([cita("c1", { estado: "PROGRAMADA" })]);
    await expect(usecase.finalizar("c1")).rejects.toBeInstanceOf(DominioError);
  });
});
