import { useEffect, useMemo, useRef, useState } from "react";
import { Timeline } from "vis-timeline/standalone";
import type { DataGroup, DataItem, TimelineOptions } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import "./cronograma.css";
import type { LoteDetalle } from "@/lib/types";
import { Stethoscope, Armchair } from "lucide-react";

const DIAS_ES_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function horaAMinutos(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + (mm ?? 0);
}

function fechaHora(fecha: string, hora: string): Date {
  return new Date(`${fecha.slice(0, 10)}T${hora}`);
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function etiquetaDia(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00`);
  return `${DIAS_ES_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_ES[d.getMonth()]}`;
}

interface ItemCronograma {
  id: string;
  pacienteId: string;
  nombres: string;
  servicio: "AMBULATORIO" | "CONSULTA";
  doctorId: string | null;
  doctor: string | null;
  turno: number | null;
  horaEstimada: string | null;
  duracionMin: number;
  procedimiento: string;
  fecha: string;
  prioridad?: string;
  banda?: string;
  leadDias?: number;
  origen?: string;
  estado?: string;
}

interface Props {
  propuestas: LoteDetalle["propuestas"];
  horasApertura?: string;
  citasOtras?: LoteDetalle["citasOtras"];
}

export function CronogramaLote({ propuestas, horasApertura = "08:00", citasOtras = [] }: Props) {
  const contenedorAmbulatorioRef = useRef<HTMLDivElement>(null);
  const contenedorConsultasRef = useRef<HTMLDivElement>(null);
  const timelineAmbulatorioRef = useRef<Timeline | null>(null);
  const timelineConsultasRef = useRef<Timeline | null>(null);

  const todos: ItemCronograma[] = useMemo(() => {
    const propias: ItemCronograma[] = propuestas.map((p) => ({
      id: p.id,
      pacienteId: p.pacienteId,
      nombres: p.nombres,
      servicio: p.servicio,
      doctorId: null,
      doctor: p.doctor,
      turno: p.turno,
      horaEstimada: p.horaEstimada,
      duracionMin: p.duracionMin,
      procedimiento: p.servicio === "CONSULTA" ? "Consulta Médica" : "Infusión / Quimio",
      fecha: p.fecha,
      prioridad: p.justificacion?.prioridad,
      banda: p.banda,
      leadDias: p.justificacion?.leadDias,
      origen: p.origen,
      estado: p.estado,
    }));
    const otras: ItemCronograma[] = citasOtras.map((c) => ({
      id: c.id,
      pacienteId: c.pacienteId ?? "",
      nombres: c.nombres,
      servicio: c.servicio,
      doctorId: c.doctorId,
      doctor: c.doctor,
      turno: c.turno,
      horaEstimada: c.horaEstimada,
      duracionMin: c.duracionMin,
      procedimiento: c.procedimiento,
      fecha: c.fecha,
      estado: c.estado,
    }));
    return [...otras, ...propias];
  }, [propuestas, citasOtras]);

  // Resumen por día
  const resumenDias = useMemo(() => {
    const porDia = new Map<string, { fecha: string; citas: number; ambulatorio: number; consulta: number }>();
    for (const item of todos) {
      const k = item.fecha.slice(0, 10);
      const d = porDia.get(k) ?? { fecha: k, citas: 0, ambulatorio: 0, consulta: 0 };
      d.citas += 1;
      if (item.servicio === "AMBULATORIO") d.ambulatorio += 1;
      else d.consulta += 1;
      porDia.set(k, d);
    }
    return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [todos]);

  const primerDiaConCitas = resumenDias[0]?.fecha ?? null;
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(primerDiaConCitas);

  useEffect(() => {
    if (primerDiaConCitas && !diaSeleccionado) {
      setDiaSeleccionado(primerDiaConCitas);
    }
  }, [primerDiaConCitas, diaSeleccionado]);

  // Filtrar citas del día seleccionado
  const citasDelDia = useMemo(() => {
    return diaSeleccionado ? todos.filter((t) => t.fecha.slice(0, 10) === diaSeleccionado) : todos;
  }, [todos, diaSeleccionado]);

  const citasAmbulatorio = useMemo(
    () => citasDelDia.filter((t) => t.servicio === "AMBULATORIO"),
    [citasDelDia],
  );

  const citasConsultas = useMemo(
    () => citasDelDia.filter((t) => t.servicio === "CONSULTA"),
    [citasDelDia],
  );

  // ─────────────────────────────────────────────────────────────
  // 1. TIMELINE AMBULATORIO (Infusiones & Camillas)
  // ─────────────────────────────────────────────────────────────
  const gruposAmbulatorio = useMemo<DataGroup[]>(() => {
    return [
      {
        id: "AMBULATORIO",
        content: `
          <div class="flex items-center gap-2 py-1 px-1">
            <span class="inline-block h-2.5 w-2.5 rounded-full bg-tech-blue"></span>
            <span class="font-bold text-slate-800 text-xs">Sillones / Camillas</span>
          </div>
        `,
      },
    ];
  }, []);

  const itemsAmbulatorio = useMemo<DataItem[]>(() => {
    return citasAmbulatorio
      .filter((t) => t.horaEstimada)
      .map((t) => {
        const inicio = fechaHora(t.fecha, t.horaEstimada!);
        const duracionMin = t.duracionMin || 60;
        const fin = new Date(inicio.getTime() + duracionMin * 60_000);
        const esPropuesta = t.estado === "PROPUESTA" || !!t.origen;
        const prioridad = (t.prioridad ?? "").toLowerCase();

        const contenido = `
          <div class="tl-card-inner">
            <span class="tl-nombre ${esPropuesta ? "font-bold" : "font-medium opacity-80"}">${escaparHtml(t.nombres)}</span>
            <div class="tl-meta">
              <span class="tl-hora">T${t.turno ?? "—"} · ${t.horaEstimada}</span>
              <span>${duracionMin} min</span>
            </div>
          </div>
        `;
        const titulo = esPropuesta
          ? `<strong>${escaparHtml(t.nombres)} (Propuesta de este Lote)</strong><br/>Servicio: Quimioterapia / Infusión Ambulatoria<br/>Turno: #${t.turno ?? "—"} — ${t.horaEstimada} (${duracionMin} min)<br/>Prioridad: ${t.prioridad ?? "—"}<br/>Banda: ${t.banda ?? "—"} (+${t.leadDias ?? 0}d viaje)`
          : `<strong>${escaparHtml(t.nombres)} (Cita previa)</strong><br/>Servicio: Ambulatorio<br/>Turno: #${t.turno ?? "—"} — ${t.horaEstimada} (${duracionMin} min)<br/>Estado: ${t.estado ?? "—"}`;

        return {
          id: `ambulatorio-${esPropuesta ? "propuesta" : "otra"}-${t.id}`,
          group: "AMBULATORIO",
          content: contenido,
          start: inicio,
          end: fin,
          className: esPropuesta ? `tl-prioridad-${prioridad || "verde"}` : "tl-prioridad-ocupado",
          title: titulo,
        };
      });
  }, [citasAmbulatorio]);

  const ventanaAmbulatorio = useMemo(() => {
    const fechaRef = diaSeleccionado ?? new Date().toISOString().slice(0, 10);
    const inicioMin = horaAMinutos(horasApertura) - 15; // 07:45
    const finCitas = citasAmbulatorio.map((t) => {
      const h = horaAMinutos(t.horaEstimada ?? horasApertura);
      return h + (t.duracionMin || 60);
    });
    const maxFinMin = Math.max(14 * 60 + 15, ...(finCitas.length > 0 ? finCitas : [])) + 15;

    return {
      inicio: new Date(`${fechaRef}T${String(Math.floor(inicioMin / 60)).padStart(2, "0")}:${String(inicioMin % 60).padStart(2, "0")}:00`),
      fin: new Date(`${fechaRef}T${String(Math.floor(maxFinMin / 60)).padStart(2, "0")}:${String(maxFinMin % 60).padStart(2, "0")}:00`),
    };
  }, [diaSeleccionado, horasApertura, citasAmbulatorio]);

  const opcionesAmbulatorio = useMemo<TimelineOptions>(
    () => ({
      timeAxis: { scale: "hour", step: 1 },
      orientation: { axis: "top", item: "top" },
      format: {
        minorLabels: { minute: "HH:mm", hour: "HH:mm" },
        majorLabels: (d: Date | string) => {
          const fecha = d instanceof Date ? d : new Date(d);
          return `${DIAS_ES_CORTOS[fecha.getDay()]} ${fecha.getDate()} ${MESES_ES[fecha.getMonth()]}`;
        },
      },
      groupOrder: "id",
      stack: true,
      autoResize: true,
      selectable: true,
      editable: false,
      margin: { item: { vertical: 6, horizontal: 3 }, axis: 12 },
      zoomable: false,
      moveable: false,
      min: ventanaAmbulatorio.inicio,
      max: ventanaAmbulatorio.fin,
    }),
    [ventanaAmbulatorio],
  );

  useEffect(() => {
    const contenedor = contenedorAmbulatorioRef.current;
    if (!contenedor) return;

    const timeline = new Timeline(contenedor, itemsAmbulatorio, gruposAmbulatorio, opcionesAmbulatorio);
    timelineAmbulatorioRef.current = timeline;
    timeline.setWindow(ventanaAmbulatorio.inicio, ventanaAmbulatorio.fin, { animation: false });

    return () => {
      timeline.destroy();
      timelineAmbulatorioRef.current = null;
    };
  }, [itemsAmbulatorio, gruposAmbulatorio, opcionesAmbulatorio, ventanaAmbulatorio]);

  // ─────────────────────────────────────────────────────────────
  // 2. TIMELINE CONSULTAS MÉDICAS (Por Especialista)
  // ─────────────────────────────────────────────────────────────
  const gruposConsultas = useMemo<DataGroup[]>(() => {
    const doctores = new Map<string, string>();
    for (const item of todos) {
      if (item.servicio === "CONSULTA" && item.doctor) doctores.set(item.doctor, item.doctor);
    }
    const filas: DataGroup[] = [];
    for (const nombre of [...doctores.keys()].sort()) {
      filas.push({
        id: `doctor-${nombre}`,
        content: `
          <div class="flex items-center gap-2 py-1 px-1">
            <span class="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            <span class="font-bold text-slate-800 text-xs">${escaparHtml(nombre)}</span>
          </div>
        `,
      });
    }
    return filas;
  }, [todos]);

  const itemsConsultas = useMemo<DataItem[]>(() => {
    return citasConsultas
      .filter((t) => t.horaEstimada && t.doctor)
      .map((t) => {
        const inicio = fechaHora(t.fecha, t.horaEstimada!);
        const duracionMin = t.duracionMin || 20;
        const fin = new Date(inicio.getTime() + duracionMin * 60_000);
        const esPropuesta = t.estado === "PROPUESTA" || !!t.origen;
        const prioridad = (t.prioridad ?? "").toLowerCase();

        const contenido = `
          <div class="tl-card-inner">
            <span class="tl-nombre ${esPropuesta ? "font-bold" : "font-medium opacity-80"}">${escaparHtml(t.nombres)}</span>
            <div class="tl-meta">
              <span class="tl-hora">T${t.turno ?? "—"} · ${t.horaEstimada}</span>
              <span>${duracionMin}m</span>
            </div>
          </div>
        `;
        const titulo = esPropuesta
          ? `<strong>${escaparHtml(t.nombres)} (Propuesta de este Lote)</strong><br/>Servicio: Consulta Médica<br/>Doctor: ${t.doctor}<br/>Turno: #${t.turno ?? "—"} — ${t.horaEstimada} (${duracionMin} min)<br/>Prioridad: ${t.prioridad ?? "—"}<br/>Banda: ${t.banda ?? "—"} (+${t.leadDias ?? 0}d viaje)`
          : `<strong>${escaparHtml(t.nombres)} (Cita previa)</strong><br/>Servicio: Consulta Médica<br/>Doctor: ${t.doctor}<br/>Turno: #${t.turno ?? "—"} — ${t.horaEstimada} (${duracionMin} min)<br/>Estado: ${t.estado ?? "—"}`;

        return {
          id: `consulta-${esPropuesta ? "propuesta" : "otra"}-${t.id}`,
          group: `doctor-${t.doctor}`,
          content: contenido,
          start: inicio,
          end: fin,
          className: esPropuesta ? `tl-prioridad-${prioridad || "verde"}` : "tl-prioridad-ocupado",
          title: titulo,
        };
      });
  }, [citasConsultas]);

  // Escala ampliada y generosa para consultas (07:45 a 12:30 o fin de citas)
  const ventanaConsultas = useMemo(() => {
    const fechaRef = diaSeleccionado ?? new Date().toISOString().slice(0, 10);
    const inicioMin = horaAMinutos(horasApertura) - 15; // 07:45
    const finCitas = citasConsultas.map((t) => {
      const h = horaAMinutos(t.horaEstimada ?? horasApertura);
      return h + (t.duracionMin || 20);
    });
    const maxFinMin = Math.max(12 * 60 + 30, ...(finCitas.length > 0 ? finCitas : [])) + 15;

    return {
      inicio: new Date(`${fechaRef}T${String(Math.floor(inicioMin / 60)).padStart(2, "0")}:${String(inicioMin % 60).padStart(2, "0")}:00`),
      fin: new Date(`${fechaRef}T${String(Math.floor(maxFinMin / 60)).padStart(2, "0")}:${String(maxFinMin % 60).padStart(2, "0")}:00`),
    };
  }, [diaSeleccionado, horasApertura, citasConsultas]);

  const opcionesConsultas = useMemo<TimelineOptions>(
    () => ({
      timeAxis: { scale: "minute", step: 30 },
      orientation: { axis: "top", item: "top" },
      format: {
        minorLabels: { minute: "HH:mm", hour: "HH:mm" },
        majorLabels: (d: Date | string) => {
          const fecha = d instanceof Date ? d : new Date(d);
          return `${DIAS_ES_CORTOS[fecha.getDay()]} ${fecha.getDate()} ${MESES_ES[fecha.getMonth()]}`;
        },
      },
      groupOrder: "id",
      stack: false,
      autoResize: true,
      selectable: true,
      editable: false,
      margin: { item: { vertical: 6, horizontal: 3 }, axis: 12 },
      zoomable: false,
      moveable: false,
      min: ventanaConsultas.inicio,
      max: ventanaConsultas.fin,
    }),
    [ventanaConsultas],
  );

  useEffect(() => {
    const contenedor = contenedorConsultasRef.current;
    if (!contenedor) return;

    const timeline = new Timeline(contenedor, itemsConsultas, gruposConsultas, opcionesConsultas);
    timelineConsultasRef.current = timeline;
    timeline.setWindow(ventanaConsultas.inicio, ventanaConsultas.fin, { animation: false });

    return () => {
      timeline.destroy();
      timelineConsultasRef.current = null;
    };
  }, [itemsConsultas, gruposConsultas, opcionesConsultas, ventanaConsultas]);

  return (
    <div className="flex flex-col gap-6 p-4 bg-slate-50/60 rounded-b-xl w-full">
      {/* Selector de Día de Atención y Leyenda de Prioridades */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        {resumenDias.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 mr-1">Día de Atención:</span>
            {resumenDias.map((d) => {
              const activo = diaSeleccionado === d.fecha;
              return (
                <button
                  key={d.fecha}
                  onClick={() => setDiaSeleccionado(d.fecha)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    activo
                      ? "bg-tech-blue text-white border-tech-blue shadow-sm ring-2 ring-tech-blue/20"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  <span className="capitalize">{etiquetaDia(d.fecha)}</span>
                  <span className={activo ? "text-white/60" : "text-slate-300"}>·</span>
                  <span className={activo ? "text-white/90" : "text-slate-500 font-normal"}>
                    {d.citas} citas ({d.ambulatorio} amb · {d.consulta} cons)
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200 self-start md:self-auto">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-hemato-crimson" /> ROJA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-warning-amber" /> AMARILLA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success-green" /> VERDE
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-300 border border-dashed border-slate-400" /> 🔒 Cita Previa
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TIMELINE 1: SERVICIO AMBULATORIO (Infusiones / Quimioterapia)
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-tech-blue/10 text-tech-blue">
              <Armchair className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 tracking-tight">
                Cronograma Ambulatorio (Quimioterapia / Camillas)
              </h3>
              <p className="text-[10.5px] text-slate-400">
                Sesiones continuas de 60 a 120 minutos en sillones de infusión (08:00 – 14:00)
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-tech-blue border border-blue-100">
            {citasAmbulatorio.length} pacientes
          </span>
        </div>

        <div className="p-3">
          <div ref={contenedorAmbulatorioRef} className="cronograma-lote w-full" />
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TIMELINE 2: CONSULTAS MÉDICAS ESPECIALIZADAS (Por Doctor)
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 tracking-tight">
                Cronograma de Consultas Médicas Especializadas
              </h3>
              <p className="text-[10.5px] text-slate-400">
                Turnos médicos de 20 minutos por consultorio (Escala ampliada 08:00 – 12:30)
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
            {citasConsultas.length} pacientes
          </span>
        </div>

        <div className="p-3">
          <div ref={contenedorConsultasRef} className="cronograma-lote w-full" />
        </div>
      </div>
    </div>
  );
}

export default CronogramaLote;
