import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  PhoneCall,
  AlertTriangle,
  MessageSquareWarning,
  UserX,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Paginated, TareaSocial } from "@/lib/types";
import { Paginacion } from "@/components/Paginacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EtiquetaBadge, BandaBadge } from "@/lib/ui";

export function SocialTareas() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<string>("PENDIENTE");
  const [tipo, setTipo] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [resolviendo, setResolviendo] = useState<TareaSocial | null>(null);
  const [resultado, setResultado] = useState("");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);

  const params = new URLSearchParams();
  if (filtro) params.set("estado", filtro);
  if (tipo) params.set("tipo", tipo);
  if (busqueda) params.set("q", busqueda);
  params.set("pagina", String(pagina));
  params.set("limite", String(limite));

  const { data: tareas, isLoading } = useQuery({
    queryKey: ["tareas", params.toString()],
    queryFn: () =>
      api<
        Paginated<TareaSocial> & {
          resumen: { pendientes: number; enProceso: number; resueltas: number; vencidas: number; total: number };
        }
      >("GET", `/tareas-sociales?${params.toString()}`),
    refetchInterval: 20_000,
  });

  const tomar = useMutation({
    mutationFn: (id: string) => api("POST", `/tareas-sociales/${id}/tomar`),
    onSuccess: () => {
      toast.success("Caso tomado por Trabajo Social. Ya puedes contactar al paciente.");
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al tomar tarea"),
  });

  const resolver = useMutation({
    mutationFn: () => api("POST", `/tareas-sociales/${resolviendo?.id}/resolver`, { resultado }),
    onSuccess: () => {
      toast.success("Gestión social registrada y caso resuelto");
      setResolviendo(null);
      setResultado("");
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al resolver tarea"),
  });

  const lista = tareas?.items ?? [];
  const resumen = tareas?.resumen;
  const pendientesCount = resumen?.pendientes ?? 0;
  const vencidasCount = resumen?.vencidas ?? 0;

  const presetsResultado = [
    "Se coordinó apoyo de pasajes terrestres con gobierno regional / SIS",
    "Familia alojada en albergue de apoyo INSN para la fecha de cita",
    "Contacto telefónico exitoso: Paciente confirma viaje a Lima",
    "Falta por salud intercurrente. Se solicita reprogramación médica",
    "Sin respuesta tras llamadas y mensaje de seguimiento",
  ];

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-2rem)] sm:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)]">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-deep-slate">
            Tareas de Trabajo Social
          </h1>
        </div>
      </div>

      {/* Tarjetas de Resumen SLA */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 shrink-0">
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Tareas Pendientes</span>
          <p className="text-2xl font-bold text-warning-amber mt-1">{pendientesCount}</p>
          <span className="text-[11px] text-slate-500">Por contactar</span>
        </Card>
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Alertas con SLA Vencido</span>
          <p className={`text-2xl font-bold mt-1 ${vencidasCount > 0 ? "text-hemato-crimson" : "text-slate-700"}`}>
            {vencidasCount}
          </p>
          <span className="text-[11px] text-slate-500">Prioridad inmediata</span>
        </Card>
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Total en Bandeja</span>
          <p className="text-2xl font-bold text-deep-slate mt-1">{resumen?.total ?? 0}</p>
          <span className="text-[11px] text-slate-500">Casos activos</span>
        </Card>
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Tiempo Límite SLA</span>
          <p className="text-2xl font-bold text-tech-blue mt-1">24 / 48 hrs</p>
          <span className="text-[11px] text-slate-500">Según banda de distancia</span>
        </Card>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <Card className="border-slate-200 bg-white shadow-xs p-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setFiltro("PENDIENTE"); setPagina(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filtro === "PENDIENTE"
                  ? "bg-warning-amber text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => { setFiltro("EN_PROCESO"); setPagina(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filtro === "EN_PROCESO"
                  ? "bg-tech-blue text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              En Proceso
            </button>
            <button
              onClick={() => { setFiltro("RESUELTA"); setPagina(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filtro === "RESUELTA"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Resueltas
            </button>
            <button
              onClick={() => { setFiltro(""); setPagina(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filtro === ""
                  ? "bg-slate-800 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Todas
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

            <select
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:outline-hidden"
              value={tipo}
              onChange={(e) => { setTipo(e.target.value); setPagina(1); }}
            >
              <option value="">Todos los tipos de alerta</option>
              <option value="SILENCIO">Contacto requerido (sin respuesta / rechazo)</option>
              <option value="INASISTENCIA">Inasistencia (No Llegó)</option>
            </select>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Buscar paciente…"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
              className="h-8 pl-8 text-xs bg-slate-50 border-slate-200"
            />
          </div>
        </div>
      </Card>

      {/* Tabla de Tareas de Trabajo Social */}
      <Card className="border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto min-h-0">
          <Table>
            <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
            <TableRow className="border-b border-slate-200">
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Vencimiento SLA</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Tipo de Alerta</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Paciente</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Prioridad</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Banda Geográfica</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Contacto Telefónico</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Estado</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                  <p className="text-sm font-medium">
                    {isLoading ? "Cargando tareas…" : "No hay alertas sociales pendientes en esta bandeja"}
                  </p>
                </TableCell>
              </TableRow>
            )}
            {lista.map((t) => (
              <TableRow key={t.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <TableCell className="py-3.5 px-4 text-xs font-semibold">
                  <div className="flex flex-col">
                    <span className={t.vencida ? "text-hemato-crimson font-bold" : "text-deep-slate font-medium"}>
                      {format(new Date(t.venceEn), "dd/MM/yyyy HH:mm", { locale: es })}
                    </span>
                    {t.vencida && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-hemato-crimson font-bold mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> ¡SLA VENCIDO!
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="py-3.5 px-4">
                  {t.tipo === "SILENCIO" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-warning-amber">
                      <MessageSquareWarning className="h-3 w-3" /> Contacto requerido
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-semibold text-hemato-crimson">
                      <UserX className="h-3 w-3" /> Inasistencia
                    </span>
                  )}
                </TableCell>

                <TableCell className="py-3.5 px-4 font-semibold text-deep-slate text-sm">
                  {t.paciente.nombres}
                </TableCell>

                <TableCell className="py-3.5 px-4">
                  <EtiquetaBadge etiqueta={t.paciente.etiqueta} />
                </TableCell>

                <TableCell className="py-3.5 px-4">
                  <BandaBadge banda={t.paciente.banda} />
                </TableCell>

                <TableCell className="py-3.5 px-4">
                  {t.paciente.telefono ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 border border-sky-200 px-2.5 py-1 text-xs font-mono font-bold text-tech-blue">
                      <PhoneCall className="h-3.5 w-3.5" />
                      {t.paciente.telefono}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Sin teléfono</span>
                  )}
                </TableCell>

                <TableCell className="py-3.5 px-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                      t.estado === "PENDIENTE"
                        ? "bg-amber-50 text-warning-amber border-amber-200"
                        : t.estado === "EN_PROCESO"
                          ? "bg-sky-50 text-tech-blue border-sky-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    {t.estado}
                  </span>
                </TableCell>

                <TableCell className="py-3.5 px-4 text-right">
                  {t.estado === "PENDIENTE" && (
                    <Button
                      size="sm"
                      variant="crimson"
                      onClick={() => tomar.mutate(t.id)}
                      disabled={tomar.isPending}
                      className="text-xs h-8 font-semibold"
                    >
                      Tomar Caso
                    </Button>
                  )}
                  {t.estado === "EN_PROCESO" && (
                    <Button
                      size="sm"
                      variant="tech-blue"
                      onClick={() => setResolviendo(t)}
                      className="text-xs h-8 font-semibold"
                    >
                      Resolver
                    </Button>
                  )}
                  {t.estado === "RESUELTA" && (
                    <span className="text-xs text-slate-400 italic">Resuelta</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>
        <Paginacion
          pagina={pagina}
          limite={limite}
          total={tareas?.total ?? 0}
          onPagina={setPagina}
          onLimite={setLimite}
        />
      </Card>

      {/* Modal para Resolver Tarea con Gestión Social */}
      <Dialog open={!!resolviendo} onOpenChange={(o) => !o && setResolviendo(null)}>
        <DialogContent className="max-w-lg bg-white p-6 rounded-2xl border border-slate-200 shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="text-xl font-bold text-deep-slate">
              Registrar Gestión Social
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Paciente: <strong>{resolviendo?.paciente.nombres}</strong> · Teléfono:{" "}
              <span className="font-mono font-bold text-tech-blue">{resolviendo?.paciente.telefono}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Resultado de la Intervención</Label>
              <Input
                id="resultado"
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                placeholder="Escribe el informe breve o selecciona una plantilla abajo"
                className="h-10 text-xs bg-slate-50 mt-1"
              />
            </div>

            {/* Plantillas / Presets de Trabajo Social */}
            <div>
              <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Opciones Frecuentes de Gestión:
              </Label>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {presetsResultado.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setResultado(preset)}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-left text-xs text-slate-700 hover:bg-sky-50 hover:border-tech-blue hover:text-tech-blue transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => setResolviendo(null)}>
              Cancelar
            </Button>
            <Button
              variant="tech-blue"
              onClick={() => resolver.mutate()}
              disabled={resolver.isPending || !resultado}
            >
              Completar y Guardar Gestión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
