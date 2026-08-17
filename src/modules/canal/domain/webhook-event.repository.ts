export interface WebhookEventRegistro {
  sid: string;
  fromHash: string;
  /** Payload del webhook (para reintentos del cron) */
  payload?: unknown;
}

export interface WebhookEventFallido {
  sid: string;
  fromHash: string;
  payload?: unknown;
}

export abstract class WebhookEventRepository {
  abstract registrar(evento: WebhookEventRegistro): Promise<{ duplicado: boolean }>;
  abstract marcarProcesado(sid: string): Promise<void>;
  abstract marcarError(sid: string, error: string): Promise<void>;
  /** Eventos en ERROR con reintentos disponibles (para el cron de reproceso) */
  abstract listarFallidos(limiteIntentos: number, maximo: number): Promise<WebhookEventFallido[]>;
  abstract incrementarIntentos(sid: string): Promise<void>;
}
