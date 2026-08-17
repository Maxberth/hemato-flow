import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, DoorOpen, Play, Check, LogOut, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { DiaAmbulatorio, EventoCamillaWeb, CamillaEstado } from "@/lib/types";
import { EstadoBadge } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function duracionTexto(ms: number): string {
  const seg = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(seg / 3600);
  const mm = Math.floor((seg % 3600) / 60);
  const ss = seg % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const ESTADO_CAMILLA_CLASE: Record<CamillaEstado, string> = {
  LIBRE: "border-emerald-200 bg-emerald-50/60",
  OCUPADA: "border-tech-blue/40 bg-sky-50",
  PREPARACION: "border-amber-200 bg-amber-50/70",
};

const ESTADO_CAMILLA_LABEL: Record<CamillaEstado, string> = {
  LIBRE: "Libre",
  OCUPADA: "Ocupada",
  PREPARACION: "En preparación",
};

/** Reloj en vivo del estado actual de una camilla (tick 1 s). */
function Cronometro({ estadoDesde }: { estadoDesde: string }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-mono tabular-nums">{duracionTexto(ahora - new Date(estadoDesde).getTime())}</span>;
}

interface PacienteCorto {
  id: string;
  nombres: string;
  tipoProcedimiento?: { duracionMin: number } | null;
}

export function AmbulatorioDia() {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(() => iso(new Date()));
  const [ocupando, setOcupando] = useState<{ camillaId: string; numero: number } | null>(null);
  const [citaSeleccionada, setCitaSeleccionada] = useState<string>("");
  const [busquedaWalkIn, setBusquedaWalkIn] = useState("");
  const [walkInSeleccionado, setWalkInSeleccionado] = useState<PacienteCorto | null>(null);
  const [horaPreferidaModal, setHoraPreferidaModal] = useState("");

  const { data: dia, isFetching } = useQuery({
    queryKey: ["ambulatorio", fecha],
    queryFn: () => api<DiaAmbulatorio>("GET", `/ambulatorio/dia?fecha=${fecha}`),
    refetchInterval: 15_000,
  });

  const { data: historial } = useQuery({
    queryKey: ["ambulatorio-historial", fecha],
    queryFn: () => api<EventoCamillaWeb[]>("GET", `/ambulatorio/historial?fecha=${fecha}`),
  });

  const { data: walkInCandidatos } = useQuery({
    queryKey: ["pacientes-walkin", busquedaWalkIn],
    queryFn: () =>
      api<{ items: PacienteCorto[] }>(
        "GET",
        `/pacientes?q=${encodeURIComponent(busquedaWalkIn)}&pagina=1&limite=8`,
      ),
    enabled: busquedaWalkIn.trim().length > 0,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["ambulatorio"] });
    queryClient.invalidateQueries({ queryKey: ["ambulatorio-historial"] });
    queryClient.invalidateQueries({ queryKey: ["citas"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const abrirDia = useMutation({
    mutationFn: () => api("POST", "/ambulatorio/dia/abrir", { fecha }),
    onSuccess: () => {
      toast.success("Día abierto: camillas creadas");
      invalidar();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al abrir el día"),
  });

  const ocupar = useMutation({
    mutationFn: ({ camillaId, citaId, pacienteId }: { camillaId: string; citaId?: string; pacienteId?: string }) =>
      api<{ noLlegos: string[] }>("POST", `/ambulatorio/camillas/${camillaId}/ocupar`, {
        ...(citaId ? { citaId } : {}),
        ...(pacienteId ? { pacienteId } : {}),
      }),
    onSuccess: (res) => {
      if (res.noLlegos.length > 0) {
        toast.warning(`${res.noLlegos.length} paciente(s) marcados NO LLEGÓ por saltarse el turno`);
      } else {
        toast.success("Paciente en camilla (EN ATENCIÓN)");
      }
      setOcupando(null);
      setCitaSeleccionada("");
      setWalkInSeleccionado(null);
      invalidar();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo ocupar la camilla"),
  });

  const retirar = useMutation({
    mutationFn: (camillaId: string) => api("POST", `/ambulatorio/camillas/${camillaId}/retirar`),
    onSuccess: () => {
      toast.success("Paciente retirado — cita marcada ASISTIDA, camilla en preparación");
      invalidar();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al retirar"),
  });

  const listo = useMutation({
    mutationFn: (camillaId: string) => api("POST", `/ambulatorio/camillas/${camillaId}/listo`),
    onSuccess: () => {
      toast.success("Camilla lista (LIBRE)");
      invalidar();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al marcar lista"),
  });

  const camillas = dia?.camillas ?? [];
  const citas = useMemo(() => (dia?.citas ?? []).slice().sort((a, b) => (a.turno ?? 999) - (b.turno ?? 999)), [dia]);

  const pendientes = citas.filter((c) => c.estado === "PROGRAMADA" || c.estado === "CONFIRMADA");
  const siguiente = pendientes[0];

  const abrirModal = (camillaId: string, numero: number) => {
    setOcupando({ camillaId, numero });
    setCitaSeleccionada(siguiente?.id ?? "");
    setWalkInSeleccionado(null);
    setHoraPreferidaModal("");
    setBusquedaWalkIn("");
  };

  const guardarHoraPreferida = (pacienteId: string, hora: string) =>
    api("POST", `/pacientes/${pacienteId}/hora-preferida`, { horaPreferida: hora }).catch(() => {
      toast.error("No se pudo guardar la hora preferida");
    });

  const confirmarOcupar = () => {
    if (!ocupando) return;
    if (walkInSeleccionado) {
      ocupar.mutate({ camillaId: ocupando.camillaId, pacienteId: walkInSeleccionado.id });
      if (horaPreferidaModal) void guardarHoraPreferida(walkInSeleccionado.id, horaPreferidaModal);
    } else if (citaSeleccionada) {
      ocupar.mutate({ camillaId: ocupando.camillaId, citaId: citaSeleccionada });
      const pacienteId = citas.find((c) => c.id === citaSeleccionada)?.pacienteId;
      if (pacienteId && horaPreferidaModal) void guardarHoraPreferida(pacienteId, horaPreferidaModal);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-deep-slate">Ambulatorio del Día</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cola viva de turnos y camillas · {format(new Date(`${fecha}T00:00:00`), "EEEE dd 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-9 w-40 text-xs bg-white border-slate-200 shadow-xs"
          />
          <Button
            variant="outline"
            size="default"
            onClick={() => abrirDia.mutate()}
            disabled={abrirDia.isPending || isFetching}
            className="gap-1.5 cursor-pointer shadow-xs"
          >
            <CalendarPlus className="h-4 w-4" /> Abrir Día
          </Button>
        </div>
      </div>

      {dia?.cupo && (
        <p className="text-xs text-slate-500 -mt-1">
          Cupo del día: {dia.cupo.cantidad} posiciones · {dia.cupo.camillas} camillas configuradas
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel izquierdo: cola de turnos */}
        <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-3.5">
            <CardTitle className="text-base font-bold text-deep-slate">Turnos del Día</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Orden de la cola por turno · {pendientes.length} pendiente(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 max-h-[520px] overflow-y-auto">
            {citas.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">Sin citas ambulatorias para este día</div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="py-2 px-3 font-semibold text-slate-700">Turno</TableHead>
                    <TableHead className="py-2 px-3 font-semibold text-slate-700">Paciente</TableHead>
                    <TableHead className="py-2 px-3 font-semibold text-slate-700">Hora de cita</TableHead>
                    <TableHead className="py-2 px-3 font-semibold text-slate-700">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {citas.map((c) => {
                    const esSiguiente = siguiente?.id === c.id;
                    return (
                      <TableRow
                        key={c.id}
                        className={cn(
                          "border-b border-slate-100 transition-colors",
                          esSiguiente && "bg-tech-blue/5",
                        )}
                      >
                        <TableCell className="py-2.5 px-3">
                          <span
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-mono font-bold",
                              esSiguiente
                                ? "bg-tech-blue text-white"
                                : "bg-slate-100 text-slate-600",
                            )}
                          >
                            {c.turno ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <span className="text-sm font-semibold text-deep-slate">{c.nombres}</span>
                          {c.confirmadaEn ? (
                            <span className="ml-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Confirmada
                            </span>
                          ) : (
                            <span className="ml-1.5 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              Sin confirmar
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 font-mono text-xs text-slate-600">
                          {c.horaEstimada ?? "—"}
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <EstadoBadge estado={c.estado} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Panel derecho: camillas */}
        <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-3.5">
            <CardTitle className="text-base font-bold text-deep-slate">Camillas</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {camillas.length === 0
                ? "Abre el día para crear las camillas"
                : `${camillas.filter((c) => c.estado === "LIBRE").length} libre(s) · ${camillas.filter((c) => c.estado === "OCUPADA").length} ocupada(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 max-h-[520px] overflow-y-auto">
            {camillas.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                Sin camillas. Usa "Abrir Día" para crear las del día.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {camillas.map((camilla) => (
                  <div
                    key={camilla.id}
                    className={cn(
                      "rounded-2xl border p-3.5 transition-colors",
                      ESTADO_CAMILLA_CLASE[camilla.estado],
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-deep-slate">Camilla #{camilla.numero}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold",
                          camilla.estado === "LIBRE" && "bg-emerald-100 text-emerald-700",
                          camilla.estado === "OCUPADA" && "bg-tech-blue/15 text-tech-blue",
                          camilla.estado === "PREPARACION" && "bg-amber-100 text-amber-800",
                        )}
                      >
                        {ESTADO_CAMILLA_LABEL[camilla.estado]}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium">
                        {camilla.cita ? camilla.cita.nombres : camilla.estado === "OCUPADA" ? "Paciente sin cita" : "Sin paciente"}
                      </span>
                      {camilla.estado !== "LIBRE" && <Cronometro estadoDesde={camilla.estadoDesde} />}
                    </div>
                    {camilla.cita && (
                      <div className="mt-1 text-[11px] text-slate-400">Turno #{camilla.cita.turno ?? "—"}</div>
                    )}

                    <div className="mt-3 flex gap-2">
                      {camilla.estado === "LIBRE" && (
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5 cursor-pointer"
                          onClick={() => abrirModal(camilla.id, camilla.numero)}
                        >
                          <Play className="h-3.5 w-3.5" /> Ocupar
                        </Button>
                      )}
                      {camilla.estado === "OCUPADA" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5 cursor-pointer"
                          onClick={() => retirar.mutate(camilla.id)}
                          disabled={retirar.isPending}
                        >
                          <LogOut className="h-3.5 w-3.5" /> Retirar
                        </Button>
                      )}
                      {camilla.estado === "PREPARACION" && (
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5 cursor-pointer"
                          onClick={() => listo.mutate(camilla.id)}
                          disabled={listo.isPending}
                        >
                          <Check className="h-3.5 w-3.5" /> Listo
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historial del día */}
      <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
        <CardHeader className="border-b border-slate-100 p-3.5">
          <CardTitle className="text-base font-bold text-deep-slate">Historial de Camillas</CardTitle>
          <CardDescription className="text-xs text-slate-500">Tiempos por evento (libre/preparación/ocupada)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {(historial ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Sin eventos registrados para este día</div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="border-b border-slate-200">
                  <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Camilla</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Paciente</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Estado</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Inicio</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Fin</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Duración</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historial ?? []).map((e) => (
                  <TableRow key={e.id} className="border-b border-slate-100">
                    <TableCell className="py-2.5 px-4 text-xs font-mono font-bold text-slate-600">#{e.numero}</TableCell>
                    <TableCell className="py-2.5 px-4 text-sm text-slate-700">{e.nombres ?? "—"}</TableCell>
                    <TableCell className="py-2.5 px-4">
                      <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {e.estado}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-4 font-mono text-xs text-slate-600">
                      {format(new Date(e.inicio), "HH:mm:ss")}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 font-mono text-xs text-slate-600">
                      {e.fin ? format(new Date(e.fin), "HH:mm:ss") : "—"}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 font-mono text-xs font-bold text-deep-slate">
                      {e.duracionMin !== null ? `${e.duracionMin} min` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Ocupar camilla */}
      <Dialog open={!!ocupando} onOpenChange={(o) => !o && setOcupando(null)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl border border-slate-200">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tech-blue/10 border border-tech-blue/20 text-tech-blue mb-2">
              <DoorOpen className="h-6 w-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-deep-slate">
              Ocupar Camilla #{ocupando?.numero}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed">
              Elige la cita esperada (por defecto el siguiente turno) o un paciente sin cita (walk-in).
              Al ocupar con un turno posterior, los anteriores pendientes se marcan NO LLEGÓ.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Cita del día (turno esperado)</label>
              <select
                value={citaSeleccionada}
                onChange={(e) => {
                  setCitaSeleccionada(e.target.value);
                  setWalkInSeleccionado(null);
                }}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:outline-hidden"
              >
                <option value="">— Seleccionar cita —</option>
                {pendientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Turno #{c.turno ?? "—"} · {c.nombres} ({c.horaEstimada ?? "—"})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold">
              <span className="h-px flex-1 bg-slate-200" /> O walk-in (sin cita) <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Buscar paciente de la cohorte…"
                  value={busquedaWalkIn}
                  onChange={(e) => {
                    setBusquedaWalkIn(e.target.value);
                    setWalkInSeleccionado(null);
                  }}
                  className="h-9 pl-8 text-xs bg-slate-50 border-slate-200"
                />
              </div>
              {busquedaWalkIn.trim().length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {(walkInCandidatos?.items ?? []).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setWalkInSeleccionado(p)}
                      className={cn(
                        "block w-full px-3 py-1.5 text-left text-xs hover:bg-sky-50 cursor-pointer",
                        walkInSeleccionado?.id === p.id && "bg-tech-blue/10 font-semibold text-tech-blue",
                      )}
                    >
                      {p.nombres}
                    </button>
                  ))}
                  {(walkInCandidatos?.items ?? []).length === 0 && (
                    <div className="px-3 py-2 text-[11px] text-slate-400">Sin coincidencias</div>
                  )}
                </div>
              )}
              {walkInSeleccionado && (
                <div className="mt-1.5 rounded-lg bg-tech-blue/10 border border-tech-blue/20 px-2.5 py-1.5 text-xs font-semibold text-tech-blue">
                  Walk-in: {walkInSeleccionado.nombres}
                </div>
              )}
            </div>

            {/* Receta: duración del tratamiento + hora fija que queda guardada */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
              {(() => {
                const citaElegida = citas.find((c) => c.id === citaSeleccionada);
                const duracion =
                  citaElegida?.duracionMin ?? walkInSeleccionado?.tipoProcedimiento?.duracionMin ?? null;
                return (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Receta — duración del tratamiento</span>
                    <span className="font-mono font-bold text-deep-slate">
                      {duracion ? `${Math.floor(duracion / 60)}h ${duracion % 60}m` : "—"}
                    </span>
                  </div>
                );
              })()}
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Hora preferida para futuras citas (opcional)
                </label>
                <Input
                  type="time"
                  value={horaPreferidaModal}
                  onChange={(e) => setHoraPreferidaModal(e.target.value)}
                  className="h-9 text-xs bg-white mt-1 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Se guarda en la ficha del paciente y el motor la respeta en las próximas
                  programaciones, hasta que el doctor lo pase a consulta.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setOcupando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarOcupar}
              disabled={ocupar.isPending || (!citaSeleccionada && !walkInSeleccionado)}
              className="gap-2 cursor-pointer"
            >
              <Play className="h-4 w-4" /> Ocupar Camilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AmbulatorioDia;
