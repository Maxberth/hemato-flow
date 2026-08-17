import { describe, expect, test } from "bun:test";
import type { CamillaEstado, CitaEstado, Etiqueta } from "@prisma/client";
import { ConflictoError, NoEncontradoError } from "../../../common/errors/dominio.error";
import { fechaDbALocal } from "../../../common/hora";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import {
  CamillaRepository,
  type CamillaDelDia,
  type CitaDia,
  type TxCamilla,
} from "../domain/camilla.repository";
import { AtenderCamillaUseCase } from "./atender-camilla.usecase";

// ── Estado en memoria + fakes ──────────────────────────

interface CitaFake {
  id: string;
  pacienteId: string;
  fecha: Date;
  servicio: "AMBULATORIO";
  nombres: string;
  etiqueta: Etiqueta;
  turno: number | null;
  horaEstimada: string | null;
  duracionMin: number;
  estado: CitaEstado;
  confirmadaEn: Date | null;
  llegadaEn: Date | null;
  asistidaEn: Date | null;
}

interface CamillaFake {
  id: string;
  fecha: Date;
  numero: number;
  estado: CamillaEstado;
  citaId: string | null;
  estadoDesde: Date;
}

class Estado {
  camillas = new Map<string, CamillaFake>();
  citas = new Map<string, CitaFake>();
  eventos: Array<{ camillaDiaId: string; citaId: string | null; pacienteId: string | null; estado: CamillaEstado; inicio: Date }> = [];
  eventosCerrados: Array<{ camillaDiaId: string; estado: CamillaEstado; fin: Date; duracionMin: number | null }> = [];

  camilla(id: string, numero = 1): CamillaDelDia {
    const c = this.camillas.get(id)!;
    return {
      id: c.id,
      fecha: c.fecha,
      numero: c.numero,
      estado: c.estado,
      citaId: c.citaId,
      estadoDesde: c.estadoDesde,
      cita: c.citaId
        ? (() => {
            const cita = this.citas.get(c.citaId!)!;
            return { id: cita.id, pacienteId: cita.pacienteId, nombres: cita.nombres, turno: cita.turno };
          })()
        : null,
    };
  }

  citaDia(c: CitaFake): CitaDia {
    return {
      id: c.id,
      pacienteId: c.pacienteId,
      fecha: c.fecha,
      servicio: c.servicio,
      nombres: c.nombres,
      etiqueta: c.etiqueta,
      turno: c.turno,
      horaEstimada: c.horaEstimada,
      duracionMin: c.duracionMin,
      estado: c.estado,
      confirmadaEn: c.confirmadaEn,
      llegadaEn: c.llegadaEn,
    };
  }
}

class FakeTx implements TxCamilla {
  constructor(private readonly estado: Estado) {}

  async camilla(camillaId: string) {
    return this.estado.camillas.has(camillaId) ? this.estado.camilla(camillaId) : null;
  }
  async citaParaCamilla(citaId: string) {
    const c = this.estado.citas.get(citaId);
    return c ? this.estado.citaDia(c) : null;
  }
  async ocuparCamilla(camillaId: string, citaId: string | null, pacienteId: string | null, estadoDesde: Date) {
    const c = this.estado.camillas.get(camillaId)!;
    c.estado = "OCUPADA";
    c.citaId = citaId;
    c.estadoDesde = estadoDesde;
    void pacienteId;
  }
  async retirarCamilla(camillaId: string, estadoDesde: Date) {
    const c = this.estado.camillas.get(camillaId)!;
    c.estado = "PREPARACION";
    c.estadoDesde = estadoDesde;
  }
  async marcarCamillaListo(camillaId: string, estadoDesde: Date) {
    const c = this.estado.camillas.get(camillaId)!;
    c.estado = "LIBRE";
    c.citaId = null;
    c.estadoDesde = estadoDesde;
  }
  async marcarEnAtencion(citaId: string) {
    const c = this.estado.citas.get(citaId)!;
    c.estado = "EN_ATENCION";
  }
  async marcarAtendida(citaId: string, asistidaEn: Date) {
    const c = this.estado.citas.get(citaId)!;
    c.estado = "ASISTIDA";
    c.asistidaEn = asistidaEn;
  }
  async citasAmbulatorioDia(fecha: Date) {
    return [...this.estado.citas.values()]
      .filter((c) => fechaDbALocal(c.fecha).getTime() === fecha.getTime())
      .map((c) => this.estado.citaDia(c));
  }
  async crearEvento(data: { camillaDiaId: string; citaId: string | null; pacienteId: string | null; estado: CamillaEstado; inicio: Date }) {
    this.estado.eventos.push(data);
  }
  async cerrarEventoAbierto(camillaDiaId: string, estado: CamillaEstado, fin: Date) {
    const abierto = [...this.estado.eventos]
      .reverse()
      .find((e) => e.camillaDiaId === camillaDiaId && e.estado === estado);
    const duracionMin = abierto
      ? Math.max(0, Math.round((fin.getTime() - abierto.inicio.getTime()) / 60_000))
      : null;
    this.estado.eventosCerrados.push({ camillaDiaId, estado, fin, duracionMin });
  }
}
class FakeRepo extends CamillaRepository {
  constructor(readonly estado: Estado) {
    super();
  }
  async listarDia(_fecha?: Date) {
    return [...this.estado.camillas.values()].map((c) => this.estado.camilla(c.id));
  }
  async crearDias(fecha: Date, n: number) {
    const existentes = new Set([...this.estado.camillas.values()].map((c) => c.numero));
    for (let i = 1; i <= n; i += 1) {
      if (!existentes.has(i)) {
        const id = `cam-${i}`;
        this.estado.camillas.set(id, { id, fecha, numero: i, estado: "LIBRE", citaId: null, estadoDesde: new Date() });
      }
    }
    return this.listarDia(fecha);
  }
  async citasDelDia(fecha: Date) {
    return [...this.estado.citas.values()]
      .filter((c) => fechaDbALocal(c.fecha).getTime() === fecha.getTime())
      .map((c) => this.estado.citaDia(c));
  }
  async cupoDelDia() {
    return { cantidad: 10, camillas: 2 };
  }
  async historial() {
    return [];
  }
  async buscarCitaActiva() {
    return null;
  }
  async enTransaccion<T>(fn: (tx: TxCamilla) => Promise<T>): Promise<T> {
    return fn(new FakeTx(this.estado));
  }
}

class RegistrarNoLlegoFake {
  llamadas: string[] = [];
  async ejecutar(citaId: string) {
    this.llamadas.push(citaId);
  }
}

class AuditoriaFake extends AuditoriaRepository {
  async registrar() {}
  async listar() {
    return [];
  }
}

// ── Helpers de escenario ───────────────────────────────

function hoyUtc(): Date {
  const hoy = new Date();
  return new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
}

function escenario(citas: CitaFake[]) {
  const estado = new Estado();
  const repo = new FakeRepo(estado);
  const noLlego = new RegistrarNoLlegoFake();
  const usecase = new AtenderCamillaUseCase(repo, noLlego.ejecutar.bind(noLlego), new AuditoriaFake());
  for (const c of citas) estado.citas.set(c.id, c);
  const fecha = hoyUtc();
  estado.camillas.set("cam-1", { id: "cam-1", fecha, numero: 1, estado: "LIBRE", citaId: null, estadoDesde: new Date() });
  estado.camillas.set("cam-2", { id: "cam-2", fecha, numero: 2, estado: "LIBRE", citaId: null, estadoDesde: new Date() });
  return { estado, repo, noLlego, usecase, fecha };
}

function cita(id: string, turno: number, estadoCita: CitaEstado, pacienteId = `pac-${id}`): CitaFake {
  return {
    id,
    pacienteId,
    fecha: hoyUtc(),
    servicio: "AMBULATORIO",
    nombres: `Paciente ${id}`,
    etiqueta: "VERDE",
    turno,
    horaEstimada: "08:00",
    duracionMin: 45,
    estado: estadoCita,
    confirmadaEn: null,
    llegadaEn: null,
    asistidaEn: null,
  };
}

const ACTOR = { actorId: "enf-1", actorRol: "ENFERMERO" as const };

describe("AtenderCamillaUseCase", () => {
  test("ocupar con el esperado (turno 1) → EN_ATENCION sin NO_LLEGO", async () => {
    const { estado, noLlego, usecase } = escenario([cita("c1", 1, "PROGRAMADA")]);
    const res = await usecase.ocupar("cam-1", { citaId: "c1" }, ACTOR);

    expect(res.noLlegos).toEqual([]);
    expect(noLlego.llamadas).toEqual([]);
    expect(estado.citas.get("c1")?.estado).toBe("EN_ATENCION");
    expect(estado.camillas.get("cam-1")?.estado).toBe("OCUPADA");
    expect(estado.camillas.get("cam-1")?.citaId).toBe("c1");
    expect(estado.eventos[0]).toMatchObject({ camillaDiaId: "cam-1", citaId: "c1", estado: "OCUPADA" });
  });

  test("ocupar con turno posterior → NO_LLEGO automático del anterior", async () => {
    const { estado, noLlego, usecase } = escenario([
      cita("c1", 1, "PROGRAMADA"),
      cita("c2", 2, "CONFIRMADA"),
    ]);
    const res = await usecase.ocupar("cam-1", { citaId: "c2" }, ACTOR);

    expect(res.noLlegos).toEqual(["c1"]);
    expect(noLlego.llamadas).toEqual(["c1"]);
    expect(estado.citas.get("c1")?.estado).toBe("PROGRAMADA"); // el helper real lo marca
    expect(estado.citas.get("c2")?.estado).toBe("EN_ATENCION");
  });

  test("retirar → camilla PREPARACION y cita ASISTIDA con asistidaEn", async () => {
    const { estado, usecase } = escenario([cita("c1", 1, "PROGRAMADA")]);
    await usecase.ocupar("cam-1", { citaId: "c1" }, ACTOR);
    const res = await usecase.retirar("cam-1", ACTOR);

    expect(res.citaId).toBe("c1");
    expect(estado.camillas.get("cam-1")?.estado).toBe("PREPARACION");
    expect(estado.citas.get("c1")?.estado).toBe("ASISTIDA");
    expect(estado.citas.get("c1")?.asistidaEn).toBeInstanceOf(Date);
    const cerrado = estado.eventosCerrados.find((e) => e.camillaDiaId === "cam-1" && e.estado === "OCUPADA")!;
    expect(!!cerrado).toBe(true);
    expect(cerrado.fin).toBeInstanceOf(Date);
    // La duración la calcula el repo (fin − inicio), nunca la pasa el llamador.
    expect(typeof cerrado.duracionMin).toBe("number");
  });

  test("listo → PREPARACION → LIBRE", async () => {
    const { estado, usecase } = escenario([cita("c1", 1, "PROGRAMADA")]);
    await usecase.ocupar("cam-1", { citaId: "c1" }, ACTOR);
    await usecase.retirar("cam-1", ACTOR);
    await usecase.listo("cam-1", ACTOR);

    expect(estado.camillas.get("cam-1")?.estado).toBe("LIBRE");
    expect(estado.camillas.get("cam-1")?.citaId).toBeNull();
  });

  test("walk-in → uso normal (evento con pacienteId, sin crear Cita) + NO_LLEGO del esperado", async () => {
    const { estado, noLlego, usecase } = escenario([cita("c1", 1, "PROGRAMADA")]);
    const res = await usecase.ocupar("cam-1", { pacienteId: "walk-1" }, ACTOR);

    expect(res.noLlegos).toEqual(["c1"]);
    expect(noLlego.llamadas).toEqual(["c1"]);
    expect(estado.eventos[0]).toMatchObject({ camillaDiaId: "cam-1", citaId: null, pacienteId: "walk-1", estado: "OCUPADA" });
    expect(estado.citas.size).toBe(1); // RNF-5: no se creó ninguna Cita
  });

  test("camilla no libre → ConflictoError CAMILLA_OCUPADA", async () => {
    const { estado, usecase } = escenario([cita("c1", 1, "PROGRAMADA"), cita("c2", 2, "CONFIRMADA")]);
    await usecase.ocupar("cam-1", { citaId: "c1" }, ACTOR);
    await expect(usecase.ocupar("cam-1", { citaId: "c2" }, ACTOR)).rejects.toMatchObject({
      codigo: "CAMILLA_OCUPADA",
    });
    expect(estado.citas.get("c2")?.estado).toBe("CONFIRMADA"); // sin efectos
  });

  test("camilla inexistente → NoEncontrado", async () => {
    const { usecase } = escenario([]);
    await expect(usecase.ocupar("cam-x", { citaId: "c1" }, ACTOR)).rejects.toBeInstanceOf(NoEncontradoError);
  });

  test("cita de otro servicio o no pendiente → CITA_INVALIDA", async () => {
    const { usecase } = escenario([cita("c1", 1, "ASISTIDA")]);
    await expect(usecase.ocupar("cam-1", { citaId: "c1" }, ACTOR)).rejects.toMatchObject({
      codigo: "CITA_INVALIDA",
    });
  });

  test("retirar camilla no OCUPADA → CAMILLA_NO_OCUPADA", async () => {
    const { usecase } = escenario([]);
    await expect(usecase.retirar("cam-1", ACTOR)).rejects.toMatchObject({ codigo: "CAMILLA_NO_OCUPADA" });
  });
});
