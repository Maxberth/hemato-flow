import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Search, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import type { Banda, Cita, CitaEstado, Etiqueta, Paginated } from "@/lib/types";
import { EtiquetaBadge, BandaBadge } from "@/lib/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COLUMNAS: CitaEstado[] = [
  "PROPUESTA",
  "PROGRAMADA",
  "CONFIRMADA",
  "EN_ATENCION",
  "ASISTIDA",
  "NO_LLEGO",
  "CANCELADA",
];

const DETALLES_COLUMNA: Record<
  CitaEstado,
  { label: string; textBadge: string; borderAccent: string }
> = {
  PROPUESTA: {
    label: "Propuestas",
    textBadge: "text-slate-700",
    borderAccent: "bg-slate-400",
  },
  PROGRAMADA: {
    label: "Programadas",
    textBadge: "text-tech-blue",
    borderAccent: "bg-tech-blue",
  },
  CONFIRMADA: {
    label: "Confirmadas",
    textBadge: "text-emerald-700",
    borderAccent: "bg-emerald-500",
  },
  EN_ATENCION: {
    label: "En Atención",
    textBadge: "text-tech-blue",
    borderAccent: "bg-sky-500",
  },
  ASISTIDA: {
    label: "Atendidas",
    textBadge: "text-blue-800",
    borderAccent: "bg-blue-600",
  },
  NO_LLEGO: {
    label: "No Llegó",
    textBadge: "text-hemato-crimson",
    borderAccent: "bg-hemato-crimson",
  },
  CANCELADA: {
    label: "Canceladas",
    textBadge: "text-slate-500",
    borderAccent: "bg-slate-400",
  },
};

/** Transiciones válidas del kanban según reglas clínicas */
const TRANSICIONES: Record<string, CitaEstado[]> = {
  PROPUESTA: ["CANCELADA"],
  PROGRAMADA: ["NO_LLEGO", "CANCELADA"],
  CONFIRMADA: ["NO_LLEGO", "CANCELADA"],
  EN_ATENCION: ["ASISTIDA"],
  ASISTIDA: [],
  NO_LLEGO: [],
  CANCELADA: [],
};

const LIMITE_COLUMNA = 50;

function TarjetaContenido({ cita }: { cita: Cita }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-deep-slate leading-tight">{cita.paciente.nombres}</p>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-slate-600">
          #{cita.turno ?? "—"}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-medium">
        <span className="font-mono">{cita.fecha.slice(0, 10)}</span>
        <span className="font-mono font-semibold text-deep-slate">{cita.horaEstimada ?? "—"}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
        <EtiquetaBadge etiqueta={cita.paciente.etiqueta} />
        <BandaBadge banda={cita.paciente.banda} />
        {cita.estado === "NO_LLEGO" && cita.causaInasistencia && (
          <span className="rounded-md bg-red-50 border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-hemato-crimson">
            {cita.causaInasistencia.causa}
          </span>
        )}
      </div>
    </>
  );
}

function TarjetaKanban({ cita }: { cita: Cita }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: cita.id,
    data: { cita },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab select-none rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm active:cursor-grabbing",
        isDragging && "opacity-30 border-dashed border-tech-blue bg-sky-50/50",
      )}
    >
      <TarjetaContenido cita={cita} />
    </div>
  );
}

/** Columna Droppable con scroll independiente + paginación server-side. */
function ColumnaKanban({
  estado,
  filtros,
}: {
  estado: CitaEstado;
  filtros: URLSearchParams;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado, data: { estado } });
  const info = DETALLES_COLUMNA[estado];
  const [pagina, setPagina] = useState(1);

  const { data, isFetching } = useQuery({
    queryKey: ["citas", "kanban", estado, filtros.toString(), pagina],
    queryFn: () =>
      api<Paginated<Cita>>(
        "GET",
        `/citas?estado=${estado}&${filtros.toString()}&pagina=${pagina}&limite=${LIMITE_COLUMNA}`,
      ),
    refetchInterval: 20_000,
  });

  const citas = data?.items ?? [];
  const total = data?.total ?? 0;
  const hayMas = citas.length < total;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col rounded-2xl border p-3 transition-colors bg-slate-50/80",
        isOver
          ? "border-tech-blue ring-2 ring-tech-blue/20 bg-sky-50/40"
          : "border-slate-200/90",
      )}
    >
      {/* Encabezado fijo de columna */}
      <div className="mb-3 flex items-center justify-between px-2 pt-1 shrink-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", info.borderAccent)} />
          <span className="text-xs font-bold text-deep-slate uppercase tracking-wide">
            {info.label}
          </span>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-bold border border-slate-200 bg-white",
            info.textBadge,
          )}
        >
          {total}
        </span>
      </div>

      {/* Lista scrolleable verticalmente de tarjetas */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2.5">
        {citas.map((cita) => (
          <TarjetaKanban key={cita.id} cita={cita} />
        ))}
        {citas.length === 0 && !isFetching && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 font-medium">
            Sin citas
          </div>
        )}

        {hayMas && (
          <button
            onClick={() => setPagina((p) => p + 1)}
            disabled={isFetching}
            className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-2 text-[11px] font-semibold text-tech-blue transition-colors hover:bg-sky-50 disabled:opacity-50"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Cargar más ({total - citas.length} restantes)
          </button>
        )}
      </div>
    </div>
  );
}

export function MonitorKanban() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<Etiqueta | "">("");
  const [filtroBanda, setFiltroBanda] = useState<Banda | "">("");
  const [activeCita, setActiveCita] = useState<Cita | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const filtros = new URLSearchParams();
  if (busqueda) filtros.set("q", busqueda);
  if (filtroEtiqueta) filtros.set("etiqueta", filtroEtiqueta);
  if (filtroBanda) filtros.set("banda", filtroBanda);

  const mover = useMutation({
    mutationFn: async ({ cita, destino }: { cita: Cita; destino: CitaEstado }) => {
      if (destino === "NO_LLEGO") {
        await api("POST", `/citas/${cita.id}/no-llego`);
      } else if (destino === "ASISTIDA") {
        await api("POST", `/citas/${cita.id}/finalizar`);
      } else if (destino === "CANCELADA") {
        await api("POST", `/citas/${cita.id}/cancelar`, { motivo: "kanban" });
      }
    },
    onSuccess: () => {
      toast.success("Estado de cita actualizado");
      queryClient.invalidateQueries({ queryKey: ["citas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Transición no permitida");
      queryClient.invalidateQueries({ queryKey: ["citas"] });
    },
  });

  function onDragStart(evento: DragStartEvent) {
    const cita = (evento.active.data.current as { cita?: Cita } | undefined)?.cita;
    if (cita) setActiveCita(cita);
  }

  function onDragEnd(evento: DragEndEvent) {
    const { active, over } = evento;
    setActiveCita(null);
    if (!over) return;

    const cita = (active.data.current as { cita?: Cita } | undefined)?.cita;
    if (!cita) return;

    const destino = over.id as CitaEstado;
    if (!COLUMNAS.includes(destino) || destino === cita.estado) return;

    if (!TRANSICIONES[cita.estado]?.includes(destino)) {
      toast.error(`No se puede mover de ${cita.estado} a ${destino}`);
      return;
    }
    mover.mutate({ cita, destino });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] space-y-4">
      {/* Encabezado del Monitor */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-deep-slate">
            Monitor de Flujo de Citas
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Buscar por paciente…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-9 pl-8 text-xs bg-white border-slate-200 shadow-xs"
            />
          </div>

          <select
            value={filtroEtiqueta}
            onChange={(e) => setFiltroEtiqueta(e.target.value as Etiqueta | "")}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-hidden shadow-xs"
            aria-label="Filtrar por prioridad"
          >
            <option value="">Todas las prioridades</option>
            <option value="ROJA">ROJA</option>
            <option value="AMARILLA">AMARILLA</option>
            <option value="VERDE">VERDE</option>
          </select>

          <select
            value={filtroBanda}
            onChange={(e) => setFiltroBanda(e.target.value as Banda | "")}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-hidden shadow-xs"
            aria-label="Filtrar por banda geográfica"
          >
            <option value="">Todas las zonas</option>
            <option value="CERCANA">CERCANA</option>
            <option value="REGIONAL">REGIONAL</option>
            <option value="DISTANTE">DISTANTE</option>
          </select>
        </div>
      </div>

      {/* Tablero Kanban con altura fija y columnas con scroll independiente */}
      <div className="flex-1 min-h-0">
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveCita(null)}
        >
          <div className="flex gap-4 overflow-x-auto h-full pb-2">
            {COLUMNAS.map((columna) => (
              <ColumnaKanban key={columna} estado={columna} filtros={filtros} />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
            {activeCita ? (
              <div className="select-none rounded-xl border-2 border-tech-blue bg-white p-3.5 shadow-2xl rotate-1 scale-105 cursor-grabbing w-72">
                <TarjetaContenido cita={activeCita} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
