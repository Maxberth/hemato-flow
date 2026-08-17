import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Stethoscope, Users, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { login, ApiErrorClase } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HematoFlowLogo } from "@/lib/ui";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const loginSchema = z.object({
  username: z.string().min(1, "Ingrese su usuario clínico"),
  password: z.string().min(1, "Ingrese su contraseña"),
});

type LoginForm = z.infer<typeof loginSchema>;

function destinoPorRol(rol: string): string {
  if (rol === "ASISTENTE_SOCIAL") return "/social";
  if (rol === "ENFERMERO") return "/ambulatorio";
  return "/medico";
}
export function Login() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  if (usuario) {
    return <Navigate to={destinoPorRol(usuario.rol)} replace />;
  }

  async function onSubmit(datos: LoginForm) {
    setEnviando(true);
    try {
      const res = await login(datos.username, datos.password);
      toast.success(`Bienvenido/a, ${res.usuario.nombre ?? res.usuario.username}`);
      navigate(destinoPorRol(res.usuario.rol), { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiErrorClase ? err.message : "Error al autenticar credenciales");
    } finally {
      setEnviando(false);
    }
  }

  const setDemoUser = (user: string, pass: string) => {
    form.setValue("username", user);
    form.setValue("password", pass);
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-red-50/20 items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md">
        {/* Tarjeta Principal de Inicio de Sesión */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-lg shadow-slate-200/50">
          <div className="mb-6 flex flex-col items-center text-center">
            <HematoFlowLogo size="default" showSubtitle={false} className="mb-2" />
            <p className="text-xs text-slate-500">
              Ingresa tus credenciales para acceder al sistema
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-slate-700">
                      Usuario Institucional
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej. medico / social"
                        autoComplete="username"
                        className="h-10 rounded-xl bg-slate-50/70 border-slate-200 text-sm focus-visible:bg-white"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-hemato-crimson" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-slate-700">
                      Contraseña
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="h-10 rounded-xl bg-slate-50/70 border-slate-200 text-sm focus-visible:bg-white"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-hemato-crimson" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={enviando}
                className="w-full h-11 rounded-xl bg-hemato-crimson text-white font-semibold text-sm hover:bg-hemato-crimson-hover shadow-sm transition-all mt-2"
              >
                {enviando ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Ingresar al Sistema <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>
          </Form>

          {/* Accesos Rápidos de Prueba (Demo) */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Perfiles de Prueba Rápidos
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDemoUser("medico", "medico-2026")}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-sky-50 hover:border-tech-blue hover:text-tech-blue transition-colors text-left"
              >
                <Stethoscope className="h-4 w-4 text-tech-blue shrink-0" />
                <div>
                  <p className="font-semibold leading-tight">Médico</p>
                  <p className="text-[10px] text-slate-400">Dr. Hematólogo</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser("social", "social-2026")}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 hover:border-warning-amber hover:text-warning-amber transition-colors text-left"
              >
                <Users className="h-4 w-4 text-warning-amber shrink-0" />
                <div>
                  <p className="font-semibold leading-tight">Trabajo Social</p>
                  <p className="text-[10px] text-slate-400">Asistencia Social</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Garantías de Seguridad Médica */}
        <div className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-success-green" />
          <span>Instituto Nacional de Salud del Niño · Auditoría Médica Estricta</span>
        </div>
      </div>
    </div>
  );
}
