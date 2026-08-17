import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaginacionProps {
  pagina: number;
  limite: number;
  total: number;
  onPagina: (pagina: number) => void;
  onLimite?: (limite: number) => void;
  className?: string;
}

/** Barra de paginación (tema claro HematoFlow). */
export function Paginacion({
  pagina,
  limite,
  total,
  onPagina,
  onLimite,
  className,
}: PaginacionProps) {
  const paginasTotales = Math.max(1, Math.ceil(total / limite));
  const desde = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const hasta = Math.min(pagina * limite, total);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-2.5",
        className,
      )}
    >
      <p className="text-xs font-medium text-slate-500">
        Mostrando <span className="font-bold text-deep-slate">{desde}–{hasta}</span> de{" "}
        <span className="font-bold text-deep-slate">{total}</span> registros
      </p>

      <div className="flex items-center gap-2">
        {onLimite && (
          <select
            value={limite}
            onChange={(e) => {
              onLimite(Number(e.target.value));
              onPagina(1);
            }}
            className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-hidden"
            aria-label="Registros por página"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        )}

        <button
          onClick={() => onPagina(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <span className="text-xs font-semibold text-deep-slate">
          Página {pagina} de {paginasTotales}
        </span>

        <button
          onClick={() => onPagina(pagina + 1)}
          disabled={pagina >= paginasTotales}
          aria-label="Página siguiente"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
