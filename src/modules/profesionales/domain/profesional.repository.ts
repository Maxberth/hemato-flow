import type { Profesional } from "@prisma/client";
import type { Paginacion, Paginado } from "../../../common/paginacion";

export interface ProfesionalNuevo {
  nombre: string;
  especialidad?: string | null;
}

export abstract class ProfesionalRepository {
  abstract listar(
    activos: boolean | undefined,
    q: string | undefined,
    pag: Paginacion,
  ): Promise<Paginado<Profesional>>;
  abstract crear(datos: ProfesionalNuevo): Promise<Profesional>;
  abstract actualizar(
    id: string,
    datos: Partial<Pick<Profesional, "nombre" | "especialidad" | "activo">>,
  ): Promise<Profesional>;
}
