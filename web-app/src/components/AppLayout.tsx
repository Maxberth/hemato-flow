import { useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router";
import {
  CalendarDays,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Stethoscope,
  Users,
  BarChart3,
  Hospital,
  UserRound,
  BedDouble,
  ClipboardCheck,
  Menu,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { HematoFlowLogo } from "@/lib/ui";
import { api } from "@/lib/api";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  badgeKey?: "lotes" | "tareas";
  end?: boolean;
}

/** Nav por rol: médico/equipo común; enfermero ambulatorio; social propio. */
function navItems(rol: string): NavItem[] {
  const comunes: NavItem[] = [
    { to: "/monitor", label: "Monitor en Vivo", icon: LayoutGrid, end: true },
  ];
  if (rol === "ASISTENTE_SOCIAL") {
    return [
      { to: "/social", label: "Tareas Sociales", icon: ClipboardList, badgeKey: "tareas", end: true },
      { to: "/social/estadisticas", label: "Estadísticas", icon: BarChart3, end: true },
      ...comunes,
    ];
  }
  if (rol === "ENFERMERO") {
    return [
      { to: "/ambulatorio", label: "Ambulatorio del Día", icon: BedDouble, end: true },
      ...comunes,
    ];
  }
  const medico: NavItem[] = [
    { to: "/medico", label: "Bandeja Clínica", icon: Stethoscope, badgeKey: "lotes", end: true },
    { to: "/medico/agenda", label: "Agenda Médica", icon: CalendarDays, end: true },
    { to: "/medico/cupos", label: "Cupos del Servicio", icon: Hospital, end: true },
    { to: "/consulta", label: "Consultas del Día", icon: ClipboardCheck, end: true },
    { to: "/medico/pacientes", label: "Cohorte de Pacientes", icon: Users, end: true },
    { to: "/medico/equipo", label: "Equipo Médico", icon: UserRound, end: true },
    ...comunes,
  ];
  if (rol === "SUPERADMIN") {
    return [
      ...medico,
      { to: "/ambulatorio", label: "Ambulatorio del Día", icon: BedDouble, end: true },
      { to: "/social", label: "Tareas Sociales", icon: ClipboardList, badgeKey: "tareas", end: true },
      { to: "/social/estadisticas", label: "Estadísticas", icon: BarChart3, end: true },
    ];
  }
  if (rol === "ADMIN") {
    return [
      ...medico,
      { to: "/ambulatorio", label: "Ambulatorio del Día", icon: BedDouble, end: true },
    ];
  }
  return medico;
}

export function AppLayout() {
  const { usuario, rol, logout } = useAuth();
  const location = useLocation();
  const [mobileAbierto, setMobileAbierto] = useState(false);

  // Consulta de badges en segundo plano (lotes abiertos / tareas pendientes)
  const { data: resumen } = useQuery({
    queryKey: ["layout-resumen", rol],
    queryFn: async () => {
      if (rol === "ASISTENTE_SOCIAL") {
        const tareas = await api<Array<{ estado: string }>>("GET", "/tareas-sociales?estado=PENDIENTE").catch(() => []);
        return { tareas: tareas.length, lotes: 0 };
      }
      if (rol === "ENFERMERO") {
        return { lotes: 0, tareas: 0 };
      }
      const lotes = await api<Array<{ estado: string }>>("GET", "/planificacion/lotes").catch(() => []);
      const abiertos = lotes.filter((l) => l.estado === "ABIERTO").length;
      return { lotes: abiertos, tareas: 0 };
    },
    refetchInterval: 25_000,
  });

  if (!usuario || !rol) {
    return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  }

  const items = navItems(usuario.rol);

  return (
    <div className="flex min-h-screen bg-bg-light text-deep-slate font-sans">
      {/* Overlay para móvil */}
      {mobileAbierto && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileAbierto(false)}
        />
      )}

      {/* Sidebar Lateral */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 shadow-xs shrink-0",
          mobileAbierto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Cabecera del Sidebar con Logotipo Oficial */}
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <HematoFlowLogo size="sm" showSubtitle={false} />
          <button
            onClick={() => setMobileAbierto(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Lista de Navegación */}
        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Módulos del Sistema
          </p>
          <nav className="flex flex-col gap-1">
            {items.map((item) => {
              const Icono = item.icon;
              const badgeCount =
                item.badgeKey === "lotes"
                  ? resumen?.lotes
                  : item.badgeKey === "tareas"
                    ? resumen?.tareas
                    : undefined;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileAbierto(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 group",
                      isActive
                        ? "bg-tech-blue text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-50 hover:text-deep-slate",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-3">
                        <Icono
                          className={cn(
                            "h-4 w-4 transition-colors",
                            isActive ? "text-white" : "text-slate-400 group-hover:text-tech-blue",
                          )}
                        />
                        <span>{item.label}</span>
                      </div>
                      {typeof badgeCount === "number" && badgeCount > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-bold shadow-xs",
                            isActive
                              ? "bg-white text-tech-blue"
                              : "bg-warning-amber text-white",
                          )}
                        >
                          {badgeCount}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Pie de Sidebar: Perfil de Usuario y Logout */}
        <div className="mt-auto border-t border-slate-100 p-4 bg-slate-50/60">
          <div className="mb-3 flex items-center gap-3 px-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-hemato-crimson/10 font-bold text-hemato-crimson text-xs border border-hemato-crimson/20">
              {(usuario.nombre ?? usuario.username).slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <p className="text-sm font-semibold text-deep-slate truncate">
                {usuario.nombre ?? usuario.username}
              </p>
              <span className="text-[10px] text-slate-500 font-medium">
                {usuario.rol.replace("_", " ")}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-red-50 hover:text-hemato-crimson hover:border-red-200 shadow-xs cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Contenedor Principal */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Barra Superior solo para móvil */}
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileAbierto(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <Menu className="h-5 w-5" />
            </button>
            <HematoFlowLogo size="sm" showSubtitle={false} />
          </div>
        </header>

        {/* Contenido de la Página */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
