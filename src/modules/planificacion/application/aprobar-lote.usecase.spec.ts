import { describe, expect, test } from "bun:test";
import type { Banda, Canal, Cita, LotePlanificacion, OrigenCita } from "@prisma/client";
import { ConflictoError } from "../../../common/errors/dominio.error";
import { ConfiguracionService } from "../../configuracion/application/configuracion.service";
import {
  ConfiguracionRepository,
  type ConfiguracionItem,
} from "../../configuracion/domain/configuracion.repository";
import { AuditoriaRepository } from "../../auditoria/domain/auditoria.repository";
import {
  PlanificacionRepository,
  type AvisoPorCrear,
  type LoteConCitas,
  type TxPlanificacion,
} from "../domain/planificacion.repository";
import { AprobarLoteUseCase } from "./aprobar-lote.usecase";

// ── Fakes ──────────────────────────────────────────────

class FakeTx implements TxPlanificacion {
  aprobadas: string[] = [];
  avisos: AvisoPorCrear[] = [];
  canceladasPrevias: string[] = [];
  loteAprobado = false;

  constructor(
    private readonly cupo: number | null,
    private readonly ocupadas: number,
  ) {}

  async aprobarPropuesta(propuestaId: string): Promise<void> {
    this.aprobadas.push(propuestaId);
  }
  async cancelarCitaPreviaSiActiva(citaPreviaId: string): Promise<void> {
    this.canceladasPrevias.push(citaPreviaId);
  }
  async crearAvisos(avisos: AvisoPorCrear[]): Promise<void> {
    this.avisos.push(...avisos);
  }
  async cupoDe() {
    return this.cupo;
  }
  async contarCitasActivas() {
    return this.ocupadas;
  }
  async marcarLoteAprobado(): Promise<void> {
    this.loteAprobado = true;
  }
}

class FakePlanificacionRepo extends PlanificacionRepository {
  transaccion: FakeTx | null = null;

  constructor(
    private readonly lote: LoteConCitas | null,
    private readonly cupo: number | null = 3,
    private readonly ocupadas = 0,
  ) {
    super();
  }

  async loteAbiertoExistente() {
    return null;
  }
  async listarLotes() {
    return { items: [], total: 0, pagina: 1, limite: 50 };
  }
  async buscarLoteConCitas() {
    return this.lote;
  }
  async citasOtrasDeFechas() {
    return [];
  }
  async resumenPendientes() {
    return {
      total: 0,
      rojas: 0,
      amarillas: 0,
      verdes: 0,
      hayLoteAbierto: false,
      loteAbiertoId: null,
    };
  }
  async crearLoteAbierto() {
    return {
      id: "lote-fake",
      estado: "ABIERTO" as const,
      generadoPor: "u1",
      generadoEn: new Date(),
      decididoPor: null,
      decididoEn: null,
      motivoRechazo: null,
      sinCupo: null,
    };
  }
  async crearPropuestas() {}
  async rechazar() {}
  async enTransaccion<T>(fn: (tx: TxPlanificacion) => Promise<T>): Promise<T> {
    const tx = new FakeTx(this.cupo, this.ocupadas);
    this.transaccion = tx;
    return fn(tx);
  }
}

class FakeConfigRepo extends ConfiguracionRepository {
  private readonly items: ConfiguracionItem[];
  constructor() {
    super();
    this.items = [
      {
        clave: "bandas",
        valor: {
          CERCANA: { horasAvanceAviso: 24 },
          REGIONAL: { horasAvanceAviso: 48 },
          DISTANTE: { horasAvanceAviso: 72 },
        },
      },
      {
        clave: "notificaciones",
        valor: {
          ventanaRecordatorioHoras: 12,
          reintentosMax: 3,
          reintentoEsperaMin: 5,
          recordatoriosHoras: [24, 3],
        },
      },
    ];
  }
  async obtenerTodas() {
    return this.items;
  }
  async obtener(clave: string) {
    return this.items.find((i) => i.clave === clave) ?? null;
  }
  async actualizar(clave: string, valor: unknown) {
    return { clave, valor } as ConfiguracionItem;
  }
}

class FakeAuditoria extends AuditoriaRepository {
  registros: unknown[] = [];
  async registrar(r: unknown) {
    this.registros.push(r);
  }
  async listar() {
    return [];
  }
}

function propuesta(
  id: string,
  overrides: Partial<Cita> & { banda: Banda; nombres: string; canal: Canal },
): LoteConCitas["citas"][number] {
  return {
    id,
    pacienteId: `pac-${id}`,
    loteId: "lote-1",
    fecha: new Date(2026, 7, 10),
    servicio: "AMBULATORIO",
    doctorId: null,
    turno: 1,
    horaEstimada: "09:00",
    duracionMin: 45,
    tipoProcedimientoId: "tp-1",
    estado: "PROPUESTA",
    origen: "INICIAL" as OrigenCita,
    citaPreviaId: null,
    llegadaEn: null,
    confirmadaEn: null,
    asistidaEn: null,
    motivoCancelacion: null,
    justificacion: null,
    creadoEn: new Date(),
    updatedAt: new Date(),
    paciente: { nombres: overrides.nombres, banda: overrides.banda, canal: overrides.canal },
    tipoProcedimiento: { nombre: "CONTROL" },
    doctor: null,
    ...overrides,
  } as LoteConCitas["citas"][number];
}

function lote(estado: LotePlanificacion["estado"] = "ABIERTO", citas: LoteConCitas["citas"]): LoteConCitas {
  return {
    id: "lote-1",
    estado,
    generadoPor: "u1",
    generadoEn: new Date(),
    decididoPor: null,
    decididoEn: null,
    motivoRechazo: null,
    sinCupo: null,
    citas,
  };
}

const ACTOR = { actorId: "u1", actorRol: "MEDICO" as const };

function nuevoUsecase(repo: FakePlanificacionRepo) {
  return new AprobarLoteUseCase(repo, new ConfiguracionService(new FakeConfigRepo()), new FakeAuditoria());
}

describe("AprobarLoteUseCase", () => {
  test("aprueba todas las propuestas y crea avisos con programadoPara por banda y horaEstimada", async () => {
    const citas = [
      propuesta("c1", { banda: "CERCANA", nombres: "Ana", canal: "WHATSAPP" }),
      propuesta("c2", {
        id: "c2",
        banda: "DISTANTE",
        nombres: "Bruno",
        canal: "TELEGRAM",
        fecha: new Date(2026, 7, 12),
        servicio: "CONSULTA",
        doctorId: "doc-1",
        turno: 2,
        horaEstimada: "10:00",
        duracionMin: 20,
        origen: "REPROGRAMACION",
        citaPreviaId: "prev-1",
      }),
    ];
    const repo = new FakePlanificacionRepo(lote("ABIERTO", citas), 10, 0);
    const usecase = nuevoUsecase(repo);

    const resultado = await usecase.ejecutar("lote-1", ACTOR);
    expect(resultado.aprobadas).toBe(2);

    const tx = repo.transaccion!;
    expect(tx.aprobadas).toEqual(["c1", "c2"]);
    expect(tx.loteAprobado).toBe(true);
    expect(tx.canceladasPrevias).toEqual(["prev-1"]);
    expect(tx.avisos).toHaveLength(5);

    // c1 CERCANA, horaEstimada 09:00: aviso AVISO_CITA a 24h antes (09:00 del día anterior)
    const avisoC1 = tx.avisos.find((a) => a.citaId === "c1" && a.tipo === "AVISO_CITA")!;
    expect(avisoC1.programadoPara).toEqual(new Date(2026, 7, 9, 9, 0));
    expect(avisoC1.mensaje).toContain("turno #1");
    expect(avisoC1.mensaje).toContain("a las 09:00");
    // c1 CERCANA (lead 24h): solo el recordatorio de 3h entra en la escalera [24, 3]
    const recsC1 = tx.avisos.filter((a) => a.citaId === "c1" && a.tipo === "RECORDATORIO");
    expect(recsC1).toHaveLength(1);
    expect(recsC1[0]!.programadoPara).toEqual(new Date(2026, 7, 10, 6, 0)); // 09:00 − 3h

    // c2 DISTANTE, horaEstimada 10:00: aviso REPROGRAMACION a 72h antes
    const avisoC2 = tx.avisos.find((a) => a.citaId === "c2" && a.tipo === "REPROGRAMACION")!;
    expect(avisoC2.programadoPara).toEqual(new Date(2026, 7, 9, 10, 0));
    expect(avisoC2.canal).toBe("TELEGRAM");
    expect(avisoC2.mensaje).toContain("Bruno");
    expect(avisoC2.mensaje).toContain("reprogramada");
    expect(avisoC2.mensaje).toContain("turno #2");
    // c2 DISTANTE (lead 72h): escalera completa → 24h y 3h antes (hasta 3 avisos)
    const recsC2 = tx.avisos.filter((a) => a.citaId === "c2" && a.tipo === "RECORDATORIO");
    expect(recsC2).toHaveLength(2);
    expect(recsC2[0]!.programadoPara).toEqual(new Date(2026, 7, 11, 10, 0)); // 10:00 − 24h
    expect(recsC2[1]!.programadoPara).toEqual(new Date(2026, 7, 12, 7, 0)); // 10:00 − 3h
  });

  test("rechaza un lote que ya no está ABIERTO", async () => {
    const repo = new FakePlanificacionRepo(lote("APROBADO", [propuesta("c1", { banda: "CERCANA", nombres: "Ana", canal: "WHATSAPP" })]));
    const usecase = nuevoUsecase(repo);

    await expect(usecase.ejecutar("lote-1", ACTOR)).rejects.toBeInstanceOf(ConflictoError);
  });

  test("aborta todo si las citas activas exceden el cupo del día", async () => {
    const repo = new FakePlanificacionRepo(
      lote("ABIERTO", [propuesta("c1", { banda: "CERCANA", nombres: "Ana", canal: "WHATSAPP" })]),
      1, // cupo
      2, // citas activas (otro lote ocupó el día)
    );
    const usecase = nuevoUsecase(repo);

    await expect(usecase.ejecutar("lote-1", ACTOR)).rejects.toMatchObject({ codigo: "CAPACIDAD_EXCEDIDA" });
    const tx = repo.transaccion!;
    expect(tx.aprobadas).toEqual([]);
    expect(tx.avisos).toEqual([]);
    expect(tx.loteAprobado).toBe(false);
  });

  test("aborta todo si el día no tiene cupo (fila inexistente)", async () => {
    const repo = new FakePlanificacionRepo(
      lote("ABIERTO", [propuesta("c1", { banda: "CERCANA", nombres: "Ana", canal: "WHATSAPP" })]),
      null, // día sin fila de cupo
    );
    const usecase = nuevoUsecase(repo);

    await expect(usecase.ejecutar("lote-1", ACTOR)).rejects.toMatchObject({ codigo: "CAPACIDAD_EXCEDIDA" });
    expect(repo.transaccion!.aprobadas).toEqual([]);
  });

  test("lote inexistente → NoEncontrado", async () => {
    const repo = new FakePlanificacionRepo(null);
    const usecase = nuevoUsecase(repo);
    await expect(usecase.ejecutar("lote-x", ACTOR)).rejects.toMatchObject({ codigo: "NO_ENCONTRADO" });
  });
});
