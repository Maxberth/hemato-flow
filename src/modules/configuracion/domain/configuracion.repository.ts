export interface ConfiguracionItem {
  clave: string;
  valor: unknown;
  descripcion?: string | null;
}

export abstract class ConfiguracionRepository {
  abstract obtenerTodas(): Promise<ConfiguracionItem[]>;
  abstract obtener(clave: string): Promise<ConfiguracionItem | null>;
  abstract actualizar(clave: string, valor: unknown): Promise<ConfiguracionItem>;
}
