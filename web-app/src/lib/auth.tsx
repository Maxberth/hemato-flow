import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getToken, logout as apiLogout } from "@/lib/api";

export interface UsuarioPanel {
  sub: string;
  username: string;
  rol: string;
  nombre?: string | null;
}

export type Rol = "SUPERADMIN" | "ADMIN" | "MEDICO" | "ASISTENTE_SOCIAL" | "ENFERMERO";

interface AuthContextValue {
  usuario: UsuarioPanel | null;
  rol: Rol | null;
  token: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  usuario: null,
  rol: null,
  token: null,
  logout: () => {},
});

/** Decodifica el payload del JWT (solo lectura del rol; no valida firma). */
function decodificarJwt(token: string): UsuarioPanel | null {
  try {
    const parte = token.split(".")[1];
    if (!parte) return null;
    const json = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")));
    return {
      sub: String(json.sub ?? ""),
      username: String(json.username ?? ""),
      rol: String(json.rol ?? ""),
      nombre: json.nombre ? String(json.nombre) : null,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  useEffect(() => {
    const onAuth = () => setTokenState(getToken());
    window.addEventListener("hematoflow-auth", onAuth);
    return () => window.removeEventListener("hematoflow-auth", onAuth);
  }, []);

  const usuario = useMemo(() => (token ? decodificarJwt(token) : null), [token]);
  const rol = usuario && ["SUPERADMIN", "ADMIN", "MEDICO", "ASISTENTE_SOCIAL", "ENFERMERO"].includes(usuario.rol)
    ? (usuario.rol as Rol)
    : null;

  const logout = () => {
    apiLogout();
    window.location.assign("/login");
  };

  return (
    <AuthContext.Provider value={{ usuario, rol, token, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
