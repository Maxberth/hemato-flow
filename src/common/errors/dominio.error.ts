export class DominioError extends Error {
  constructor(
    public readonly codigo: string,
    message: string,
    public readonly status = 400,
    public readonly detalle?: unknown,
  ) {
    super(message);
    this.name = "DominioError";
  }
}

export class NoAutorizadoError extends DominioError {
  constructor(message = "No autorizado") {
    super("NO_AUTORIZADO", message, 401);
  }
}

export class ProhibidoError extends DominioError {
  constructor(message = "Prohibido") {
    super("PROHIBIDO", message, 403);
  }
}

export class NoEncontradoError extends DominioError {
  constructor(message = "No encontrado") {
    super("NO_ENCONTRADO", message, 404);
  }
}

export class ConflictoError extends DominioError {
  constructor(codigo = "CONFLICTO", message = "Conflicto") {
    super(codigo, message, 409);
  }
}
