import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createViewMonthGrid } from "@schedule-x/calendar";
import { useCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import "@schedule-x/theme-default/dist/index.css";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  List,
  Search,
  CheckCircle2,
  Clock,
  MapPin,
  Stethoscope,
  DoorOpen,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Cita, CitaEstado, Paginated } from "@/lib/types";
import { Paginacion } from "@/components/Paginacion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EtiquetaBadge, EstadoBadge, BandaBadge } from "@/lib/ui";

const COLORES: Record<CitaEstado, string> = {
  PROPUESTA: "#64748B",
  PROGRAMADA: "#0284C7",
  CONFIRMADA: "#16A34A",
  EN_ATENCION: "#0077C8",
  ASISTIDA: "#0077C8",
  NO_LLEGO: "#C1272D",
  CANCELADA: "#94A3B8",
};

function aEvento(cita: Cita) {
  const fecha = cita.fecha.slice(0, 10);
  const color = COLORES[cita.estado] ?? "#0077C8";
  const hora = cita.horaEstimada ?? "—";
  const titulo = `Turno #${cita.turno ?? "—"} · ${hora} · ${cita.paciente.nombres}`;
  return {
    id: cita.id,
    start: `${fecha} ${hora}`,
    end: `${fecha} ${hora}`,
    title: titulo,
    cita,
    _customContent: {
      monthGrid: `
        <span class="sx-event-chip" style="background:${color}15;color:${color};border:1px solid ${color}35;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:1px 0;box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
          ${titulo}
        </span>`,
    },
  };
}

export function MedicoAgenda() {
  const [vista, setVista] = useState<"calendario" | "lista">("calendario");
  const [seleccion, setSeleccion] = useState<Cita | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);

  // Rango visible del calendario (mes actual)
  const hoy = new Date();
  const [rango, setRango] = useState<{ start: string; end: string }>({
    start: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`,
    end: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${new Date(
      hoy.getFullYear(),
      hoy.getMonth() + 1,
      0,
    ).getDate()}`,
  });

  // Citas del rango visible
  const { data: citas } = useQuery({
    queryKey: ["citas", "agenda", rango.start, rango.end],
    queryFn: () =>
      api<Paginated<Cita>>(
        "GET",
        `/citas?desde=${rango.start}&hasta=${rango.end}&pagina=1&limite=500`,
      ),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
  const citasRango = citas?.items ?? [];

  // Citas de la vista lista (filtros + paginación)
  const paramsLista = new URLSearchParams();
  if (filtroEstado) paramsLista.set("estado", filtroEstado);
  if (busqueda) paramsLista.set("q", busqueda);
  paramsLista.set("pagina", String(pagina));
  paramsLista.set("limite", String(limite));

  const { data: citasLista } = useQuery({
    queryKey: ["citas", "lista", paramsLista.toString()],
    queryFn: () => api<Paginated<Cita>>("GET", `/citas?${paramsLista.toString()}`),
  });

  const citasCalendarioFiltradas = useMemo(() => {
    return citasRango.filter((c) => {
      const coincideEstado = !filtroEstado || c.estado === filtroEstado;
      const coincideTexto =
        !busqueda ||
        c.paciente.nombres.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.tipoProcedimiento.nombre.toLowerCase().includes(busqueda.toLowerCase());
      return coincideEstado && coincideTexto;
    });
  }, [citasRango, filtroEstado, busqueda]);

  const calendarApp = useCalendarApp({
    locale: "es-ES",
    views: [createViewMonthGrid()],
    defaultView: "month-grid",
    callbacks: {
      onRangeUpdate: (rangoNuevo) => setRango(rangoNuevo),
      onEventClick: (evento) => {
        const cita = (evento as unknown as { cita?: Cita }).cita;
        if (cita) setSeleccion(cita);
      },
      onClickPlusEvents: (fecha) => {
        setDiaSeleccionado(fecha);
      },
      onClickDate: (fecha) => {
        const hayCitas = citasCalendarioFiltradas.some((c) => c.fecha.slice(0, 10) === fecha);
        if (hayCitas) {
          setDiaSeleccionado(fecha);
        }
      },
    },
  });

  const eventos = useMemo(() => citasCalendarioFiltradas.map(aEvento), [citasCalendarioFiltradas]);

  useEffect(() => {
    if (!citas) return;
    calendarApp?.events.set(eventos);
  }, [calendarApp, eventos, citas]);

  const citasFiltradas = citasLista?.items ?? [];

  // Citas del día seleccionado para el modal "+ N eventos"
  const citasDelDia = useMemo(() => {
    if (!diaSeleccionado) return [];
    return citasCalendarioFiltradas
      .filter((c) => c.fecha.slice(0, 10) === diaSeleccionado)
      .sort((a, b) => (a.horaEstimada ?? "").localeCompare(b.horaEstimada ?? ""));
  }, [citasCalendarioFiltradas, diaSeleccionado]);

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado y Selector de Vista */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-deep-slate">Agenda Médica</h1>
        </div>

        {/* Switcher de Vista (Calendario vs Lista) */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setVista("calendario")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              vista === "calendario"
                ? "bg-white text-tech-blue shadow-xs"
                : "text-slate-600 hover:text-deep-slate"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Vista Calendario
          </button>
          <button
            onClick={() => setVista("lista")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              vista === "lista"
                ? "bg-white text-tech-blue shadow-xs"
                : "text-slate-600 hover:text-deep-slate"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Vista Lista ({citasLista?.total ?? 0})
          </button>
        </div>
      </div>

      {/* Barra de Filtros Rápidos */}
      <div className="flex flex-wrap items-center gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Buscar por paciente…"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            className="h-8 pl-8 text-xs bg-slate-50 border-slate-200"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => { setFiltroEstado(""); setPagina(1); }}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              filtroEstado === ""
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todas ({citasRango.length})
          </button>
          {(["PROGRAMADA", "CONFIRMADA", "EN_ATENCION", "ASISTIDA", "NO_LLEGO"] as CitaEstado[]).map((est) => {
            const count = citasRango.filter((c) => c.estado === est).length;
            return (
              <button
                key={est}
                onClick={() => { setFiltroEstado(filtroEstado === est ? "" : est); setPagina(1); }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  filtroEstado === est
                    ? "bg-tech-blue text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {est} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido según Vista */}
      {vista === "calendario" ? (
        <Card className="border-slate-200 bg-white shadow-xs p-3 overflow-hidden">
          <div className="agenda-hematoflow-light min-h-[580px]">
            <ScheduleXCalendar calendarApp={calendarApp} />
          </div>
        </Card>
      ) : (
        <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="border-b border-slate-200">
                  <TableHead className="py-3 px-4 font-semibold text-slate-700">Paciente</TableHead>
                  <TableHead className="py-3 px-4 font-semibold text-slate-700">Prioridad</TableHead>
                  <TableHead className="py-3 px-4 font-semibold text-slate-700">Fecha y Hora de cita</TableHead>
                  <TableHead className="py-3 px-4 font-semibold text-slate-700">Servicio</TableHead>
                  <TableHead className="py-3 px-4 font-semibold text-slate-700">Turno</TableHead>
                  <TableHead className="py-3 px-4 font-semibold text-slate-700">Banda</TableHead>
                  <TableHead className="py-3 px-4 font-semibold text-slate-700">Estado Cita</TableHead>
                  <TableHead className="py-3 px-4 font-semibold text-slate-700 text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {citasFiltradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                      <p className="text-sm font-medium">No se encontraron citas con los filtros actuales</p>
                    </TableCell>
                  </TableRow>
                )}
                {citasFiltradas.map((cita) => (
                  <TableRow
                    key={cita.id}
                    onClick={() => setSeleccion(cita)}
                    className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <TableCell className="py-3 px-4 font-semibold text-deep-slate text-sm">
                      {cita.paciente.nombres}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <EtiquetaBadge etiqueta={cita.paciente.etiqueta} />
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm text-slate-700 font-medium whitespace-nowrap">
                      {format(new Date(`${cita.fecha.slice(0, 10)}T00:00:00`), "dd/MM/yyyy", { locale: es })}{" "}
                      <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 ml-1">
                        {cita.horaEstimada ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {cita.servicio} ({cita.duracionMin}m)
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span className="rounded bg-tech-blue/10 border border-tech-blue/20 px-2 py-0.5 text-xs font-mono font-bold text-tech-blue whitespace-nowrap">
                        #{cita.turno ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <BandaBadge banda={cita.paciente.banda} />
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <EstadoBadge estado={cita.estado} />
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSeleccion(cita);
                        }}
                        className="text-xs h-7 px-2.5"
                      >
                        Ver Detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Paginacion
            pagina={pagina}
            limite={limite}
            total={citasLista?.total ?? 0}
            onPagina={setPagina}
            onLimite={setLimite}
          />
        </Card>
      )}

      {/* Modal / Diálogo: Citas de un Día Específico (cuando se hace clic en "+ N eventos") */}
      <Dialog open={!!diaSeleccionado} onOpenChange={(o) => !o && setDiaSeleccionado(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="text-xl font-bold text-deep-slate flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-tech-blue" />
              Citas del {diaSeleccionado ? format(new Date(`${diaSeleccionado}T12:00:00`), "EEEE dd 'de' MMMM, yyyy", { locale: es }) : ""}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {citasDelDia.length} citas programadas para este día de atención. Haz clic en cualquiera para ver su ficha completa.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-2">
            {citasDelDia.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setDiaSeleccionado(null);
                  setSeleccion(c);
                }}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer gap-4 shadow-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="font-mono text-xs font-bold text-tech-blue bg-white border border-slate-200 px-2.5 py-1 rounded-lg shrink-0 shadow-2xs">
                    Turno #{c.turno ?? "—"} · {c.horaEstimada ?? "—"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-deep-slate">
                      {c.paciente.nombres}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {c.servicio} ({c.duracionMin}m) · <span className="font-medium text-slate-600">Banda {c.paciente.banda}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <EtiquetaBadge etiqueta={c.paciente.etiqueta} />
                  <EstadoBadge estado={c.estado} />
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal / Ficha Simplificada y Elegante de Cita */}
      <Dialog open={!!seleccion} onOpenChange={(o) => !o && setSeleccion(null)}>
        <DialogContent className="sm:max-w-lg p-6">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {seleccion && <EstadoBadge estado={seleccion.estado} />}
                {seleccion && <EtiquetaBadge etiqueta={seleccion.paciente.etiqueta} />}
              </div>
            </div>
            <DialogTitle className="text-lg font-bold text-deep-slate mt-2">
              {seleccion?.paciente.nombres}
            </DialogTitle>
          </DialogHeader>

          {seleccion && (
            <div className="space-y-3 pt-2">
              {/* Cuadrícula de Datos Clave (Limpia y sin tarjetas anidadas) */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 font-medium flex items-center gap-1 mb-0.5">
                    <Clock className="h-3.5 w-3.5 text-slate-500" /> Fecha y Hora de cita
                  </span>
                  <p className="font-bold text-deep-slate text-xs capitalize">
                    {format(new Date(`${seleccion.fecha.slice(0, 10)}T00:00:00`), "EEE dd/MM/yyyy", { locale: es })}
                  </p>
                  <p className="font-mono text-tech-blue font-bold">
                    Turno #{seleccion.turno ?? "—"} · {seleccion.horaEstimada ?? "—"} ({seleccion.duracionMin}m)
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 font-medium flex items-center gap-1 mb-0.5">
                    <DoorOpen className="h-3.5 w-3.5 text-slate-500" /> Servicio
                  </span>
                  <p className="font-bold text-deep-slate text-xs">
                    {seleccion.servicio}
                  </p>
                  <p className="text-slate-500">{seleccion.doctor ? seleccion.doctor.nombre : "Ambulatorio"}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 font-medium flex items-center gap-1 mb-0.5">
                    <Stethoscope className="h-3.5 w-3.5 text-slate-500" /> Procedimiento
                  </span>
                  <p className="font-semibold text-deep-slate text-xs">
                    {seleccion.tipoProcedimiento.nombre}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 font-medium flex items-center gap-1 mb-0.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-500" /> Procedencia
                  </span>
                  <div className="mt-0.5">
                    <BandaBadge banda={seleccion.paciente.banda} />
                  </div>
                </div>
              </div>

              {/* Estado de Comunicación / Auditoría */}
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-600">
                <span className="font-bold text-deep-slate block mb-1">Estado de la Cita:</span>
                {seleccion.estado === "PROPUESTA" ? (
                  <p className="text-slate-500">
                    Propuesta generada en lote pendiente de aprobación clínica médica.
                  </p>
                ) : seleccion.confirmadaEn ? (
                  <p className="text-emerald-700 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirmada por el paciente el{" "}
                    {format(new Date(seleccion.confirmadaEn), "dd/MM HH:mm", { locale: es })}
                  </p>
                ) : (
                  <p className="text-slate-500">
                    Avisos encolados por IA para notificación anticipada al paciente.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Estilos para Schedule-X Calendar */}
      <style>{`
        .agenda-hematoflow-light {
          --sx-color-primary: #0077C8;
          --sx-color-primary-container: #E0F2FE;
          --sx-color-on-primary-container: #0077C8;
          --sx-color-background: #FFFFFF;
          --sx-color-surface: #FFFFFF;
          --sx-color-surface-container-low: #F8FAFC;
          --sx-color-surface-container: #F1F5F9;
          --sx-color-surface-container-high: #E2E8F0;
          --sx-color-on-surface: #1A2B3C;
          --sx-color-on-surface-variant: #64748B;
          --sx-color-outline: #E2E8F0;
          --sx-color-outline-variant: #CBD5E1;
        }
        .sx__month-grid-day {
          border-color: #F1F5F9 !important;
          cursor: pointer;
        }
        .sx__month-grid-day:hover {
          background-color: #F8FAFC !important;
        }
        .sx__month-grid-day__header {
          color: #475569 !important;
          font-weight: 600 !important;
        }
      `}</style>
    </div>
  );
}
