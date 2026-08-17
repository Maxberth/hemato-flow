import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import type { CupoDiaWeb, HorarioMedicoWeb, Paginated, Profesional } from "@/lib/types";
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
import { Paginacion } from "@/components/Paginacion";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CupoEditable {
  fecha: string;
  cantidad: number;
  camillas: number;
}

/** Cupos del servicio: Ambulatorio (CupoDiario) y Horario Médico (consulta). */
export function MedicoCupos() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"ambulatorio" | "horario">("ambulatorio");
  const [desde] = useState(() => new Date());
  const hasta = addDays(desde, 60);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(14);

  // ── Tab Ambulatorio ──
  const { data: cupos } = useQuery({
    queryKey: ["cupos", iso(desde), iso(hasta)],
    queryFn: () => api<CupoDiaWeb[]>("GET", `/cupos?desde=${iso(desde)}&hasta=${iso(hasta)}`),
  });
  const [borrador, setBorrador] = useState<Record<string, CupoEditable>>({});
  useEffect(() => {
    if (!cupos) return;
    const nuevo: Record<string, CupoEditable> = {};
    for (const d of cupos) nuevo[d.fecha] = { fecha: d.fecha, cantidad: d.cantidad, camillas: d.camillas };
    setBorrador((prev) => (Object.keys(prev).length === 0 ? nuevo : prev));
  }, [cupos]);

  const guardarCupo = useMutation({
    mutationFn: (d: CupoEditable) => api("PUT", "/cupos", { fecha: d.fecha, cantidad: d.cantidad, camillas: d.camillas }),
    onSuccess: () => {
      toast.success("Cupo del día actualizado");
      queryClient.invalidateQueries({ queryKey: ["cupos"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al guardar"),
  });

  // ── Tab Horario Médico ──
  const { data: profesionales } = useQuery({
    queryKey: ["profesionales"],
    queryFn: () => api<Paginated<Profesional>>("GET", "/profesionales"),
  });
  const { data: horarios } = useQuery({
    queryKey: ["horario-medico", iso(desde), iso(hasta)],
    queryFn: () => api<HorarioMedicoWeb[]>("GET", `/horario-medico?desde=${iso(desde)}&hasta=${iso(hasta)}`),
  });
  const [horarioDraft, setHorarioDraft] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!horarios) return;
    const nuevo: Record<string, number> = {};
    for (const h of horarios) nuevo[`${h.profesionalId}|${h.fecha}`] = h.cupo;
    setHorarioDraft((prev) => (Object.keys(prev).length === 0 ? nuevo : prev));
  }, [horarios]);

  const guardarHorario = useMutation({
    mutationFn: ({ profesionalId, fecha, cupo }: { profesionalId: string; fecha: string; cupo: number }) =>
      api("PUT", `/horario-medico/${profesionalId}/${fecha}`, { cupo }),
    onSuccess: () => {
      toast.success("Horario médico actualizado");
      queryClient.invalidateQueries({ queryKey: ["horario-medico"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al guardar"),
  });

  // Días hábiles del horizonte (L-V) para las matrices.
  const diasHabiles: string[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const d = addDays(desde, i);
    const s = iso(d);
    if (d.getDay() !== 0 && d.getDay() !== 6) diasHabiles.push(s);
  }

  const cuposLista = cupos ?? [];
  const cuposPagina = cuposLista.slice((pagina - 1) * limite, pagina * limite);
  const diasConCupo = cuposLista.filter((c) => c.cantidad > 0).length;
  const camillasTotales = cuposLista.reduce((acc, c) => acc + (c.camillas ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-deep-slate">Cupos del Servicio</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cupos ambulatorios por día y horarios de consulta por médico.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setTab("ambulatorio")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              tab === "ambulatorio" ? "bg-white text-tech-blue shadow-xs" : "text-slate-600 hover:text-deep-slate"
            }`}
          >
            Ambulatorio
          </button>
          <button
            onClick={() => setTab("horario")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              tab === "horario" ? "bg-white text-tech-blue shadow-xs" : "text-slate-600 hover:text-deep-slate"
            }`}
          >
            Horario Médico
          </button>
        </div>
      </div>

      {tab === "ambulatorio" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border-slate-200 bg-white p-4">
              <span className="text-xs font-semibold text-slate-400">Horizonte</span>
              <p className="text-2xl font-bold text-deep-slate mt-1">{cuposLista.length} días</p>
              <span className="text-[11px] text-slate-500">Con cupo configurado</span>
            </Card>
            <Card className="border-slate-200 bg-white p-4">
              <span className="text-xs font-semibold text-slate-400">Días con atención</span>
              <p className="text-2xl font-bold text-tech-blue mt-1">{diasConCupo} días</p>
              <span className="text-[11px] text-slate-500">cantidad &gt; 0</span>
            </Card>
            <Card className="border-slate-200 bg-white p-4">
              <span className="text-xs font-semibold text-slate-400">Camillas totales</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{camillasTotales}</p>
              <span className="text-[11px] text-slate-500">En el horizonte</span>
            </Card>
            <Card className="border-slate-200 bg-white p-4">
              <span className="text-xs font-semibold text-slate-400">Cupo por día</span>
              <p className="text-2xl font-bold text-deep-slate mt-1">{cuposLista[0]?.cantidad ?? 0}</p>
              <span className="text-[11px] text-slate-500">Posiciones diarias</span>
            </Card>
          </div>

          <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-bold text-deep-slate">
                Cupos Ambulatorios por Día
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Cantidad de posiciones y camillas habilitadas por día. Guardar aplica por día.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Día y Fecha</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Cupos (cantidad)</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700">Camillas</TableHead>
                    <TableHead className="py-3 px-4 font-semibold text-slate-700 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuposPagina.map((d) => {
                    const borradorDia = borrador[d.fecha] ?? { ...d, fecha: d.fecha };
                    return (
                      <TableRow key={d.fecha} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                        <TableCell className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-deep-slate text-sm">
                              {format(new Date(`${d.fecha}T00:00:00`), "EEEE dd 'de' MMMM", { locale: es })}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">{d.fecha}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <Input
                            type="number"
                            min={0}
                            max={500}
                            value={borradorDia.cantidad}
                            onChange={(e) =>
                              setBorrador((b) => ({
                                ...b,
                                [d.fecha]: { ...borradorDia, cantidad: Number(e.target.value) },
                              }))
                            }
                            className="h-8 w-24 text-xs text-center bg-white font-semibold"
                          />
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <Input
                            type="number"
                            min={0}
                            max={50}
                            value={borradorDia.camillas}
                            onChange={(e) =>
                              setBorrador((b) => ({
                                ...b,
                                [d.fecha]: { ...borradorDia, camillas: Number(e.target.value) },
                              }))
                            }
                            className="h-8 w-24 text-xs text-center bg-white font-semibold"
                          />
                        </TableCell>
                        <TableCell className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => guardarCupo.mutate(borradorDia)}
                            disabled={guardarCupo.isPending}
                            className="gap-1.5 cursor-pointer"
                          >
                            <Save className="h-3.5 w-3.5" /> Guardar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {cuposPagina.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-sm text-slate-400">
                        Sin cupos configurados en el horizonte.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
            <Paginacion pagina={pagina} limite={limite} total={cuposLista.length} onPagina={setPagina} onLimite={setLimite} />
          </Card>
        </>
      ) : (
        <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-base font-bold text-deep-slate">Horario Médico por Doctor</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Cupos de consulta por médico y día (el motor asigna el doctor con más cupo).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="border-b border-slate-200">
                  <TableHead className="py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10">
                    Doctor / Día
                  </TableHead>
                  {diasHabiles.slice(0, 14).map((fecha) => (
                    <TableHead key={fecha} className="py-3 px-2 font-semibold text-slate-700 text-center whitespace-nowrap">
                      {format(new Date(`${fecha}T00:00:00`), "dd MMM", { locale: es })}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profesionales?.items ?? []).map((prof) => (
                  <TableRow key={prof.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                    <TableCell className="py-3 px-4 font-semibold text-deep-slate text-sm sticky left-0 bg-white z-10">
                      {prof.nombre}
                    </TableCell>
                    {diasHabiles.slice(0, 14).map((fecha) => {
                      const clave = `${prof.id}|${fecha}`;
                      const cupo = horarioDraft[clave] ?? 0;
                      return (
                        <TableCell key={fecha} className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={cupo}
                              onChange={(e) =>
                                setHorarioDraft((b) => ({ ...b, [clave]: Number(e.target.value) }))
                              }
                              className="h-7 w-14 text-xs text-center bg-white font-semibold"
                            />
                            <button
                              onClick={() => guardarHorario.mutate({ profesionalId: prof.id, fecha, cupo })}
                              disabled={guardarHorario.isPending}
                              title="Guardar cupo"
                              className="rounded-md p-1 text-tech-blue hover:bg-sky-50 cursor-pointer disabled:opacity-50"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {(profesionales?.items ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={15} className="py-10 text-center text-sm text-slate-400">
                      Sin profesionales registrados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default MedicoCupos;
