import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma.service";
import {
  ConfiguracionRepository,
  type ConfiguracionItem,
} from "../domain/configuracion.repository";

export class PrismaConfiguracionRepository extends ConfiguracionRepository {
  async obtenerTodas(): Promise<ConfiguracionItem[]> {
    return prisma.configuracion.findMany({ orderBy: { clave: "asc" } });
  }

  async obtener(clave: string): Promise<ConfiguracionItem | null> {
    return prisma.configuracion.findUnique({ where: { clave } });
  }

  async actualizar(clave: string, valor: unknown): Promise<ConfiguracionItem> {
    return prisma.configuracion.upsert({
      where: { clave },
      update: { valor: valor as Prisma.InputJsonValue },
      create: { clave, valor: valor as Prisma.InputJsonValue },
    });
  }
}
