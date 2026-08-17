/** Cliente HTTP del panel: fetch a /api con token JWT en Authorization. */

export interface ApiError {
  codigo: string;
  mensaje: string;
}

const TOKEN_KEY = "hematoflow_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  // Notifica al AuthProvider para re-leer el token (login/logout en caliente).
  window.dispatchEvent(new Event("hematoflow-auth"));
}

export class ApiErrorClase extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly status: number,
  ) {
    super(mensaje);
    this.name = "ApiError";
  }
}

/** Respuesta envoltorio de la API: { success, data?, error? } */
interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export async function api<T>(
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  ruta: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const resp = await fetch(`/api${ruta}`, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await resp.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!resp.ok || !envelope?.success) {
    throw new ApiErrorClase(
      envelope?.error?.codigo ?? "ERROR_INTERNO",
      envelope?.error?.mensaje ?? `Error HTTP ${resp.status}`,
      resp.status,
    );
  }

  return envelope.data as T;
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; usuario: { username: string; rol: string; nombre?: string | null } }> {
  const data = await api<{ token: string; usuario: { username: string; rol: string; nombre?: string | null } }>(
    "POST",
    "/auth/login",
    { username, password },
  );
  setToken(data.token);
  return data;
}

export function logout(): void {
  setToken(null);
}
