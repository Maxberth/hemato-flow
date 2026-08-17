/** Paginación uniforme de listados: ?pagina=1&limite=50 (limite máx 200). */

export interface Paginacion {
  pagina: number;
  limite: number;
}

export interface Paginado<T> {
  items: T[];
  total: number;
  pagina: number;
  limite: number;
}

export function parsePaginacion(query: Record<string, string | undefined>): Paginacion {
  const pagina = Number.parseInt(query["pagina"] ?? "1", 10);
  const limite = Number.parseInt(query["limite"] ?? "50", 10);
  return {
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.floor(pagina) : 1,
    limite: Number.isFinite(limite) && limite >= 1 ? Math.min(Math.floor(limite), 200) : 50,
  };
}
