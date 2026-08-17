import type { Etiqueta, CitaEstado, Banda } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MapPin, CheckCircle2, Clock, CalendarCheck, Stethoscope, UserX, XCircle } from "lucide-react";

/** Logotipo Oficial HematoFlow según Guía de Estilos INSN */
export function HematoFlowLogo({
  className,
  size = "default",
  showSubtitle = true,
}: {
  className?: string;
  size?: "sm" | "default" | "lg";
  showSubtitle?: boolean;
}) {
  const iconSizes = {
    sm: "h-7 w-7",
    default: "h-9 w-9",
    lg: "h-12 w-12",
  };

  const titleSizes = {
    sm: "text-base",
    default: "text-lg",
    lg: "text-2xl",
  };

  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      {/* Icono de gota con flecha ascendente tecnológica */}
      <div className={cn("relative shrink-0 flex items-center justify-center", iconSizes[size])}>
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-sm"
        >
          {/* Gota de sangre carmesí (#C1272D) */}
          <path
            d="M50 8C50 8 20 44 20 64C20 80.5685 33.4315 94 50 94C66.5685 94 80 80.5685 80 64C80 44 50 8 50 8Z"
            fill="url(#crimsonGradient)"
          />
          {/* Ondas / Flecha ascendente azul tech (#0077C8) */}
          <path
            d="M26 68C32 60 42 56 52 50L64 36M64 36L48 37M64 36L61 51"
            stroke="white"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M28 78C36 72 48 68 60 58L72 44"
            stroke="#0077C8"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M36 85C44 80 54 76 66 66"
            stroke="#70C4FF"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="crimsonGradient" x1="50" y1="8" x2="50" y2="94" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E53935" />
              <stop offset="0.6" stopColor="#C1272D" />
              <stop offset="1" stopColor="#8E0D13" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center leading-none">
          <span className={cn("font-bold tracking-tight text-hemato-crimson font-display", titleSizes[size])}>
            HEMATO
          </span>
          <span className={cn("font-bold tracking-tight text-tech-blue font-display ml-1", titleSizes[size])}>
            FLOW
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] text-neutral-gray font-medium tracking-tight mt-0.5">
            Conectando Salud a Distancia · INSN
          </span>
        )}
      </div>
    </div>
  );
}

/** Badges de Etiqueta Clínica con los tokens oficiales de color */
export function etiquetaClase(etiqueta: Etiqueta): string {
  switch (etiqueta) {
    case "ROJA":
      return "bg-red-50 text-red-700 border-red-200";
    case "AMARILLA":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "VERDE":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

export function EtiquetaBadge({
  etiqueta,
  showLabel = true,
  className,
}: {
  etiqueta: Etiqueta;
  showLabel?: boolean;
  className?: string;
}) {
  const dotColor =
    etiqueta === "ROJA"
      ? "bg-hemato-crimson"
      : etiqueta === "AMARILLA"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border shadow-xs transition-colors",
        etiquetaClase(etiqueta),
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColor)} />
      {showLabel ? etiqueta : null}
    </span>
  );
}

/** Badges de Banda Geográfica con distancias de viaje */
export function bandaClase(banda: Banda): string {
  switch (banda) {
    case "CERCANA":
      return "bg-slate-50 text-slate-700 border-slate-200";
    case "REGIONAL":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "DISTANTE":
      return "bg-purple-50 text-purple-700 border-purple-200";
  }
}

export function BandaBadge({ banda, className }: { banda: Banda; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium shadow-xs",
        bandaClase(banda),
        className,
      )}
    >
      <MapPin className="h-3 w-3 shrink-0 opacity-70" />
      {banda}
    </span>
  );
}

/** Estados de Cita */
export function estadoColor(estado: CitaEstado): string {
  switch (estado) {
    case "PROPUESTA":
      return "text-slate-600";
    case "PROGRAMADA":
      return "text-sky-700";
    case "CONFIRMADA":
      return "text-emerald-700";
    case "EN_ATENCION":
      return "text-tech-blue";
    case "ASISTIDA":
      return "text-blue-800";
    case "NO_LLEGO":
      return "text-hemato-crimson";
    case "CANCELADA":
      return "text-slate-400 line-through";
  }
}

export function estadoBadgeClase(estado: CitaEstado): string {
  switch (estado) {
    case "PROPUESTA":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "PROGRAMADA":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "CONFIRMADA":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "EN_ATENCION":
      return "bg-tech-blue/10 text-tech-blue border-tech-blue/25";
    case "ASISTIDA":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "NO_LLEGO":
      return "bg-red-50 text-red-700 border-red-200";
    case "CANCELADA":
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

export function EstadoBadge({
  estado,
  showIcon = true,
  className,
}: {
  estado: CitaEstado;
  showIcon?: boolean;
  className?: string;
}) {
  const Icono = () => {
    if (!showIcon) return null;
    switch (estado) {
      case "PROPUESTA":
        return <Clock className="h-3 w-3" />;
      case "PROGRAMADA":
        return <Clock className="h-3 w-3 text-sky-600" />;
      case "CONFIRMADA":
        return <CheckCircle2 className="h-3 w-3 text-emerald-600" />;
      case "EN_ATENCION":
        return <Stethoscope className="h-3 w-3 text-tech-blue" />;
      case "ASISTIDA":
        return <CalendarCheck className="h-3 w-3 text-blue-600" />;
      case "NO_LLEGO":
        return <UserX className="h-3 w-3 text-red-600" />;
      case "CANCELADA":
        return <XCircle className="h-3 w-3 text-slate-400" />;
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border shadow-xs",
        estadoBadgeClase(estado),
        className,
      )}
    >
      <Icono />
      {estado.replace("_", " ")}
    </span>
  );
}

/** Utilidades de Ocupación */
export function ocupacionClase(ocupacion: number | null): string {
  if (ocupacion === null) return "text-slate-400";
  if (ocupacion >= 0.9) return "text-hemato-crimson font-semibold";
  if (ocupacion >= 0.7) return "text-amber-600 font-semibold";
  return "text-emerald-600 font-medium";
}

export function OcupacionBarra({
  ocupacion,
  className,
}: {
  ocupacion: number | null;
  className?: string;
}) {
  const pct = ocupacion !== null ? Math.min(100, Math.round(ocupacion * 100)) : 0;
  const colorBarra =
    pct >= 90
      ? "bg-hemato-crimson"
      : pct >= 70
        ? "bg-warning-amber"
        : "bg-success-green";

  return (
    <div className={cn("w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200", className)}>
      <div
        className={cn("h-full transition-all duration-500 rounded-full", colorBarra)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
