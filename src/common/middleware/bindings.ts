import type { UsuarioJwt } from "./requiere-rol";

export type AppBindings = {
  Variables: {
    requestId: string;
    usuario?: UsuarioJwt;
  };
};
