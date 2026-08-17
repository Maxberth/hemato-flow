import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import {
  WebhookEventRepository,
  type WebhookEventFallido,
  type WebhookEventRegistro,
} from "../domain/webhook-event.repository";

export class PrismaWebhookEventRepository extends WebhookEventRepository {
  async registrar(evento: WebhookEventRegistro): Promise<{ duplicado: boolean }> {
    try {
      await prisma.webhookEvent.create({
        data: {
          sid: evento.sid,
          fromHash: evento.fromHash,
          estado: "RECIBIDO",
          payload: evento.payload ? (evento.payload as Prisma.InputJsonValue) : undefined,
        },
      });
      return { duplicado: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { duplicado: true };
      }
      throw err;
    }
  }

  async marcarProcesado(sid: string): Promise<void> {
    await prisma.webhookEvent.update({
      where: { sid },
      data: { estado: "PROCESADO", procesadoEn: new Date() },
    });
  }

  async marcarError(sid: string, error: string): Promise<void> {
    await prisma.webhookEvent.update({
      where: { sid },
      data: { estado: "ERROR", error, procesadoEn: new Date() },
    });
  }

  async listarFallidos(limiteIntentos: number, maximo: number): Promise<WebhookEventFallido[]> {
    const eventos = await prisma.webhookEvent.findMany({
      where: {
        estado: "ERROR",
        intentosReintento: { lt: limiteIntentos },
      },
      orderBy: { creadoEn: "asc" },
      take: maximo,
      select: { sid: true, fromHash: true, payload: true },
    });
    return eventos.map((e) => ({
      sid: e.sid,
      fromHash: e.fromHash,
      payload: e.payload ?? undefined,
    }));
  }

  async incrementarIntentos(sid: string): Promise<void> {
    await prisma.webhookEvent.update({
      where: { sid },
      data: { intentosReintento: { increment: 1 }, estado: "RECIBIDO" },
    });
  }
}
