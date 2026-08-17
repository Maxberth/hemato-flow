import { useState, useMemo, lazy, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Search,
  CalendarRange,
  Table as TableIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import type { LoteDetalle } from "@/lib/types";
import { Paginacion } from "@/components/Paginacion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EtiquetaBadge, BandaBadge, EstadoBadge } from "@/lib/ui";

/** Cronograma (vis-timeline) cargado lazy: chunk aparte, solo al abrir un lote. */
const CronogramaLote = lazy(() => import("@/components/CronogramaLote"));

export function MedicoLote() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogo, setDialogo] = useState<"aprobar" | "rechazar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<string>("");
  const [vista, setVista] = useState<"cronograma" | "tabla">("cronograma");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(25);

  const { data: lote, isLoading } = useQuery({
    queryKey: ["lote", id],
    queryFn: () => api<LoteDetalle>("GET", `/planificacion/lotes/${id}`),
  });

  const decidir = useMutation({
    mutationFn: async (accion: "aprobar" | "rechazar") => {
      if (accion === "aprobar") {
        return api("POST", `/planificacion/lotes/${id}/aprobar`);
      }
      return api("POST", `/planificacion/lotes/${id}/rechazar`, {
        motivo: motivo || undefined,
      });
    },
    onSuccess: (_, accion) => {
      toast.success(
        accion === "aprobar"
          ? "Lote aprobado. Citas confirmadas y avisos encolados al paciente."
          : "Lote rechazado correctamente.",
      );
      setDialogo(null);
      setMotivo("");
      queryClient.invalidateQueries({ queryKey: ["lote"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate("/medico");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al procesar decisión médica");
    },
  });

  const propuestasFiltradas = useMemo(() => {
    if (!lote?.propuestas) return [];
    return lote.propuestas.filter((p) => {
      const coincideTexto = p.nombres.toLowerCase().includes(busqueda.toLowerCase());
      const coincideEtiqueta = !filtroEtiqueta || p.justificacion?.prioridad === filtroEtiqueta;
      return coincideTexto && coincideEtiqueta;
    });
  }, [lote, busqueda, filtroEtiqueta]);
  const propuestasPagina = propuestasFiltradas.slice((pagina - 1) * limite, pagina * limite);

  if (isLoading || !lote) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm font-medium text-slate-500">Cargando lote…</p>
      </div>
    );
  }

  const sinCupo = (lote.sinCupo ?? []) as string[];
  const rojas = lote.propuestas.filter((p) => p.justificacion?.prioridad === "ROJA").length;
  const distantes = lote.propuestas.filter((p) => p.banda === "DISTANTE").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Navegación y Encabezado del Lote */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <Link
            to="/medico"
            className="inline-flex items-center gap-1 text-xs font-semibold text-tech-blue hover:text-tech-blue-hover mb-1.5 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Bandeja
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-deep-slate">
              Auditoría de Lote #{lote.id.slice(0, 8)}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                lote.estado === "ABIERTO"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : lote.estado === "APROBADO"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-600"
              }`}
            >
              {lote.estado === "ABIERTO" ? "Pendiente de Decisión" : lote.estado}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              · {format(new Date(lote.generadoEn), "dd/MM/yyyy HH:mm", { locale: es })}
            </span>
          </div>
        </div>

        {lote.estado === "ABIERTO" && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="default"
              onClick={() => setDialogo("rechazar")}
              className="border-red-200 text-hemato-crimson hover:bg-red-50 cursor-pointer"
            >
              <XCircle className="h-4 w-4 mr-1.5" /> Rechazar Lote
            </Button>
            <Button
              variant="crimson"
              size="default"
              onClick={() => setDialogo("aprobar")}
              disabled={decidir.isPending || lote.propuestas.length === 0}
              className="gap-1.5 cursor-pointer shadow-xs"
            >
              <CheckCircle2 className="h-4 w-4" /> Aprobar Lote Clínico ({lote.propuestas.length})
            </Button>
          </div>
        )}
      </div>

      {/* Tarjetas Resumen de la Propuesta */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-xs font-semibold text-slate-400">Total Propuestas</span>
          <p className="text-2xl font-bold text-deep-slate mt-0.5">{lote.propuestas.length}</p>
          <span className="text-[11px] text-slate-500">Cupos asignados</span>
        </Card>
        <Card className="border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-xs font-semibold text-slate-400">Prioridad ROJA</span>
          <p className="text-2xl font-bold text-hemato-crimson mt-0.5">{rojas}</p>
          <span className="text-[11px] text-slate-500">Máxima urgencia</span>
        </Card>
        <Card className="border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-xs font-semibold text-slate-400">Zonas Distantes</span>
          <p className="text-2xl font-bold text-tech-blue mt-0.5">{distantes}</p>
          <span className="text-[11px] text-slate-500">Lead viaje 3+ días</span>
        </Card>
        <Card className="border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-xs font-semibold text-slate-400">Sin Cupo</span>
          <p className={`text-2xl font-bold mt-0.5 ${sinCupo.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {sinCupo.length}
          </p>
          <span className="text-[11px] text-slate-500">Fuera de capacidad</span>
        </Card>
      </div>

      {/* Alerta si hay Pacientes Sin Cupo */}
      {sinCupo.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning-amber shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                {sinCupo.length} paciente(s) no encontraron cupo en el horizonte disponible
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                La regla determinista de cero sobrecupo protegió la agenda. Se mantendrán en la cohorte para el próximo ciclo.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Contenedor Principal de Propuestas: Cronograma o Tabla */}
      <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
        <CardHeader className="border-b border-slate-100 p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold text-deep-slate">
              Detalle de Propuestas
            </CardTitle>

            {/* Barra de Filtros Rápidos y Selector de Vista */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
                <button
                  onClick={() => setVista("cronograma")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                    vista === "cronograma"
                      ? "bg-white text-tech-blue shadow-xs"
                      : "text-slate-600 hover:text-deep-slate",
                  )}
                >
                  <CalendarRange className="h-3.5 w-3.5" /> Cronograma
                </button>
                <button
                  onClick={() => setVista("tabla")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                    vista === "tabla"
                      ? "bg-white text-tech-blue shadow-xs"
                      : "text-slate-600 hover:text-deep-slate",
                  )}
                >
                  <TableIcon className="h-3.5 w-3.5" /> Tabla
                </button>
              </div>

              <div className="relative w-48 sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Buscar paciente…"
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                  className="h-8 pl-8 text-xs bg-slate-50 border-slate-200"
                />
              </div>

              <select
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 focus:outline-hidden"
                value={filtroEtiqueta}
                onChange={(e) => { setFiltroEtiqueta(e.target.value); setPagina(1); }}
              >
                <option value="">Todas las prioridades</option>
                <option value="ROJA">ROJA</option>
                <option value="AMARILLA">AMARILLA</option>
                <option value="VERDE">VERDE</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {propuestasFiltradas.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-center text-slate-400">
              <p className="text-sm font-medium">
                {lote.estado === "RECHAZADO"
                  ? "Lote rechazado: las propuestas fueron descartadas"
                  : "No hay propuestas que coincidan con los filtros"}
              </p>
            </div>
          ) : vista === "cronograma" ? (
            <Suspense
              fallback={
                <div className="flex h-64 items-center justify-center text-sm font-medium text-slate-400">
                  Cargando cronograma…
                </div>
              }
            >
              <CronogramaLote
                propuestas={propuestasFiltradas}
                horasApertura={lote.horasApertura ?? "08:00"}
                citasOtras={lote.citasOtras ?? []}
              />
            </Suspense>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Paciente</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Prioridad</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Servicio</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Estado</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Fecha</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Turno</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Hora de cita</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Doctor</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Banda Geográfica</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Lead Viaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propuestasPagina.map((p) => (
                    <TableRow key={p.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                      <TableCell className="py-3.5 px-4 font-semibold text-deep-slate text-sm">
                        {p.nombres}
                      </TableCell>
                      <TableCell className="py-3.5 px-4">
                        <EtiquetaBadge etiqueta={p.justificacion?.prioridad ?? "VERDE"} />
                      </TableCell>
                      <TableCell className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-xs font-semibold text-slate-700">{p.servicio}</span>
                        <span className="ml-1.5 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.2 text-[11px] font-mono font-bold text-slate-600">
                          {p.duracionMin}m
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 px-4">
                        <EstadoBadge estado={p.estado} />
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm text-slate-700 font-medium whitespace-nowrap">
                        {format(new Date(`${p.fecha.slice(0, 10)}T00:00:00`), "EEEE dd 'de' MMMM", { locale: es })}
                      </TableCell>
                      <TableCell className="py-3.5 px-4">
                        <span className="rounded bg-tech-blue/10 border border-tech-blue/20 px-2 py-0.5 text-xs font-mono font-bold text-tech-blue">
                          #{p.turno ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 px-4">
                        <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                          {p.horaEstimada ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 px-4">
                        <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                          {p.servicio === "CONSULTA" ? (p.doctor ?? "—") : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 px-4">
                        <BandaBadge banda={p.banda} />
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-xs font-semibold text-slate-600">
                        +{p.justificacion?.leadDias ?? "0"} días
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {vista === "tabla" && (
          <Paginacion
            pagina={pagina}
            limite={limite}
            total={propuestasFiltradas.length}
            onPagina={setPagina}
            onLimite={setLimite}
          />
        )}
      </Card>

      {/* Modal de Aprobación de Lote */}
      <Dialog open={dialogo === "aprobar"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl border border-slate-200">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200 text-success-green mb-2">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-deep-slate">
              Confirmar Aprobación del Lote
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed">
              Al aprobar, las <strong>{lote.propuestas.length} propuestas</strong> pasarán inmediatamente al estado <strong>PROGRAMADA</strong> en la agenda del consultorio y el agente de IA encolará las notificaciones hacia WhatsApp/Telegram respetando los tiempos de anticipación por distancia.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200">
            <p className="font-semibold text-deep-slate flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-tech-blue" />
              Auditoría Médica Registrada
            </p>
            <p className="mt-1 text-slate-500">
              Esta acción queda registrada de manera inmutable con tu firma de usuario en el servidor.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button
              variant="crimson"
              onClick={() => decidir.mutate("aprobar")}
              disabled={decidir.isPending}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> Aprobar y Encolar Avisos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Rechazo de Lote */}
      <Dialog open={dialogo === "rechazar"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl border border-slate-200">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 border border-red-200 text-hemato-crimson mb-2">
              <XCircle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-deep-slate">
              Rechazar Lote de Planificación
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Las propuestas se descartarán sin alterar la agenda ni enviar mensajes a los pacientes. Los pacientes se mantendrán en la cohorte para el próximo ciclo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label htmlFor="motivo" className="text-xs font-semibold text-slate-700">
              Motivo del Rechazo Clínico (Opcional)
            </Label>
            <Input
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Cambio imprevisto de capacidad médica en consultorio 2"
              className="h-10 text-xs bg-slate-50"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => decidir.mutate("rechazar")}
              disabled={decidir.isPending}
            >
              Confirmar Rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
