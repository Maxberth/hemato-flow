import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Papa from "papaparse";
import {
  UserPlus,
  FileSpreadsheet,
  Search,
  ShieldCheck,
  Edit2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Banda, Canal, Etiqueta, Paciente, Paginated, Profesional, Servicio, TipoProcedimiento } from "@/lib/types";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EtiquetaBadge, BandaBadge } from "@/lib/ui";

interface Filtros {
  etiqueta: string;
  banda: string;
  activo: string;
  hospitalizado: string;
  q: string;
}

const VACIOS: Filtros = { etiqueta: "", banda: "", activo: "true", hospitalizado: "", q: "" };

interface PacienteForm {
  nombres: string;
  telefono: string;
  etiqueta: Etiqueta;
  banda: Banda;
  fechaObjetivo: string;
  canal: Canal;
  horaPreferida: string;
  tipoProcedimientoId: string;
  frecuenciaDias: string;
  servicio: Servicio;
}

const FORM_VACIO: PacienteForm = {
  nombres: "",
  telefono: "",
  etiqueta: "VERDE",
  banda: "CERCANA",
  fechaObjetivo: new Date().toISOString().slice(0, 10),
  canal: "WHATSAPP",
  horaPreferida: "",
  tipoProcedimientoId: "",
  frecuenciaDias: "",
  servicio: "CONSULTA",
};

export function MedicoPacientes() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState<Filtros>(VACIOS);
  const [dialogo, setDialogo] = useState<"crear" | "editar" | null>(null);
  const [form, setForm] = useState<PacienteForm>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [responsables, setResponsables] = useState<string[]>([]);
  const [hospitalizado, setHospitalizado] = useState(false);
  const [activo, setActivo] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);

  const params = new URLSearchParams();
  if (filtros.etiqueta) params.set("etiqueta", filtros.etiqueta);
  if (filtros.banda) params.set("banda", filtros.banda);
  if (filtros.activo) params.set("activo", filtros.activo);
  if (filtros.hospitalizado) params.set("hospitalizado", filtros.hospitalizado);
  if (filtros.q) params.set("q", filtros.q);
  params.set("pagina", String(pagina));
  params.set("limite", String(limite));

  const { data: pacientes, isLoading } = useQuery({
    queryKey: ["pacientes", params.toString()],
    queryFn: () =>
      api<Paginated<Paciente> & { resumen: { rojas: number; amarillas: number; verdes: number; distantes: number } }>(
        "GET",
        `/pacientes?${params.toString()}`,
      ),
  });
  const { data: profesionales } = useQuery({
    queryKey: ["profesionales"],
    queryFn: () => api<Paginated<Profesional>>("GET", "/profesionales?limite=200"),
  });
  const { data: tipos } = useQuery({
    queryKey: ["tipos"],
    queryFn: () => api<TipoProcedimiento[]>("GET", "/tipos-procedimiento"),
  });

  const guardar = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        frecuenciaDias: form.frecuenciaDias ? Number(form.frecuenciaDias) : undefined,
        telefono: form.telefono,
        horaPreferida: form.horaPreferida.trim() ? form.horaPreferida.trim() : null,
      };
      if (dialogo === "editar" && editandoId) {
        const { telefono, ...campos } = body;
        // Número opcional en edición: solo se envía si el usuario lo cambió.
        const conTelefono = telefono?.trim() ? { telefono: telefono.trim() } : {};
        await api("PATCH", `/pacientes/${editandoId}`, {
          ...campos,
          ...conTelefono,
          activo,
          hospitalizado,
        });
      } else {
        await api("POST", "/pacientes", body);
      }
    },
    onSuccess: async () => {
      toast.success(dialogo === "editar" ? "Ficha médica actualizada" : "Paciente registrado en cohorte");
      setDialogo(null);
      queryClient.invalidateQueries({ queryKey: ["pacientes"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al guardar paciente"),
  });

  const importarCsv = useMutation({
    mutationFn: async (items: Array<Record<string, string>>) => {
      const pacientesImportar = items.map((fila) => ({
        nombres: fila["nombres"] ?? fila["Nombre"] ?? "",
        telefono: (fila["telefono"] ?? fila["Teléfono"] ?? "").trim(),
        etiqueta: (fila["etiqueta"] ?? "VERDE") as Etiqueta,
        banda: (fila["banda"] ?? "CERCANA") as Banda,
        fechaObjetivo: fila["fechaObjetivo"] ?? new Date().toISOString().slice(0, 10),
        canal: (fila["canal"] ?? "WHATSAPP") as Canal,
        tipoProcedimientoId:
          fila["tipoProcedimiento"] && tipos
            ? (tipos.find((t) => t.nombre === fila["tipoProcedimiento"])?.id ?? tipos[0]!.id)
            : (tipos?.[0]?.id ?? ""),
        frecuenciaDias: fila["frecuenciaDias"] ? Number(fila["frecuenciaDias"]) : undefined,
        servicio: (fila["servicio"] ?? "CONSULTA") as Servicio,
      }));
      return api<{ importados: number; duplicados: number }>("POST", "/pacientes/importar", {
        pacientes: pacientesImportar,
      });
    },
    onSuccess: (res) => {
      toast.success(`Cohorte importada: ${res.importados} nuevos, ${res.duplicados} duplicados`);
      queryClient.invalidateQueries({ queryKey: ["pacientes"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al procesar CSV"),
  });

  const onArchivo = (archivo: File) => {
    Papa.parse<Record<string, string>>(archivo, {
      header: true,
      skipEmptyLines: true,
      complete: (resultado) => {
        if (resultado.errors.length > 0) {
          toast.error(`CSV inválido: ${resultado.errors[0]!.message}`);
          return;
        }
        if (resultado.data.length === 0) {
          toast.error("El archivo CSV no contiene filas");
          return;
        }
        importarCsv.mutate(resultado.data);
      },
    });
  };

  const abrirEditar = (p: Paciente) => {
    setEditandoId(p.id);
    setForm({
      nombres: p.nombres,
      telefono: "",
      etiqueta: p.etiqueta,
      banda: p.banda,
      fechaObjetivo: p.fechaObjetivo.slice(0, 10),
      canal: p.canal,
      horaPreferida: p.horaPreferida ?? "",
      tipoProcedimientoId: p.tipoProcedimiento.id,
      frecuenciaDias: p.frecuenciaDias ? String(p.frecuenciaDias) : "",
      servicio: p.servicio,
    });
    setResponsables(p.responsables.map((r) => r.id));
    setHospitalizado(p.hospitalizado);
    setActivo(p.activo);
    setDialogo("editar");
  };

  const lista = useMemo(() => pacientes?.items ?? [], [pacientes]);
  const resumen = pacientes?.resumen;
  const rojas = resumen?.rojas ?? 0;
  const amarillas = resumen?.amarillas ?? 0;
  const verdes = resumen?.verdes ?? 0;
  const distantes = resumen?.distantes ?? 0;

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-2rem)] sm:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)]">
      {/* Encabezado y Botones de Acción */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-deep-slate">
            Cohorte de Pacientes
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onArchivo(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="default"
            onClick={() => fileRef.current?.click()}
            disabled={importarCsv.isPending || !tipos}
            className="gap-1.5 text-xs font-semibold"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Importar CSV
          </Button>

          <Button
            variant="crimson"
            size="default"
            onClick={() => {
              setEditandoId(null);
              setForm({ ...FORM_VACIO, tipoProcedimientoId: tipos?.[0]?.id ?? "" });
              setResponsables([]);
              setHospitalizado(false);
              setActivo(true);
              setDialogo("crear");
            }}
            className="gap-1.5 text-xs font-semibold"
          >
            <UserPlus className="h-4 w-4" />
            Nuevo Paciente
          </Button>
        </div>
      </div>

      {/* Tarjetas de Resumen de la Cohorte */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 shrink-0">
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Total Cohorte</span>
          <p className="text-2xl font-bold text-deep-slate mt-1">{pacientes?.total ?? 0}</p>
          <span className="text-[11px] text-slate-500">Pacientes registrados</span>
        </Card>
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Prioridad ROJA</span>
          <p className="text-2xl font-bold text-hemato-crimson mt-1">{rojas}</p>
          <span className="text-[11px] text-slate-500">Atención urgente</span>
        </Card>
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Prioridad AMARILLA</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">{amarillas}</p>
          <span className="text-[11px] text-slate-500">Seguimiento medio</span>
        </Card>
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Prioridad VERDE</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{verdes}</p>
          <span className="text-[11px] text-slate-500">Control regular</span>
        </Card>
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Zonas Distantes</span>
          <p className="text-2xl font-bold text-tech-blue mt-1">{distantes}</p>
          <span className="text-[11px] text-slate-500">Lead viaje 3+ días</span>
        </Card>
      </div>

      {/* Barra de Filtros Multifactorial */}
      <Card className="border-slate-200 bg-white shadow-xs p-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Buscar por nombre de paciente…"
              value={filtros.q}
              onChange={(e) => { setFiltros((f) => ({ ...f, q: e.target.value })); setPagina(1); }}
              className="h-8 pl-8 text-xs bg-slate-50 border-slate-200"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:outline-hidden"
              value={filtros.etiqueta}
              onChange={(e) => { setFiltros((f) => ({ ...f, etiqueta: e.target.value })); setPagina(1); }}
            >
              <option value="">Todas las prioridades</option>
              <option value="ROJA">ROJA</option>
              <option value="AMARILLA">AMARILLA</option>
              <option value="VERDE">VERDE</option>
            </select>

            <select
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:outline-hidden"
              value={filtros.banda}
              onChange={(e) => { setFiltros((f) => ({ ...f, banda: e.target.value })); setPagina(1); }}
            >
              <option value="">Todas las zonas</option>
              <option value="CERCANA">CERCANA (Lima)</option>
              <option value="REGIONAL">REGIONAL (Costa/Sierra)</option>
              <option value="DISTANTE">DISTANTE (Selva/Sierra Sur)</option>
            </select>

            <select
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:outline-hidden"
              value={filtros.activo}
              onChange={(e) => { setFiltros((f) => ({ ...f, activo: e.target.value })); setPagina(1); }}
            >
              <option value="">Todos los estados</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>

            {JSON.stringify(filtros) !== JSON.stringify(VACIOS) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFiltros(VACIOS); setPagina(1); }}
                className="h-8 text-xs text-slate-500 hover:text-deep-slate"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabla Principal de Pacientes */}
      <Card className="border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto min-h-0">
          <Table>
            <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
            <TableRow className="border-b border-slate-200">
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Paciente</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Prioridad</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Servicio</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Banda Geográfica</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Procedimiento Indicado</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Frecuencia</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Médico Responsable</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700">Estado Clínico</TableHead>
              <TableHead className="py-3 px-4 font-semibold text-slate-700 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                  <p className="text-sm font-medium">
                    {isLoading ? "Cargando cohorte…" : "No hay pacientes con los filtros seleccionados"}
                  </p>
                </TableCell>
              </TableRow>
            )}
            {lista.map((p) => (
              <TableRow key={p.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <TableCell className="py-3.5 px-4 font-semibold text-deep-slate text-sm">
                  {p.nombres}
                </TableCell>
                <TableCell className="py-3.5 px-4">
                  <EtiquetaBadge etiqueta={p.etiqueta} />
                </TableCell>
                <TableCell className="py-3.5 px-4">
                  <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {p.servicio}
                  </span>
                </TableCell>
                <TableCell className="py-3.5 px-4">
                  <BandaBadge banda={p.banda} />
                </TableCell>
                <TableCell className="py-3.5 px-4 text-xs text-slate-600">
                  {p.tipoProcedimiento.nombre}
                </TableCell>
                <TableCell className="py-3.5 px-4 text-xs text-slate-500">
                  {p.frecuenciaDias ? `Cada ${p.frecuenciaDias} días` : "A demanda"}
                </TableCell>
                <TableCell className="py-3.5 px-4 text-xs text-slate-600 max-w-44 truncate">
                  {p.responsables.map((r) => r.nombre).join(", ") || "—"}
                </TableCell>
                <TableCell className="py-3.5 px-4">
                  {p.hospitalizado ? (
                    <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-hemato-crimson">
                      Hospitalizado
                    </span>
                  ) : p.activo ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      Inactivo
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-3.5 px-4 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirEditar(p)}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <Edit2 className="h-3 w-3 text-slate-500" />
                    Editar
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
          total={pacientes?.total ?? 0}
          onPagina={setPagina}
          onLimite={setLimite}
        />
      </Card>

      {/* Modal Crear / Editar Paciente */}
      <Dialog open={!!dialogo} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-xl bg-white p-6 rounded-2xl border border-slate-200 max-h-[90vh] overflow-y-auto shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="text-xl font-bold text-deep-slate">
              {dialogo === "crear" ? "Registrar Nuevo Paciente en Cohorte" : "Editar Ficha de Paciente"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {dialogo === "crear"
                ? "El número de contacto se cifra de extremo a extremo y solo es accesible por Trabajo Social ante silencios o inasistencias."
                : "Ajusta la etiqueta clínica y parámetros para la próxima optimización de agenda."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Sección 1: Datos Personales */}
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                1. Datos de Identificación
              </p>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Nombres y Apellidos del Paciente</Label>
                <Input
                  value={form.nombres}
                  onChange={(e) => setForm((f) => ({ ...f, nombres: e.target.value }))}
                  placeholder="Ej. Camila Morales Salazar"
                  className="h-9 text-xs bg-white mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>
                    {dialogo === "crear"
                      ? "Contacto Telefónico (WhatsApp / Telegram)"
                      : "Número de contacto (WhatsApp / Telegram)"}
                  </span>
                  <span className="text-[10px] text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Cifrado de privacidad
                  </span>
                </Label>
                <Input
                  placeholder={
                    dialogo === "crear"
                      ? "+51999999999 o tg:123456"
                      : "Déjalo vacío para no cambiar — ej. +51999999999 o tg:123456"
                  }
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  className="h-9 text-xs bg-white mt-1 font-mono"
                />
              </div>
            </div>

            {/* Sección 2: Criterios Clínicos */}
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                2. Clasificación Médica & Prioridad
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Prioridad Clínica</Label>
                  <select
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 mt-1 focus:outline-hidden"
                    value={form.etiqueta}
                    onChange={(e) => setForm((f) => ({ ...f, etiqueta: e.target.value as Etiqueta }))}
                  >
                    <option value="ROJA">ROJA — Máxima Urgencia</option>
                    <option value="AMARILLA">AMARILLA — Moderada</option>
                    <option value="VERDE">VERDE — Control Regular</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Banda Geográfica</Label>
                  <select
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 mt-1 focus:outline-hidden"
                    value={form.banda}
                    onChange={(e) => setForm((f) => ({ ...f, banda: e.target.value as Banda }))}
                  >
                    <option value="CERCANA">CERCANA (Lima Metropolitana)</option>
                    <option value="REGIONAL">REGIONAL (Costa / Sierra Centro)</option>
                    <option value="DISTANTE">DISTANTE (Selva / Sierra Sur)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Procedimiento</Label>
                  <select
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 mt-1 focus:outline-hidden"
                    value={form.tipoProcedimientoId}
                    onChange={(e) => setForm((f) => ({ ...f, tipoProcedimientoId: e.target.value }))}
                  >
                    {(tipos ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} ({t.duracionMin} min)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Servicio</Label>
                  <select
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 mt-1 focus:outline-hidden"
                    value={form.servicio}
                    onChange={(e) => setForm((f) => ({ ...f, servicio: e.target.value as Servicio }))}
                  >
                    <option value="CONSULTA">CONSULTA (Paciente nuevo / ingreso)</option>
                    <option value="AMBULATORIO">AMBULATORIO (En tratamiento — quimio / procedimiento)</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Canal de Notificación</Label>
                  <select
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 mt-1 focus:outline-hidden"
                    value={form.canal}
                    onChange={(e) => setForm((f) => ({ ...f, canal: e.target.value as Canal }))}
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="TELEGRAM">Telegram</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Hora preferida de cita (receta)
                  </Label>
                  <Input
                    type="time"
                    value={form.horaPreferida}
                    onChange={(e) => setForm((f) => ({ ...f, horaPreferida: e.target.value }))}
                    className="h-9 text-xs bg-white mt-1 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Hora fija asignada según la receta; queda guardada para futuras programaciones.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Fecha Objetivo</Label>
                  <Input
                    type="date"
                    value={form.fechaObjetivo}
                    onChange={(e) => setForm((f) => ({ ...f, fechaObjetivo: e.target.value }))}
                    className="h-9 text-xs bg-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Frecuencia (días)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Vacío = manual"
                    value={form.frecuenciaDias}
                    onChange={(e) => setForm((f) => ({ ...f, frecuenciaDias: e.target.value }))}
                    className="h-9 text-xs bg-white mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Sección 3: Equipo Asignado */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Especialistas Asignados (Equipo Hematología)
              </Label>
              <select
                multiple
                className="h-20 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800 mt-1 focus:outline-hidden"
                value={responsables}
                onChange={(e) =>
                  setResponsables(Array.from(e.target.selectedOptions).map((o) => o.value))
                }
              >
                {(profesionales?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.especialidad ?? "Hematólogo/a"}
                  </option>
                ))}
              </select>
            </div>

            {dialogo === "editar" && (
              <div className="flex gap-4 text-xs font-medium pt-2">
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hospitalizado}
                    onChange={(e) => setHospitalizado(e.target.checked)}
                    className="rounded border-slate-300 text-hemato-crimson focus:ring-hemato-crimson"
                  />
                  Paciente Hospitalizado
                </label>
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    className="rounded border-slate-300 text-tech-blue focus:ring-tech-blue"
                  />
                  Registro Activo en Cohorte
                </label>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button
              variant="crimson"
              onClick={() => guardar.mutate()}
              disabled={guardar.isPending || !form.nombres || (dialogo === "crear" && !form.telefono)}
            >
              {dialogo === "crear" ? "Registrar Paciente" : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
