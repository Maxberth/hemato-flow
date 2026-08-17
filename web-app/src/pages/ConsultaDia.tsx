import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, LogIn, Play, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { CitaDiaWeb, GrupoConsultaDia } from "@/lib/types";
import { EstadoBadge } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Orden FCFS: los que llegaron primero arriba; pendientes por turno. */
function ordenarCitas(citas: CitaDiaWeb[]): CitaDiaWeb[] {
  return [...citas].sort((a, b) => {
    const aLlego = a.llegadaEn ? new Date(a.llegadaEn).getTime() : null;
    const bLlego = b.llegadaEn ? new Date(b.llegadaEn).getTime() : null;
    if (aLlego !== null && bLlego !== null) return aLlego - bLlego;
    if (aLlego !== null) return -1;
    if (bLlego !== null) return 1;
    return (a.turno ?? 999) - (b.turno ?? 999);
  });
}

export function ConsultaDia() {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(() => iso(new Date()));
  const [abierto, setAbierto] = useState<string | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["consulta-dia", fecha],
    queryFn: () => api<{ doctores: GrupoConsultaDia[] }>("GET", `/consulta/dia?fecha=${fecha}`),
    refetchInterval: 15_000,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["consulta-dia"] });
    queryClient.invalidateQueries({ queryKey: ["citas"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const llegada = useMutation({
    mutationFn: (citaId: string) => api("POST", `/consulta/citas/${citaId}/llegada`),
    onSuccess: () => {
      toast.success("Check-in registrado (FCFS)");
      invalidar();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error en check-in"),
  });

  const atender = useMutation({
    mutationFn: (citaId: string) =>
      api<{ noLlegos: string[] }>("POST", `/consulta/citas/${citaId}/atender`),
    onSuccess: (res) => {
      if (res.noLlegos.length > 0) {
        toast.warning(`${res.noLlegos.length} paciente(s) marcados NO LLEGÓ por saltarse el turno`);
      } else {
        toast.success("Paciente EN ATENCIÓN");
      }
      invalidar();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al atender"),
  });

  const finalizar = useMutation({
    mutationFn: (citaId: string) => api("POST", `/consulta/citas/${citaId}/finalizar`),
    onSuccess: () => {
      toast.success("Consulta finalizada (ASISTIDA)");
      invalidar();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al finalizar"),
  });

  const doctores = data?.doctores ?? [];
  const totalDia = useMemo(() => doctores.reduce((acc, g) => acc + g.citas.length, 0), [doctores]);
  const pendientesDia = useMemo(
    () =>
      doctores.reduce(
        (acc, g) => acc + g.citas.filter((c) => c.estado === "PROGRAMADA" || c.estado === "CONFIRMADA").length,
        0,
      ),
    [doctores],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-deep-slate">Consultas del Día</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(new Date(`${fecha}T00:00:00`), "EEEE dd 'de' MMMM yyyy", { locale: es })} · {totalDia} citas ·{" "}
            {pendientesDia} pendiente(s)
          </p>
        </div>
        <Input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="h-9 w-40 text-xs bg-white border-slate-200 shadow-xs"
        />
      </div>

      {doctores.length === 0 && !isFetching && (
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardContent className="py-12 text-center text-sm text-slate-400">
            Sin citas de consulta para este día
          </CardContent>
        </Card>
      )}

      {doctores.map((grupo) => {
        const citas = ordenarCitas(grupo.citas);
        const abiertoActivo = abierto === (grupo.doctorId ?? "sin-doctor");
        const pendientes = citas.filter((c) => c.estado === "PROGRAMADA" || c.estado === "CONFIRMADA").length;
        return (
          <Card key={grupo.doctorId ?? "sin-doctor"} className="border-slate-200 bg-white shadow-xs overflow-hidden">
            <button
              onClick={() => setAbierto(abiertoActivo ? null : (grupo.doctorId ?? "sin-doctor"))}
              className="flex w-full items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50/70 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold text-deep-slate">
                  {grupo.doctor ?? "Sin asignar"}
                </span>
                <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {grupo.citas.length} citas
                </span>
                {pendientes > 0 && (
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    {pendientes} pendiente(s)
                  </span>
                )}
              </div>
              <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", abiertoActivo && "rotate-180")} />
            </button>

            {abiertoActivo && (
              <CardContent className="p-0 border-t border-slate-100">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="border-b border-slate-200">
                      <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Turno</TableHead>
                      <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Paciente</TableHead>
                      <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Hora de cita</TableHead>
                      <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Check-in</TableHead>
                      <TableHead className="py-2.5 px-4 font-semibold text-slate-700">Estado</TableHead>
                      <TableHead className="py-2.5 px-4 font-semibold text-slate-700 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {citas.map((c) => {
                      const enAtencion = c.estado === "EN_ATENCION";
                      const pendiente = c.estado === "PROGRAMADA" || c.estado === "CONFIRMADA";
                      return (
                        <TableRow key={c.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                          <TableCell className="py-2.5 px-4">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-mono font-bold text-slate-600">
                              {c.turno ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 px-4 text-sm font-semibold text-deep-slate">
                            {c.nombres}
                          </TableCell>
                          <TableCell className="py-2.5 px-4 font-mono text-xs text-slate-600">
                            {c.horaEstimada ?? "—"}
                          </TableCell>
                          <TableCell className="py-2.5 px-4">
                            {c.llegadaEn ? (
                              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                {format(new Date(c.llegadaEn), "HH:mm")}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Sin check-in</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 px-4">
                            <EstadoBadge estado={c.estado} />
                          </TableCell>
                          <TableCell className="py-2.5 px-4">
                            <div className="flex justify-end gap-1.5">
                              {pendiente && !c.llegadaEn && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => llegada.mutate(c.id)}
                                  disabled={llegada.isPending}
                                  className="gap-1.5 cursor-pointer"
                                >
                                  <LogIn className="h-3.5 w-3.5" /> Llegada
                                </Button>
                              )}
                              {pendiente && (
                                <Button
                                  size="sm"
                                  onClick={() => atender.mutate(c.id)}
                                  disabled={atender.isPending}
                                  className="gap-1.5 cursor-pointer"
                                >
                                  <Play className="h-3.5 w-3.5" /> Atender
                                </Button>
                              )}
                              {enAtencion && (
                                <Button
                                  size="sm"
                                  variant="tech-blue"
                                  onClick={() => finalizar.mutate(c.id)}
                                  disabled={finalizar.isPending}
                                  className="gap-1.5 cursor-pointer"
                                >
                                  <Check className="h-3.5 w-3.5" /> Finalizar
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default ConsultaDia;
