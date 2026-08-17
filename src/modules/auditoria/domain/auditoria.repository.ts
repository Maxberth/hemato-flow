import type { Rol } from "@prisma/client";

export interface RegistroAuditoria {
  accion: string;
  entidad: string;
  entidadId?: string;
  actorId?: string;
  actorRol?: Rol | null;
  detalle?: unknown;
}

export interface AuditoriaItem {
  id: string;
  actorId: string | null;
  actorRol: Rol | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: unknown;
  creadoEn: Date;
}

export abstract class AuditoriaRepository {
  abstract registrar(registro: RegistroAuditoria): Promise<void>;
  abstract listar(opts: {
    entidad?: string;
    entidadId?: string;
    limit: number;
    pagina?: number;
  }): Promise<AuditoriaItem[]>;
}
