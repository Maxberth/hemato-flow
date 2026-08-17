import type { Context } from "hono";
import { DominioError } from "./dominio.error";
import { logger } from "../logger";

export async function errorHandler(err: unknown, c: Context) {
  if (err instanceof DominioError) {
    return c.json(
      {
        success: false,
        error: {
          codigo: err.codigo,
          mensaje: err.message,
        },
      },
      err.status as 400,
    );
  }

  logger.error({ err }, "Error no controlado");

  const status = 500;
  return c.json(
    {
      success: false,
      error: {
        codigo: "ERROR_INTERNO",
        mensaje: "Error interno del servidor",
      },
    },
    status,
  );
}
