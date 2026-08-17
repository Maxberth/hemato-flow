import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  CalendarDays,
  Hospital,
  Layers,
  ArrowRight,
  AlertTriangle,
  Clock,
  Sparkles,
  Users,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/lib/api";
import type { LoteEstado, Paginated } from "@/lib/types";
import { Paginacion } from "@/components/Paginacion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Lote {
  id: string;
  estado: LoteEstado;
  generadoEn: string;
  generadoPor?: string;
  decididoEn?: string | null;
}

interface PendientesResumen {
  total: number;
  rojas: number;
  amarillas: number;
  verdes: number;
  hayLoteAbierto: boolean;
  loteAbiertoId: string | null;
}

async function metricas() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const en7 = new Date(hoy);
  en7.setDate(en7.getDate() + 7);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [lotesAbiertos, citas, avisos, tareas] = await Promise.all([
    api<Paginated<Lote>>("GET", "/planificacion/lotes?estado=ABIERTO&limite=1"),
    api<Paginated<unknown>>("GET", `/citas?desde=${iso(hoy)}&hasta=${iso(en7)}&limite=1`),
    // El módulo Capacidad se eliminó en el rediseño; el aviso por enviar es la
    // métrica viva del canal (el bot notifica hasta 3 veces según cercanía).
    api<Paginated<unknown>>("GET", "/avisos?estado=PROGRAMADO&limite=1").catch(() => ({ total: 0 })),
    api<{ resumen: { pendientes: number } }>("GET", "/tareas-sociales?estado=PENDIENTE&limite=1").catch(
      () => ({ resumen: { pendientes: 0 } }),
    ),
  ]);

  const abiertos = lotesAbiertos.total;
  const proximas = citas.total;
  const avisosPendientes = (avisos as { total?: number }).total ?? 0;

  return { abiertos, proximas, avisosPendientes, tareasPendientes: tareas.resumen.pendientes };
}

export function MedicoDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: metricas,
    refetchInterval: 30_000,
  });

  const { data: pendientes } = useQuery({
    queryKey: ["pendientes-resumen"],
    queryFn: () => api<PendientesResumen>("GET", "/planificacion/pendientes-resumen"),
    refetchInterval: 15_000,
  });

  const [filtroLote, setFiltroLote] = useState<LoteEstado | "">("");
  const [paginaLotes, setPaginaLotes] = useState(1);

  const { data: lotes } = useQuery({
    queryKey: ["lotes", filtroLote, paginaLotes],
    queryFn: () =>
      api<Paginated<Lote>>(
        "GET",
        `/planificacion/lotes?${filtroLote ? `estado=${filtroLote}&` : ""}pagina=${paginaLotes}&limite=10`,
      ),
  });

  const generar = useMutation({
    mutationFn: () =>
      api<{ loteId: string; propuestas: number; sinCupo: string[] }>("POST", "/planificacion/lotes"),
    onSuccess: (res) => {
      toast.success(
        `Lote generado con ${res.propuestas} propuestas${
          res.sinCupo.length > 0 ? ` y ${res.sinCupo.length} sin cupo` : ""
        }`,
      );
      queryClient.invalidateQueries({ queryKey: ["lotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["pendientes-resumen"] });
      queryClient.invalidateQueries({ queryKey: ["layout-resumen"] });
      navigate(`/medico/lotes/${res.loteId}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el lote");
    },
  });

  const totalPendientes = pendientes?.total ?? 0;

  const tarjetas = [
    {
      label: "Pacientes por Planificar",
      valor: totalPendientes,
      icono: Users,
      colorIcon: totalPendientes > 0 ? "text-hemato-crimson bg-red-50 border-red-200" : "text-slate-600 bg-slate-50 border-slate-200",
      destacado: totalPendientes > 0,
      subtexto:
        totalPendientes > 0
          ? `${pendientes?.rojas ?? 0} ROJA · ${pendientes?.amarillas ?? 0} AMARILLA · ${pendientes?.verdes ?? 0} VERDE`
          : "Cohorte al día",
    },
    {
      label: "Lotes Pendientes",
      valor: data?.abiertos ?? 0,
      icono: Layers,
      colorIcon: "text-warning-amber bg-amber-50 border-amber-200",
      destacado: (data?.abiertos ?? 0) > 0,
      subtexto: (data?.abiertos ?? 0) > 0 ? "Requiere auditoría" : "Sin pendientes",
    },
    {
      label: "Citas en 7 días",
      valor: data?.proximas ?? 0,
      icono: CalendarDays,
      colorIcon: "text-tech-blue bg-sky-50 border-sky-200",
      destacado: false,
      subtexto: "Programadas",
    },
    {
      label: "Avisos por Enviar",
      valor: data?.avisosPendientes ?? 0,
      icono: Hospital,
      colorIcon: "text-success-green bg-emerald-50 border-emerald-200",
      destacado: (data?.avisosPendientes ?? 0) > 0,
      subtexto: "Notificaciones del bot (cada 60 s)",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-deep-slate">
            Bandeja Clínica
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="crimson"
            size="sm"
            className="gap-2 font-semibold cursor-pointer shadow-xs"
            onClick={() => generar.mutate()}
            disabled={generar.isPending || (pendientes?.hayLoteAbierto ?? false)}
          >
            <Sparkles className="h-4 w-4" />
            {generar.isPending
              ? "Generando…"
              : pendientes?.hayLoteAbierto
                ? "Lote Abierto Pendiente"
                : totalPendientes > 0
                  ? `Generar Lote (${totalPendientes} en espera)`
                  : "Generar Lote"}
          </Button>
          <Link to="/medico/agenda">
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
              <CalendarDays className="h-4 w-4 text-tech-blue" />
              Agenda
            </Button>
          </Link>
          <Link to="/medico/pacientes">
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
              <Users className="h-4 w-4 text-slate-500" />
              Pacientes
            </Button>
          </Link>
        </div>
      </div>

      {/* Banner de Estado Inteligente / Indicador de Planificación */}
      {pendientes?.hayLoteAbierto ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning-amber shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                Tienes 1 lote de planificación pendiente de auditoría
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Debes aprobar o rechazar la propuesta actual antes de generar un nuevo lote.
              </p>
            </div>
          </div>
          {pendientes.loteAbiertoId && (
            <Link to={`/medico/lotes/${pendientes.loteAbiertoId}`}>
              <Button size="sm" variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100/60 font-semibold text-xs whitespace-nowrap cursor-pointer">
                Auditar Lote Pendiente <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      ) : totalPendientes > 0 ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-tech-blue shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-900">
                {totalPendientes} paciente(s) activos en espera de asignación de cita
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Composición: <span className="font-semibold text-hemato-crimson">{pendientes?.rojas ?? 0} de alta prioridad (ROJA)</span>, {pendientes?.amarillas ?? 0} AMARILLAS y {pendientes?.verdes ?? 0} VERDES. Haz clic en "Generar Lote" para planificar sus cupos en consultorio.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="crimson"
            onClick={() => generar.mutate()}
            disabled={generar.isPending}
            className="font-semibold text-xs whitespace-nowrap self-start sm:self-auto cursor-pointer shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Generar Lote Ahora
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-center gap-3 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-success-green shrink-0" />
          <span>
            <strong>Cohorte al día:</strong> Todos los pacientes activos tienen cita agendada. Genera un nuevo lote cuando ingresen nuevos pacientes a la cohorte o cuando un paciente requiera reprogramación tras inasistencia.
          </span>
        </div>
      )}

      {/* Grid de Métricas Principales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tarjetas.map((t) => {
          const Icono = t.icono;
          return (
            <Card
              key={t.label}
              className={`border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-slate-300 ${
                t.destacado ? "ring-1 ring-warning-amber/30 border-warning-amber/50" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">{t.label}</span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${t.colorIcon}`}>
                  <Icono className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-2xl font-bold text-deep-slate">{t.valor}</p>
                <span className="text-[11px] font-medium text-slate-500 mt-1 block">
                  {t.subtexto}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Tabla de Lotes de Planificación */}
      <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
        <CardHeader className="border-b border-slate-100 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-bold text-deep-slate">
                Lotes de Propuestas
              </CardTitle>
              <select
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 focus:outline-hidden"
                value={filtroLote}
                onChange={(e) => {
                  setFiltroLote(e.target.value as LoteEstado | "");
                  setPaginaLotes(1);
                }}
              >
                <option value="">Todos los estados</option>
                <option value="ABIERTO">Solo Pendientes</option>
                <option value="APROBADO">Solo Aprobados</option>
                <option value="RECHAZADO">Solo Rechazados</option>
              </select>
            </div>

            {(data?.abiertos ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                <Clock className="h-3.5 w-3.5" />
                {data?.abiertos} lote(s) pendientes
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-b border-slate-200">
                <TableHead className="py-3 px-4 font-semibold text-slate-700">Identificador</TableHead>
                <TableHead className="py-3 px-4 font-semibold text-slate-700">Fecha de Generación</TableHead>
                <TableHead className="py-3 px-4 font-semibold text-slate-700">Estado</TableHead>
                <TableHead className="py-3 px-4 font-semibold text-slate-700 text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotes?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-medium">No se encontraron lotes de planificación</p>
                  </TableCell>
                </TableRow>
              )}
              {lotes?.items.map((lote) => (
                <TableRow
                  key={lote.id}
                  className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
                >
                  <TableCell className="py-3.5 px-4 font-mono font-bold text-xs text-deep-slate">
                    {lote.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-xs text-slate-600">
                    {format(new Date(lote.generadoEn), "dd/MM/yyyy · HH:mm", { locale: es })}
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                        lote.estado === "ABIERTO"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : lote.estado === "APROBADO"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {lote.estado === "ABIERTO" ? "Pendiente" : lote.estado}
                    </span>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <Link to={`/medico/lotes/${lote.id}`}>
                      <Button
                        size="sm"
                        variant={lote.estado === "ABIERTO" ? "crimson" : "outline"}
                        className="gap-1.5 text-xs h-8 cursor-pointer"
                      >
                        {lote.estado === "ABIERTO" ? (
                          <>
                            Auditar Propuesta <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            Ver Detalle <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>

        <Paginacion
          pagina={paginaLotes}
          limite={10}
          total={lotes?.total ?? 0}
          onPagina={setPaginaLotes}
        />
      </Card>
    </div>
  );
}
