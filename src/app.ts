import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "./common/middleware/request-id";
import { errorHandler } from "./common/errors/error-handler";
import { prisma } from "./infrastructure/prisma/prisma.service";
import { telegramController } from "./modules/canal/telegram.controller";
import { authController } from "./modules/auth/auth.controller";
import { crearConfiguracionController } from "./modules/configuracion/configuracion.controller";
import { crearAuditoriaController } from "./modules/auditoria/auditoria.controller";
import { crearPacientesController } from "./modules/pacientes/pacientes.controller";
import { crearProfesionalesController } from "./modules/profesionales/profesionales.controller";
import { crearCitasController } from "./modules/citas/citas.controller";
import { crearAmbulatorioController } from "./modules/ambulatorio/ambulatorio.controller";
import { crearConsultaController } from "./modules/consulta/consulta.controller";
import { crearCuposController } from "./modules/cupos/cupos.controller";
import { crearAvisosController } from "./modules/avisos/avisos.controller";
import { crearPlanificacionController } from "./modules/planificacion/planificacion.controller";
import { crearTrabajoSocialController } from "./modules/trabajo-social/trabajo-social.controller";
import { tiposProcedimientoController } from "./modules/tipos-procedimiento/tipos-procedimiento.controller";
import { di } from "./config/di";
import type { AppBindings } from "./common/middleware/bindings";

export function createApp() {
  const app = new Hono<AppBindings>();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
      allowHeaders: ["*"],
      exposeHeaders: ["*"],
    }),
  );
  app.use("*", secureHeaders());
  app.use("*", requestId);
  app.use("*", logger());

  app.get("/health", async (c) => {
    const estado: Record<string, string> = { estado: "ok", servicio: "hematoflow-api" };
    try {
      await prisma.$queryRaw`SELECT 1`;
      estado["baseDatos"] = "ok";
    } catch {
      estado["baseDatos"] = "error";
    }
    return c.json({
      success: true,
      data: estado,
    });
  });

  app.route("/api", authController);
  app.route("/api", crearConfiguracionController(di.configuracionRepo));
  app.route("/api", crearAuditoriaController(di.auditoria));
  app.route("/api", crearPacientesController({
    repo: di.pacienteRepo,
    registrar: di.registrarPaciente!,
    editar: di.editarPaciente!,
    importar: di.importarCohorte!,
    hospitalizacion: di.hospitalizacion!,
    asignarResponsable: di.asignarResponsable!,
    quitarResponsable: di.quitarResponsable!,
  }));
  app.route("/api", crearProfesionalesController(di.profesionalRepo));
  app.route("/api", crearCitasController({
    repo: di.citaRepo,
    registrarNoLlego: di.registrarNoLlego!,
    cancelar: di.cancelarCita!,
  }));
  app.route("/api", crearAmbulatorioController({
    repo: di.camillaRepo,
    atender: di.atenderCamilla!,
    abrirDia: di.abrirDia!,
  }));
  app.route("/api", crearConsultaController({ atender: di.atenderConsulta! }));
  app.route("/api", crearCuposController(di.auditoria));
  app.route("/api", crearAvisosController(di.avisoRepo));
  app.route("/api", crearPlanificacionController({
    repo: di.planificacionRepo,
    generar: di.generarLote!,
    aprobar: di.aprobarLote!,
    rechazar: di.rechazarLote!,
    config: di.configuracion,
  }));
  app.route("/api", crearTrabajoSocialController({
    repo: di.tareaRepo,
    cifrado: di.cifrado,
    auditoria: di.auditoria,
    tomar: di.tomarTarea!,
    resolver: di.resolverTarea!,
  }));
  app.route("/api", tiposProcedimientoController);
  app.route("/", telegramController);

  app.onError(errorHandler);
  app.notFound((c) =>
    c.json(
      { success: false, error: { codigo: "NO_ENCONTRADO", mensaje: `Ruta no existe: ${c.req.path}` } },
      404,
    ),
  );

  return app;
}
