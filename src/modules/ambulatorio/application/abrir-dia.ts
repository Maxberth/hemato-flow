import { ConfiguracionService } from "../../configuracion/application/configuracion.service";
import type { CamillaRepository } from "../domain/camilla.repository";

interface ConfigTurnos {
  camillasPorDia: number;
}

/**
 * Abre el día ambulatorio: crea las camillas 1..N que falten, con
 * N = CupoDiario(fecha).camillas ?? config turnos.camillasPorDia.
 * Compartido por el controller (POST /dia/abrir) y el cron abrir-dia.
 */
export type AbrirDia = (fecha: Date) => Promise<{ camillas: number }>;

export function crearAbrirDia(camillas: CamillaRepository, config: ConfiguracionService): AbrirDia {
  return async function abrirDia(fecha: Date): Promise<{ camillas: number }> {
    const cupo = await camillas.cupoDelDia(fecha);
    let n = cupo?.camillas ?? 0;
    if (n <= 0) {
      const turnos = await config.obtener<ConfigTurnos>("turnos");
      n = turnos.camillasPorDia;
    }
    await camillas.crearDias(fecha, n);
    return { camillas: n };
  };
}
