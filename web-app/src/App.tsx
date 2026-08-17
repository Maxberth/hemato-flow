import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { Login } from "@/pages/Login";
import { MedicoDashboard } from "@/pages/MedicoDashboard";
import { MedicoLote } from "@/pages/MedicoLote";
import { MedicoAgenda } from "@/pages/MedicoAgenda";
import { MedicoCupos } from "@/pages/MedicoCupos";
import { MedicoPacientes } from "@/pages/MedicoPacientes";
import { MedicoEquipo } from "@/pages/MedicoEquipo";
import { SocialTareas } from "@/pages/SocialTareas";
import { SocialEstadisticas } from "@/pages/SocialEstadisticas";
import { MonitorKanban } from "@/pages/MonitorKanban";
import { AmbulatorioDia } from "@/pages/AmbulatorioDia";
import { ConsultaDia } from "@/pages/ConsultaDia";

/** `/` redirige por rol; sin token → /login. */
function Inicio() {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol === "ASISTENTE_SOCIAL") return <Navigate to="/social" replace />;
  if (usuario.rol === "ENFERMERO") return <Navigate to="/ambulatorio" replace />;
  return <Navigate to="/medico" replace />;
}

function RequiereRol({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (!roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/medico" element={<MedicoDashboard />} />
        <Route path="/medico/lotes/:id" element={<MedicoLote />} />
        <Route path="/medico/agenda" element={<MedicoAgenda />} />
        <Route path="/medico/cupos" element={<MedicoCupos />} />
        <Route path="/medico/pacientes" element={<MedicoPacientes />} />
        <Route path="/medico/equipo" element={<MedicoEquipo />} />
        <Route
          path="/ambulatorio"
          element={
            <RequiereRol roles={["SUPERADMIN", "ENFERMERO", "ADMIN"]}>
              <AmbulatorioDia />
            </RequiereRol>
          }
        />
        <Route
          path="/consulta"
          element={
            <RequiereRol roles={["SUPERADMIN", "MEDICO", "ENFERMERO", "ADMIN"]}>
              <ConsultaDia />
            </RequiereRol>
          }
        />
        <Route path="/social" element={<SocialTareas />} />
        <Route path="/social/estadisticas" element={<SocialEstadisticas />} />
        <Route path="/monitor" element={<MonitorKanban />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
