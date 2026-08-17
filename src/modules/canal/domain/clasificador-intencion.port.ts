export type Intencion = "CONFIRMAR" | "NEGAR" | "CONSULTAR" | "OTRA";

export abstract class ClasificadorIntencionPort {
  abstract clasificar(texto: string): Promise<Intencion>;
}
