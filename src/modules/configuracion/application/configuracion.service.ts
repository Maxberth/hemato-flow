import type { ConfiguracionRepository } from "../domain/configuracion.repository";

/** Valores por defecto (iguales al seed) como respaldo si falta la clave. */
const DEFAULTS: Record<string, unknown> = {
  planificacion: { diasVentana: 60, diasMinHorizonte: 1 },
  bandas: {
    CERCANA: { horasAvanceAviso: 24 },
    REGIONAL: { horasAvanceAviso: 48 },
    DISTANTE: { horasAvanceAviso: 72 },
  },
  notificaciones: { ventanaRecordatorioHoras: 12, reintentosMax: 3, reintentoEsperaMin: 5 },
  trabajo_social: { horasPreviasCita: 48, slaHoras: 24 },
};

export class ConfiguracionService {
  constructor(private readonly repo: ConfiguracionRepository) {}

  async obtener<T>(clave: string): Promise<T> {
    const item = await this.repo.obtener(clave);
    return (item?.valor ?? DEFAULTS[clave]) as T;
  }
}
