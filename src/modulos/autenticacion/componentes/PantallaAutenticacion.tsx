/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

"use client";

/**
 * MÓDULO: AUTENTICACIÓN — Pantalla de acceso
 * Inicio de sesión, autoregistro (si está habilitado en Ajustes)
 * y recuperación de contraseña (si está habilitada en Ajustes).
 */
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LogIn,
  UserPlus,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  Boxes,
  History,
  Send,
  Loader2,
} from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
import { ConmutadorIdioma } from "@/modulos/compartidos/ui";
import { claveErrorApi } from "@/modulos/compartidos/errores";
import { useVersionBranding, urlLogo } from "@/modulos/compartidos/branding";
import { useSesion } from "../servicios/sesion";
import {
  ErrorApiAuth,
  confirmarRecuperacion,
  obtenerBanderas,
  pedirCodigoRecuperacion,
} from "../servicios/api";
import type { BanderasAuth } from "../tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

function claveError(e: unknown): string {
  return claveErrorApi(e instanceof ErrorApiAuth ? e.codigo : "ERROR_INTERNO");
}

// ============================================================
// PANEL DE MARCA (ESCRITORIO)
// ============================================================
function PanelMarca() {
  const { t } = useIdioma();
  const version = useVersionBranding();
  const caracteristicas = [
    { icono: Boxes, texto: t("nav.descripcionInventario") },
    { icono: History, texto: t("nav.descripcionHistorial") },
    { icono: ShieldCheck, texto: t("app.eslogan") },
  ];
  return (
    <div className="relative hidden overflow-hidden bg-zinc-950 lg:flex lg:w-[46%] lg:flex-col lg:justify-between xl:w-[42%]">
      {/* Textura de fondo */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 70% -10%, rgba(245,158,11,.28), transparent), radial-gradient(ellipse 60% 50% at 20% 110%, rgba(245,158,11,.18), transparent)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative z-10 flex items-center gap-3 p-10">
        <img
          src={urlLogo(version)}
          alt={t("app.nombre")}
          className="h-12 w-12 rounded-2xl object-contain shadow-xl"
        />
        <div>
          <p className="text-xl font-bold text-white">{t("app.nombre")}</p>
          <p className="text-sm text-zinc-400">{t("app.eslogan")}</p>
        </div>
      </div>

      <div className="relative z-10 px-10 pb-10">
        <h2 className="max-w-md text-3xl font-bold leading-tight text-white">
          {t("auth.bienvenida")}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
          {t("auth.bienvenidaSub")}
        </p>
        <ul className="mt-8 space-y-4">
          {caracteristicas.map((c, i) => (
            <li key={i} className="flex items-center gap-3 text-sm text-zinc-300">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <c.icono className="h-4.5 w-4.5" aria-hidden />
              </span>
              {c.texto}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-10 px-10 pb-6 text-xs text-zinc-500">{t("app.derechos")}</p>
    </div>
  );
}

// ============================================================
// CAMPO DE CONTRASEÑA CON ALTERNAR VISIBILIDAD
// ============================================================
function CampoPassword({
  id,
  valor,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const { t } = useIdioma();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-11 pr-10"
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("auth.contrasena") : t("auth.contrasena")}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

// ============================================================
// DIÁLOGO DE RECUPERACIÓN DE CONTRASEÑA
// ============================================================
function DialogoRecuperacion({
  onCerrar,
  banderas,
}: {
  onCerrar: () => void;
  banderas: BanderasAuth | undefined;
}) {
  const { t } = useIdioma();
  const { toast } = useToast();
  const { refrescarSesion } = useSesion();

  const [paso, setPaso] = useState<"correo" | "codigo">("correo");
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  const [expiraMin, setExpiraMin] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function solicitarCodigo(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const resp = await pedirCodigoRecuperacion(correo.trim());
      setCodigoDemo(resp.codigo);
      setExpiraMin(resp.expiraMinutos);
      setPaso("codigo");
    } catch (err) {
      setError(t(claveError(err)));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmacion) {
      setError(t("auth.errorPasswordsNoCoinciden"));
      return;
    }
    setEnviando(true);
    try {
      await confirmarRecuperacion(correo.trim(), codigo.trim(), password);
      await refrescarSesion();
      toast({ description: t("auth.contrasenaRestablecida") });
      onCerrar();
    } catch (err) {
      setError(t(claveError(err)));
    } finally {
      setEnviando(false);
    }
  }

  // ===== Recuperación deshabilitada: gestión manual =====
  if (banderas && !banderas.recuperacionHabilitada) {
    return (
      <Dialog open onOpenChange={(v) => !v && onCerrar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" aria-hidden />
              {t("auth.recuperacionCerrada")}
            </DialogTitle>
            <DialogDescription>{t("auth.recuperacionCerradaSub")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onCerrar}>
              {t("comun.cerrar")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden />
            {t("auth.recuperacion")}
          </DialogTitle>
          <DialogDescription>
            {paso === "correo" ? t("auth.recuperacionSub") : t("auth.codigoEnviadoSub", { correo })}
          </DialogDescription>
        </DialogHeader>

        {paso === "correo" ? (
          <form onSubmit={solicitarCodigo} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rec-correo">{t("auth.correo")}</Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="rec-correo"
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder={t("auth.correoPlaceholder")}
                  className="h-11 pl-9"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full" disabled={enviando}>
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              {t("auth.enviarCodigo")}
            </Button>
          </form>
        ) : (
          <form onSubmit={confirmar} className="space-y-4">
            {codigoDemo && (
              <Alert className="border-primary/40 bg-primary/5">
                <AlertDescription>
                  <span className="block text-xs text-muted-foreground">
                    {t("auth.simulacionCorreo")}
                  </span>
                  <span className="mt-1 block select-all text-center text-2xl font-bold tracking-[0.4em] text-primary">
                    {codigoDemo}
                  </span>
                  <span className="mt-1 block text-center text-xs text-muted-foreground">
                    {t("auth.codigoExpira", { min: expiraMin })}
                  </span>
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="rec-codigo">{t("auth.codigoVerificacion")}</Label>
              <Input
                id="rec-codigo"
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                placeholder={t("auth.codigoPlaceholder")}
                className="h-11 text-center text-lg tracking-[0.3em]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-pass">{t("auth.nuevaContrasena")}</Label>
              <CampoPassword
                id="rec-pass"
                valor={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">{t("auth.politica")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-pass2">{t("auth.confirmarContrasena")}</Label>
              <CampoPassword
                id="rec-pass2"
                valor={confirmacion}
                onChange={setConfirmacion}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  setPaso("correo");
                  setError(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {t("auth.volver")}
              </Button>
              <Button type="submit" className="h-11 flex-1" disabled={enviando}>
                {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {t("auth.confirmarCambio")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// PANTALLA DE ACCESO
// ============================================================
/** Pantalla de acceso. Recibe la versión del sistema como prop desde el
 * shell raíz (heredada del Server Component src/app/page.tsx): única
 * fuente de verdad en package.json (@/lib/version). */
export function PantallaAutenticacion({
  versionDelSistema,
}: {
  versionDelSistema: string;
}) {
  const { t } = useIdioma();
  const { toast } = useToast();
  const { iniciarSesion, registrarse } = useSesion();
  const versionBranding = useVersionBranding();
  const { data: banderas } = useQuery<BanderasAuth>({
    queryKey: ["auth", "banderas"],
    queryFn: obtenerBanderas,
    staleTime: 30_000,
  });

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [recuperacionAbierta, setRecuperacionAbierta] = useState(false);

  async function iniciar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const usuario = await iniciarSesion(correo.trim(), password);
      toast({ description: t("auth.sesionIniciada", { nombre: usuario.nombre }) });
    } catch (err) {
      setError(t(claveError(err)));
    } finally {
      setCargando(false);
    }
  }

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmacion) {
      setError(t("auth.errorPasswordsNoCoinciden"));
      return;
    }
    setCargando(true);
    try {
      const usuario = await registrarse(nombre.trim(), correo.trim(), password);
      toast({ description: t("auth.cuentaCreada", { nombre: usuario.nombre }) });
    } catch (err) {
      setError(t(claveError(err)));
    } finally {
      setCargando(false);
    }
  }

  const registroHabilitado = banderas?.registroHabilitado ?? false;

  return (
    <div className="flex min-h-screen bg-background">
      <PanelMarca />

      {/* Columna de formulario */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4 sm:right-8 sm:top-8">
          <ConmutadorIdioma />
        </div>

        {/* Marca móvil */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <img
            src={urlLogo(versionBranding)}
            alt={t("app.nombre")}
            className="h-11 w-11 rounded-xl object-contain shadow-lg"
          />
          <div>
            <p className="text-lg font-bold leading-tight">{t("app.nombre")}</p>
            <p className="text-xs text-muted-foreground">{t("app.eslogan")}</p>
          </div>
        </div>

        <Card className="w-full max-w-md border-border/60 shadow-xl shadow-black/5">
          <CardContent className="p-6 sm:p-8">
            <Tabs defaultValue="acceso">
              <TabsList className={`grid w-full ${registroHabilitado ? "grid-cols-2" : "grid-cols-1"}`}>
                <TabsTrigger value="acceso" className="gap-2">
                  <LogIn className="h-4 w-4" aria-hidden />
                  {t("auth.iniciarSesion")}
                </TabsTrigger>
                {registroHabilitado && (
                  <TabsTrigger value="registro" className="gap-2">
                    <UserPlus className="h-4 w-4" aria-hidden />
                    {t("auth.registrarse")}
                  </TabsTrigger>
                )}
              </TabsList>

              {/* ===== Inicio de sesión ===== */}
              <TabsContent value="acceso" className="mt-6">
                <form onSubmit={iniciar} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-correo">{t("auth.correo")}</Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        id="login-correo"
                        type="email"
                        value={correo}
                        onChange={(e) => setCorreo(e.target.value)}
                        placeholder={t("auth.correoPlaceholder")}
                        className="h-11 pl-9"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-pass">{t("auth.contrasena")}</Label>
                    </div>
                    <CampoPassword
                      id="login-pass"
                      valor={password}
                      onChange={setPassword}
                      autoComplete="current-password"
                    />
                  </div>
                  {error && (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <Button type="submit" className="h-11 w-full" disabled={cargando}>
                    {cargando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {t("auth.iniciarSesion")}
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => setRecuperacionAbierta(true)}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {t("auth.olvidaste")}
                    </button>
                  </div>
                </form>
              </TabsContent>

              {/* ===== Autoregistro (condicional) ===== */}
              {registroHabilitado && (
                <TabsContent value="registro" className="mt-6">
                  <form onSubmit={registrar} className="space-y-4">
                    <p className="text-sm text-muted-foreground">{t("auth.crearCuentaSub")}</p>
                    <div className="space-y-2">
                      <Label htmlFor="reg-nombre">{t("auth.nombreCompleto")}</Label>
                      <Input
                        id="reg-nombre"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder={t("auth.nombrePlaceholder")}
                        className="h-11"
                        autoComplete="name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-correo">{t("auth.correo")}</Label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
                        <Input
                          id="reg-correo"
                          type="email"
                          value={correo}
                          onChange={(e) => setCorreo(e.target.value)}
                          placeholder={t("auth.correoPlaceholder")}
                          className="h-11 pl-9"
                          autoComplete="email"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-pass">{t("auth.contrasena")}</Label>
                      <CampoPassword
                        id="reg-pass"
                        valor={password}
                        onChange={setPassword}
                        autoComplete="new-password"
                      />
                      <p className="text-xs text-muted-foreground">{t("auth.politica")}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-pass2">{t("auth.confirmarContrasena")}</Label>
                      <CampoPassword
                        id="reg-pass2"
                        valor={confirmacion}
                        onChange={setConfirmacion}
                        autoComplete="new-password"
                      />
                    </div>
                    {error && (
                      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <Button type="submit" className="h-11 w-full" disabled={cargando}>
                      {cargando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      {t("auth.registrarse")}
                    </Button>
                  </form>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {/* Registro deshabilitado: aviso de gestión manual */}
        {banderas && !registroHabilitado && (
          <div className="mt-6 flex max-w-md items-start gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <span className="font-medium text-foreground">{t("auth.registroCerrado")}.</span>{" "}
              {t("auth.registroCerradoSub")}.
            </p>
          </div>
        )}

        <p className="mt-8 text-xs text-muted-foreground">{versionDelSistema}</p>
      </div>

      {recuperacionAbierta && (
        <DialogoRecuperacion
          onCerrar={() => setRecuperacionAbierta(false)}
          banderas={banderas}
        />
      )}
    </div>
  );
}
