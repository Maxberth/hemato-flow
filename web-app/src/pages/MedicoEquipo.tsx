import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Search, Pencil, Stethoscope } from "lucide-react";
import { api } from "@/lib/api";
import type { Paginated, ProfesionalCarga } from "@/lib/types";
import { Paginacion } from "@/components/Paginacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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

export function MedicoEquipo() {
  const queryClient = useQueryClient();
  const [dialogoCrear, setDialogoCrear] = useState(false);
  const [nombre, setNombre] = useState("");
  const [especialidad, setEspecialidad] = useState("");

  // Estado para editar profesional
  const [editando, setEditando] = useState<ProfesionalCarga | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [especialidadEdit, setEspecialidadEdit] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);

  const params = new URLSearchParams();
  if (busqueda) params.set("q", busqueda);
  params.set("pagina", String(pagina));
  params.set("limite", String(limite));

  const { data: carga, isLoading } = useQuery({
    queryKey: ["carga", params.toString()],
    queryFn: () => api<Paginated<ProfesionalCarga>>("GET", `/profesionales/carga?${params.toString()}`),
    refetchInterval: 30_000,
  });

  const crear = useMutation({
    mutationFn: () => api("POST", "/profesionales", { nombre: nombre.trim(), especialidad: especialidad.trim() || null }),
    onSuccess: () => {
      toast.success("Profesional registrado con éxito");
      setDialogoCrear(false);
      setNombre("");
      setEspecialidad("");
      queryClient.invalidateQueries({ queryKey: ["carga"] });
      queryClient.invalidateQueries({ queryKey: ["profesionales"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al registrar profesional"),
  });

  const editar = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { nombre?: string; especialidad?: string | null } }) =>
      api("PATCH", `/profesionales/${id}`, data),
    onSuccess: () => {
      toast.success("Profesional actualizado con éxito");
      setEditando(null);
      queryClient.invalidateQueries({ queryKey: ["carga"] });
      queryClient.invalidateQueries({ queryKey: ["profesionales"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al actualizar profesional"),
  });

  const abrirEdicion = (p: ProfesionalCarga) => {
    setNombreEdit(p.nombre);
    setEspecialidadEdit(p.especialidad ?? "");
    setEditando(p);
  };

  const totalPacientes = (carga?.items ?? []).reduce((acc, p) => acc + p.pacientesActivos, 0);
  const totalCitas7d = (carga?.items ?? []).reduce((acc, p) => acc + p.citasProximas7dias, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-deep-slate">
            Equipo Médico
          </h1>
          <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
            {carga?.total ?? 0} profesionales · {totalPacientes} pacientes · {totalCitas7d} citas en 7d
          </span>
        </div>

        <Button
          variant="crimson"
          size="default"
          onClick={() => setDialogoCrear(true)}
          className="gap-1.5 text-xs font-semibold self-start sm:self-auto cursor-pointer shadow-xs"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Profesional
        </Button>
      </div>

      {/* Tabla de Profesionales */}
      <Card className="border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
        {/* Barra de Búsqueda */}
        <div className="p-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Buscar por nombre o especialidad…"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
              className="h-8 pl-8 text-xs bg-slate-50 border-slate-200"
            />
          </div>
        </div>

        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-b border-slate-200">
                <TableHead className="py-3 px-4 font-semibold text-slate-700">Profesional</TableHead>
                <TableHead className="py-3 px-4 font-semibold text-slate-700">Especialidad</TableHead>
                <TableHead className="py-3 px-4 font-semibold text-slate-700">Estado de Carga</TableHead>
                <TableHead className="py-3 px-4 font-semibold text-slate-700 text-center">Pacientes Activos</TableHead>
                <TableHead className="py-3 px-4 font-semibold text-slate-700 text-center">Citas en Agenda (7d)</TableHead>
                <TableHead className="py-3 px-4 font-semibold text-slate-700 text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(carga?.items ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-medium">
                      {isLoading ? "Cargando equipo médico…" : "No se encontraron profesionales"}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {(carga?.items ?? []).map((p) => {
                const nivelCarga =
                  p.pacientesActivos > 15
                    ? { texto: "Alta Carga", color: "bg-red-50 text-hemato-crimson border-red-200" }
                    : p.pacientesActivos > 6
                      ? { texto: "Equilibrada", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                      : { texto: "Disponible", color: "bg-sky-50 text-tech-blue border-sky-200" };

                return (
                  <TableRow key={p.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                    <TableCell className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 font-bold text-deep-slate text-xs border border-slate-200 shrink-0">
                          {p.nombre.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-bold text-deep-slate text-sm">
                          {p.nombre}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-xs text-slate-600">
                      {p.especialidad ?? "Hematología"}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${nivelCarga.color}`}>
                        {nivelCarga.texto}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-center">
                      <span className="font-bold text-deep-slate text-sm">
                        {p.pacientesActivos}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-center">
                      <span className="font-bold text-tech-blue text-sm">
                        {p.citasProximas7dias}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => abrirEdicion(p)}
                        className="gap-1.5 text-xs h-8 cursor-pointer hover:bg-slate-100 hover:text-deep-slate hover:border-slate-300"
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-500" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        <Paginacion
          pagina={pagina}
          limite={limite}
          total={carga?.total ?? 0}
          onPagina={setPagina}
          onLimite={setLimite}
        />
      </Card>

      {/* Modal Registrar Nuevo Profesional */}
      <Dialog open={dialogoCrear} onOpenChange={setDialogoCrear}>
        <DialogContent className="sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-deep-slate flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-tech-blue" />
              Nuevo Profesional
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Registra un médico o especialista para asignarle pacientes de la cohorte.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Nombre Completo con Título</Label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Dr. Carlos Valenzuela R."
                className="h-9 text-xs bg-slate-50 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Especialidad</Label>
              <Input
                value={especialidad}
                onChange={(e) => setEspecialidad(e.target.value)}
                placeholder="Ej. Oncohematología / Enfermería"
                className="h-9 text-xs bg-slate-50 mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setDialogoCrear(false)}>
              Cancelar
            </Button>
            <Button
              variant="crimson"
              onClick={() => crear.mutate()}
              disabled={crear.isPending || !nombre.trim()}
              className="cursor-pointer"
            >
              {crear.isPending ? "Guardando…" : "Registrar Profesional"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Profesional */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-deep-slate flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-tech-blue" />
              Editar Profesional
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Modifica los datos del profesional médico responsable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Nombre Completo</Label>
              <Input
                value={nombreEdit}
                onChange={(e) => setNombreEdit(e.target.value)}
                placeholder="Ej. Dr. Luis Mendoza"
                className="h-9 text-xs bg-slate-50 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Especialidad</Label>
              <Input
                value={especialidadEdit}
                onChange={(e) => setEspecialidadEdit(e.target.value)}
                placeholder="Ej. Oncohematología"
                className="h-9 text-xs bg-slate-50 mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              variant="crimson"
              onClick={() => {
                if (!editando) return;
                editar.mutate({
                  id: editando.id,
                  data: {
                    nombre: nombreEdit.trim() || undefined,
                    especialidad: especialidadEdit.trim() || null,
                  },
                });
              }}
              disabled={editar.isPending || !nombreEdit.trim()}
              className="cursor-pointer"
            >
              {editar.isPending ? "Guardando…" : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MedicoEquipo;
