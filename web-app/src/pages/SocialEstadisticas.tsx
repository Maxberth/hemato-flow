import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { CausaCatalogo, Cita, Paginated } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CausaCount {
  causa: CausaCatalogo;
  total: number;
}

const COLORES_CAUSAS: Record<string, string> = {
  TRANSPORTE: "#C1272D",
  ECONOMICO: "#F2994A",
  FAMILIAR: "#0077C8",
  EDUCATIVO: "#27AE60",
  GEOGRAFICO: "#8B5CF6",
  INFORMACION: "#64748B",
  SALUD: "#EC4899",
  OTRO: "#475569",
  SIN_RESPUESTA: "#94A3B8",
};

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SocialEstadisticas() {
  const hoy = new Date();
  const [desde, setDesde] = useState(iso(subDays(hoy, 30)));
  const [hasta, setHasta] = useState(iso(addDays(hoy, 1)));

  const { data: causas } = useQuery({
    queryKey: ["causas", desde, hasta],
    queryFn: () => api<CausaCount[]>("GET", `/estadisticas/causas?desde=${desde}&hasta=${hasta}`),
  });

  // Citas del rango para la evolución de adherencia (se agrupan por semana).
  const { data: citas } = useQuery({
    queryKey: ["citas", "estadisticas", desde, hasta],
    queryFn: async () => {
      const items: Cita[] = [];
      for (let pagina = 1; pagina <= 5; pagina += 1) {
        const r = await api<Paginated<Cita>>(
          "GET",
          `/citas?desde=${desde}&hasta=${hasta}&pagina=${pagina}&limite=500`,
        );
        items.push(...r.items);
        if (r.pagina * r.limite >= r.total) break;
      }
      return items;
    },
  });

  // Agrupa por semana calendario (bucket de 7 días desde `desde`).
  const porSemana = (() => {
    const base = new Date(`${desde}T00:00:00`).getTime();
    const mapa = new Map<string, { semana: string; ASISTIDA: number; NO_LLEGO: number; CANCELADA: number }>();
    for (const c of citas ?? []) {
      const f = new Date(`${c.fecha.slice(0, 10)}T00:00:00`).getTime();
      const idx = Math.max(0, Math.floor((f - base) / (7 * 86_400_000)));
      const inicio = addDays(new Date(`${desde}T00:00:00`), idx * 7);
      const clave = format(inicio, "dd/MM", { locale: es });
      const b = mapa.get(clave) ?? { semana: clave, ASISTIDA: 0, NO_LLEGO: 0, CANCELADA: 0 };
      if (c.estado === "ASISTIDA") b.ASISTIDA += 1;
      else if (c.estado === "NO_LLEGO") b.NO_LLEGO += 1;
      else if (c.estado === "CANCELADA") b.CANCELADA += 1;
      mapa.set(clave, b);
    }
    return [...mapa.values()];
  })();

  const total = (causas ?? []).reduce((acc, c) => acc + c.total, 0);
  const causaPrincipal = (causas ?? []).slice().sort((a, b) => b.total - a.total)[0];

  const aplicarPreset = (dias: number) => {
    setDesde(iso(subDays(hoy, dias)));
    setHasta(iso(addDays(hoy, 1)));
  };

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-2rem)] sm:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)]">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-deep-slate">
            Estadísticas y Causas de Inasistencia
          </h1>
        </div>
      </div>

      {/* Tarjetas de Resumen Analítico */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 shrink-0">
        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Total Inasistencias (Período)</span>
          <p className="text-2xl font-bold text-deep-slate mt-1">{total}</p>
          <span className="text-[11px] text-slate-500">Casos clasificados por el bot</span>
        </Card>

        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Factor Principal de Ausencia</span>
          <p className="text-2xl font-bold text-hemato-crimson mt-1">
            {causaPrincipal ? causaPrincipal.causa : "Sin registros"}
          </p>
          <span className="text-[11px] text-slate-500">
            {causaPrincipal ? `${causaPrincipal.total} casos (${Math.round((causaPrincipal.total / (total || 1)) * 100)}%)` : "—"}
          </span>
        </Card>

        <Card className="border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold text-slate-400">Intervención de Trabajo Social</span>
          <p className="text-2xl font-bold text-tech-blue mt-1">100%</p>
          <span className="text-[11px] text-slate-500">Casos con tarea generada automáticamente</span>
        </Card>
      </div>

      {/* Barra de Filtros de Fecha y Presets */}
      <Card className="border-slate-200 bg-white shadow-xs p-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Rango de análisis:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700"
              />
              <span className="text-xs text-slate-400">hasta</span>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => aplicarPreset(7)}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Últimos 7 días
            </button>
            <button
              onClick={() => aplicarPreset(30)}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Últimos 30 días
            </button>
            <button
              onClick={() => aplicarPreset(90)}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Últimos 90 días
            </button>
          </div>
        </div>
      </Card>

      {/* Gráfico y Tabla Desglosada */}
      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Barras */}
        <Card className="lg:col-span-2 border-slate-200 bg-white shadow-xs">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-base font-bold text-deep-slate">
              Distribución de Causas de No-Show
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Datos recopilados por el agente conversacional mediante WhatsApp / Telegram tras consulta al familiar.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {total === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <BarChart3 className="h-10 w-10 text-slate-300 mb-2" />
                <p className="font-semibold text-sm text-slate-600">No hay inasistencias en este rango de fechas</p>
                <p className="text-xs text-slate-400">Excelente adherencia al tratamiento o amplía el rango temporal.</p>
              </div>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={causas ?? []} margin={{ left: -15, top: 10, right: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis
                      dataKey="causa"
                      stroke="#64748B"
                      fontSize={11}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                    />
                    <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "#FFFFFF",
                        border: "1px solid #E2E8F0",
                        borderRadius: 12,
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        color: "#1A2B3C",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                      {(causas ?? []).map((c) => (
                        <Cell key={c.causa} fill={COLORES_CAUSAS[c.causa] ?? "#0077C8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabla Desglosada */}
        <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-base font-bold text-deep-slate">
              Detalle por Categoría
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Desglose porcentual para apoyo social
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="border-b border-slate-200">
                  <TableHead className="py-2.5 px-3 font-semibold text-slate-700 text-xs">Causa</TableHead>
                  <TableHead className="py-2.5 px-3 font-semibold text-slate-700 text-xs text-right">Casos</TableHead>
                  <TableHead className="py-2.5 px-3 font-semibold text-slate-700 text-xs text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(causas ?? []).map((c) => {
                  const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
                  return (
                    <TableRow key={c.causa} className="border-b border-slate-100 text-xs">
                      <TableCell className="py-2.5 px-3 font-medium text-deep-slate flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: COLORES_CAUSAS[c.causa] ?? "#0077C8" }}
                        />
                        {c.causa}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-bold text-slate-800">
                        {c.total}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right text-slate-500 font-mono">
                        {pct}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Evolución de adherencia por semana */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base font-bold text-deep-slate flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-tech-blue" />
            Evolución de Adherencia por Semana
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Citas ASISTIDA vs NO LLEGÓ vs CANCELADA en el período (detección temprana de caídas de adherencia).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {porSemana.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400">
              <TrendingUp className="h-10 w-10 text-slate-300 mb-2" />
              <p className="font-semibold text-sm text-slate-600">Sin citas en este rango de fechas</p>
              <p className="text-xs text-slate-400">Amplía el rango temporal para ver la tendencia.</p>
            </div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porSemana} margin={{ left: -15, top: 10, right: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="semana" stroke="#64748B" fontSize={11} interval={0} />
                  <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#FFFFFF",
                      border: "1px solid #E2E8F0",
                      borderRadius: 12,
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      color: "#1A2B3C",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ASISTIDA" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} name="Asistida" />
                  <Bar dataKey="NO_LLEGO" stackId="a" fill="#C1272D" radius={[0, 0, 0, 0]} name="No Llegó" />
                  <Bar dataKey="CANCELADA" stackId="a" fill="#94A3B8" radius={[6, 6, 0, 0]} name="Cancelada" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
