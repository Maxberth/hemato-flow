import type { Banda, Etiqueta, Servicio } from "@prisma/client";
import { horaAMinutos, horaPreferidaMin, minutosAHora } from "../../../common/hora";

/**
 * Motor de planificación por CUPO DIARIO y TURNOS (posiciones), sin horarios.
 * Greedy determinista, sin LLM ni aleatoriedad: propone día + turno +
 * horaEstimada por paciente según etiqueta de prioridad, banda (lead de aviso)
 * y servicio (AMBULATORIO → CupoDiario del día; CONSULTA → HorarioMedico con
 * doctor asignado). Estrategia de llenado: para cada paciente se elige el
 * candidato MÁS TEMPRANO con cupo restante, concentrando los turnos hasta
 * llenar un día antes de abrir el siguiente.
 *
 * Invariantes: jamás sobrecupa (cupo en memoria), turnos 1..N por cola,
 * horaEstimada = horasApertura + Σ duración de los turnos previos de la cola.
 */

export interface CupoDia {
  fecha: Date;
  servicio: Servicio;
  /** null = ambulatorio (cupo del día); doctorId = consulta de ese doctor. */
  doctorId: string | null;
  /** Cupo restante (ya descontadas las citas activas existentes). */
  cantidad: number;
  /** Camillas del día para la operación en vivo (la programación es serial por duración fija). */
  camillas?: number;
}

export interface PacientePendiente {
  id: string;
  etiqueta: Etiqueta;
  banda: Banda;
  fechaObjetivo: Date;
  duracionMin: number;
  servicio: Servicio;
  /** "HH:mm" fija asignada por la enfermera (receta) → el bloque inicia ahí. */
  horaPreferida?: string | null;
}

export interface PropuestaPlan {
  pacienteId: string;
  fecha: Date;
  turno: number;
  horaEstimada: string;
  duracionMin: number;
  servicio: Servicio;
  doctorId: string | null;
  justificacion: {
    prioridad: Etiqueta;
    banda: Banda;
    leadDias: number;
  };
}

export interface PlanificacionConfig {
  diasVentana: number;
  diasMinHorizonte: number;
  bandas: Record<Banda, { horasAvanceAviso: number }>;
  /** "HH:mm" — apertura de la cola; base para horaEstimada de ambos servicios. */
  horasApertura: string;
}

export interface ResultadoPlan {
  propuestas: PropuestaPlan[];
  sinCupo: PacientePendiente[];
}

const ORDEN_ETIQUETA: Record<Etiqueta, number> = { ROJA: 0, AMARILLA: 1, VERDE: 2 };
// DISTANTE primero: mayor lead de viaje → más anticipación en la posición.
const ORDEN_BANDA: Record<Banda, number> = { DISTANTE: 0, REGIONAL: 1, CERCANA: 2 };

function claveFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDias(d: Date, dias: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias);
}

interface Cola {
  restante: number;
  turnos: number;
  sumaDuracionMin: number;
}

export function planificar(
  pendientes: PacientePendiente[],
  cupos: CupoDia[],
  config: PlanificacionConfig,
  hoy: Date,
): ResultadoPlan {
  const leadPorBanda = new Map<Banda, number>();
  for (const banda of ["CERCANA", "REGIONAL", "DISTANTE"] as Banda[]) {
    const horas = config.bandas[banda]?.horasAvanceAviso ?? 24;
    // 0h = lead 0 → hoy es candidato (cita del mismo día).
    leadPorBanda.set(banda, horas > 0 ? Math.ceil(horas / 24) : 0);
  }

  // Orden estable: etiqueta asc → banda (DISTANTE primero) → servicio
  // (AMBULATORIO = núcleo del sistema, antes que CONSULTA) → fechaObjetivo asc → id asc.
  const ordenados = [...pendientes].sort((a, b) => {
    const porEtiqueta = ORDEN_ETIQUETA[a.etiqueta] - ORDEN_ETIQUETA[b.etiqueta];
    if (porEtiqueta !== 0) return porEtiqueta;
    const porBanda = ORDEN_BANDA[a.banda] - ORDEN_BANDA[b.banda];
    if (porBanda !== 0) return porBanda;
    const porServicio = (a.servicio === "AMBULATORIO" ? 0 : 1) - (b.servicio === "AMBULATORIO" ? 0 : 1);
    if (porServicio !== 0) return porServicio;
    const porFecha = a.fechaObjetivo.getTime() - b.fechaObjetivo.getTime();
    if (porFecha !== 0) return porFecha;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Colas de trabajo en memoria: ambulatorio = día (cola serial por duración fija); consulta = (día, doctor).
  const ambulatorio = new Map<string, Cola>();
  const consulta = new Map<string, Map<string, Cola>>();
  const diasConCupo = new Set<string>();

  for (const cupo of cupos) {
    const clave = claveFecha(cupo.fecha);
    diasConCupo.add(clave);
    if (cupo.servicio === "AMBULATORIO") {
      ambulatorio.set(clave, { restante: cupo.cantidad, turnos: 0, sumaDuracionMin: 0 });
    } else {
      let doctores = consulta.get(clave);
      if (!doctores) {
        doctores = new Map();
        consulta.set(clave, doctores);
      }
      doctores.set(cupo.doctorId ?? "", {
        restante: cupo.cantidad,
        turnos: 0,
        sumaDuracionMin: 0,
      });
    }
  }

  const dias = [...diasConCupo]
    .map((clave) => {
      const [y, m, d] = clave.split("-").map(Number);
      return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
    })
    .sort((a, b) => a.getTime() - b.getTime());

  const aperturaMin = horaAMinutos(config.horasApertura);
  const propuestas: PropuestaPlan[] = [];
  const sinCupo: PacientePendiente[] = [];

  for (const paciente of ordenados) {
    const lead = leadPorBanda.get(paciente.banda) ?? 1;
    const desdeLead = sumarDias(hoy, lead);
    const finVentana = sumarDias(paciente.fechaObjetivo, config.diasVentana);

    // Candidatos: días con cupo en [hoy+lead, fechaObjetivo]; si no hay,
    // extender a [fechaObjetivo, fechaObjetivo + diasVentana] (fecha >= hoy+lead).
    const enRango = (d: Date) => d >= desdeLead && d <= paciente.fechaObjetivo;
    const extendido = (d: Date) =>
      d >= desdeLead && d >= paciente.fechaObjetivo && d <= finVentana;
    let candidatos = dias.filter(enRango);
    if (candidatos.length === 0) candidatos = dias.filter(extendido);

    let elegido: { fecha: Date; turno: number; horaEstimada: string; doctorId: string | null } | null =
      null;

    for (const dia of candidatos) {
      const clave = claveFecha(dia);
      if (paciente.servicio === "AMBULATORIO") {
        const cola = ambulatorio.get(clave);
        if (!cola || cola.restante <= 0) continue;
        // Horas fijas seriales: cada cita acumula su duración (08:00, 08:45…).
        // Si la enfermera asignó horaPreferida (receta), el bloque inicia ahí
        // (nunca antes del fin del anterior — sin solapamiento).
        const inicioMin = Math.max(
          cola.sumaDuracionMin,
          Math.max(0, horaPreferidaMin(paciente.horaPreferida) - aperturaMin),
        );
        if (inicioMin + paciente.duracionMin > 390) continue;

        elegido = {
          fecha: dia,
          turno: cola.turnos + 1,
          horaEstimada: minutosAHora(aperturaMin + inicioMin),
          doctorId: null,
        };
        cola.restante -= 1;
        cola.turnos += 1;
        cola.sumaDuracionMin = inicioMin + paciente.duracionMin;
        break;
      }
      // Consulta: el doctor del día con MÁS cupo restante (menos citas asignadas).
      const doctores = consulta.get(clave);
      if (!doctores || doctores.size === 0) continue;
      const mejores = [...doctores.entries()]
        .filter(
          ([, cola]) =>
            cola.restante > 0 && cola.sumaDuracionMin + paciente.duracionMin <= 390,
        )
        .sort((a, b) => b[1].restante - a[1].restante || (a[0] < b[0] ? -1 : 1));
      if (mejores.length === 0) continue;
      const [doctorId, cola] = mejores[0]!;
      elegido = {
        fecha: dia,
        turno: cola.turnos + 1,
        horaEstimada: minutosAHora(aperturaMin + cola.sumaDuracionMin),
        doctorId,
      };
      cola.restante -= 1;
      cola.turnos += 1;
      cola.sumaDuracionMin += paciente.duracionMin;
      break;
    }

    if (!elegido) {
      sinCupo.push(paciente);
      continue;
    }

    propuestas.push({
      pacienteId: paciente.id,
      fecha: new Date(elegido.fecha),
      turno: elegido.turno,
      horaEstimada: elegido.horaEstimada,
      duracionMin: paciente.duracionMin,
      servicio: paciente.servicio,
      doctorId: elegido.doctorId,
      justificacion: {
        prioridad: paciente.etiqueta,
        banda: paciente.banda,
        leadDias: lead,
      },
    });
  }

  return { propuestas, sinCupo };
}
