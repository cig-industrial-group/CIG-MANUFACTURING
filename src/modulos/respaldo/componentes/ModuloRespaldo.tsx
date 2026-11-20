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
 * MÓDULO: RESPALDO — Respaldo y restauración de la base de datos
 *
 * · Crear respaldos completos (instantánea consistente, en caliente).
 * · Restaurar un respaldo SIN reiniciar el servidor: la operación es
 *   transaccional; si algo falla, la base queda intacta.
 * · Cada restauración exitosa abre una ventana de 24 h para revertirla
 *   desde el snapshot pre-restauración que se crea automáticamente.
 * · Respaldo automático diario (se dispara al abrir el módulo).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DatabaseBackup,
  Database,
  FileUp,
  HardDriveDownload,
  History,
  Info,
  Loader2,
  Archive,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
} from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import { EncabezadoSeccion, EstadoVacio } from "@/modulos/compartidos/ui";
import {
  useCrearRespaldo,
  useEliminarRespaldo,
  useEstadoRespaldo,
  useRespaldoAutomatico,
  useRestaurarRespaldo,
  useRevertirRestauracion,
  useSubirRespaldo,
} from "../servicios/consultas";
import { ErrorApiRespaldo, urlDescarga } from "../servicios/api";
import type { FilaRespaldo, ResultadoRestauracion } from "../servicios/nucleo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ============================================================
// UTILIDADES
// ============================================================

/** Tamaño legible con unidades localizadas (B / KB / MB / GB) */
function formatearTamano(locale: string, bytes: number) {
  if (!bytes) return "—";
  const unidad = bytes < 1024 ? "byte" : bytes < 1024 ** 2 ? "kilobyte" : bytes < 1024 ** 3 ? "megabyte" : "gigabyte";
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: unidad,
    maximumFractionDigits: 1,
  }).format(bytes < 1024 ? bytes : bytes < 1024 ** 2 ? bytes / 1024 : bytes / 1024 ** 2);
}

/** hh h mm min (o «menos de un minuto») a partir de segundos */
function duracionLegible(segundos: number, t: (k: string) => string) {
  if (segundos <= 0) return null;
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h <= 0 && m <= 0) return t("respaldo.countdownMenosUnMinuto");
  if (h <= 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

// ============================================================
// STEP-UP: cadenas bilingües propias (TASK-STR-012, RF-A3)
// ============================================================
// Viven en este componente (no en el diccionario compartido) porque el
// alcance de la tarea se ciñe a los archivos del módulo de respaldo; se
// rigen por el mismo selector de idioma del sistema (useIdioma), de modo
// que el texto cambia al alternar ES/EN igual que el resto de la UI.

/** Códigos 400/401 del step-up con mensaje específico — nunca el toast
 *  genérico (RF-A3). DEMASIADOS_INTENTOS se traduce aparte porque interpola
 *  el tiempo restante del bloqueo. */
const CADENAS_STEPUP: Record<string, { es: string; en: string }> = {
  ID_Y_PASSWORD_REQUERIDOS: {
    es: "Falta el identificador del respaldo o tu contraseña de confirmación.",
    en: "The backup identifier or your confirmation password is missing.",
  },
  PASSWORD_REQUERIDA: {
    es: "Escribe tu contraseña para confirmar la operación.",
    en: "Enter your password to confirm the operation.",
  },
  PASSWORD_INCORRECTA: {
    es: "Contraseña incorrecta. Vuelve a intentarlo.",
    en: "Incorrect password. Try again.",
  },
};

/** Cadenas del informe de diferencias de cuentas (RF-A4) */
const CADENAS_INFORME: Record<string, { es: string; en: string }> = {
  titulo: { es: "Informe de cuentas", en: "Account report" },
  alerta: {
    es: "Esta operación modificó el plantel de cuentas: revisa cada entrada antes de continuar.",
    en: "This operation changed the account roster: review every entry before continuing.",
  },
  agregados: { es: "Cuentas agregadas", en: "Added accounts" },
  eliminados: { es: "Cuentas eliminadas", en: "Removed accounts" },
  modificados: { es: "Cuentas modificadas", en: "Modified accounts" },
  sinCambios: {
    es: "Sin cambios en cuentas: el plantel de usuarios quedó idéntico.",
    en: "No account changes: the user roster is unchanged.",
  },
};

/** Cadenas del campo de contraseña del step-up (RF-A2) */
const CADENAS_STEPUP_UI: Record<string, { es: string; en: string }> = {
  titulo: { es: "Tu contraseña de sesión", en: "Your sign-in password" },
  ayuda: {
    es: "Re-autenticación obligatoria: esta operación reemplaza toda la base de datos.",
    en: "Mandatory re-authentication: this operation replaces the entire database.",
  },
};

/** Texto bilingüe de una clave de CADENAS_STEPUP / CADENAS_INFORME */
function cadenaBilingue(tabla: Record<string, { es: string; en: string }>, clave: string, idioma: string) {
  const par = tabla[clave];
  if (!par) return clave;
  return idioma === "en" ? par.en : par.es;
}

/** Tiempo restante de bloqueo legible: «N min» o «menos de un minuto» */
function tiempoRestanteLegible(segundos: number | null, idioma: string) {
  const minutos = Math.ceil((segundos && segundos > 0 ? segundos : 0) / 60);
  if (minutos <= 0) return idioma === "en" ? "less than a minute" : "menos de un minuto";
  return `${minutos} min`;
}

/** Traduce los códigos de error del servicio. Los códigos del step-up
 *  (TASK-STR-012, RF-A3) tienen mensaje ESPECÍFICO y distinguible:
 *  PROHIBIDO el toast genérico para 400 ID_Y_PASSWORD_REQUERIDOS /
 *  PASSWORD_REQUERIDA, 401 PASSWORD_INCORRECTA, 429 DEMASIADOS_INTENTOS
 *  (con el tiempo restante del bloqueo) y 500 RESTAURACION_FALLIDA /
 *  REVERSION_FALLIDA (estos dos últimos vía diccionario, como siempre). */
function traducirError(e: unknown, t: (k: string) => string, idioma: string): string {
  if (e instanceof ErrorApiRespaldo) {
    if (e.codigo === "DEMASIADOS_INTENTOS") {
      const plantilla =
        idioma === "en"
          ? "Too many failed attempts: wait {tiempo} and try again."
          : "Demasiados intentos fallidos: espera {tiempo} e inténtalo de nuevo.";
      return plantilla.replace("{tiempo}", tiempoRestanteLegible(e.reintentoSeg, idioma));
    }
    if (CADENAS_STEPUP[e.codigo]) return cadenaBilingue(CADENAS_STEPUP, e.codigo, idioma);
    const claves = [
      "RESPALDO_NO_EXISTE",
      "RESPALDO_INCOMPATIBLE",
      "RESPALDO_CORRUPTO",
      "ARCHIVO_NO_DISPONIBLE",
      "ARCHIVO_INVALIDO",
      "ARCHIVO_VACIO",
      "ARCHIVO_NO_RESPALDO",
      "ARCHIVO_MUY_GRANDE",
      "HERRAMIENTA_PG_NO_DISPONIBLE",
      "RESPALDO_PERMISO_CREATEDB",
      "RESPALDO_FALLIDO",
      "URL_BD_INVALIDA",
      "BD_NO_DISPONIBLE",
      "VENTANA_EXPIRADA",
      "NADA_QUE_REVERTIR",
      "SNAPSHOT_NO_DISPONIBLE",
      "SNAPSHOT_EN_USO",
      "RESTAURACION_FALLIDA",
      "REVERSION_FALLIDA",
      "ID_REQUERIDO",
    ];
    if (claves.includes(e.codigo)) return t(`respaldo.err${e.codigo}`);
  }
  return t("comun.errorGenerico");
}

// ============================================================
// INSIGNIAS DE TIPO Y ESTADO
// ============================================================
function InsigniaTipo({ tipo }: { tipo: FilaRespaldo["tipo"] }) {
  const { t } = useIdioma();
  if (tipo === "MANUAL") {
    return <Badge variant="secondary">{t("respaldo.tipoManual")}</Badge>;
  }
  if (tipo === "AUTOMATICO") {
    return (
      <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary">
        {t("respaldo.tipoAutomatico")}
      </Badge>
    );
  }
  if (tipo === "PRE_RESTAURACION") {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        {t("respaldo.tipoPre")}
      </Badge>
    );
  }
  if (tipo === "SUBIDO") {
    return (
      <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400">
        {t("respaldo.tipoSubido")}
      </Badge>
    );
  }
  return <Badge variant="outline">{t("respaldo.tipoDetectado")}</Badge>;
}

// ============================================================
// DIÁLOGO: CONFIRMAR RESTAURACIÓN (nombre del archivo + CONTRASEÑA)
// ============================================================
// STEP-UP (TASK-STR-012, RF-A2): además de escribir el nombre del
// archivo, el operador debe teclear SU CONTRASEÑA en el mismo diálogo,
// ANTES de que la petición salga. La contraseña vive SOLO en el estado
// local y efímero de este diálogo (nunca en estado global ni storage) y
// se destruye al cerrar/reabrir (el componente se remonta por `key`).
function DialogoRestaurar({
  respaldo,
  abierto,
  onCerrar,
  ocupado,
  onConfirmar,
}: {
  respaldo: FilaRespaldo | null;
  abierto: boolean;
  onCerrar: () => void;
  ocupado: boolean;
  onConfirmar: (id: string, password: string) => void;
}) {
  const { t, idioma } = useIdioma();
  const [texto, setTexto] = useState("");
  const [password, setPassword] = useState("");

  if (!respaldo) return null;
  // La habilitación exige el archivo exacto; la CONTRASEÑA la valida el
  // servidor: una vacía produce el 400 específico visible en el toast
  // (RF-A3: ID_Y_PASSWORD_REQUERIDOS traducido, nunca el genérico) y la
  // operación jamás se ejecuta sin re-autenticación (ASVS 6.2.2).
  const confirmado = texto.trim() === respaldo.archivo;

  return (
    <AlertDialog open={abierto} onOpenChange={(v) => !ocupado && (v ? undefined : onCerrar())}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="h-5 w-5" aria-hidden />
            {t("respaldo.restaurarTitulo")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                {t("respaldo.restaurarAdvertencia1")}{" "}
                <span className="font-semibold text-foreground">{respaldo.archivo}</span>
                {t("respaldo.restaurarAdvertencia2")}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>{t("respaldo.restaurarDetalle1")}</li>
                <li>{t("respaldo.restaurarDetalle2")}</li>
                <li>{t("respaldo.restaurarDetalle3")}</li>
              </ul>
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>{t("respaldo.restaurarDetalleSesion")}</p>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-foreground">
                  {t("respaldo.confirmarEscribiendo")}
                </p>
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={respaldo.archivo}
                  disabled={ocupado}
                  aria-label={t("respaldo.confirmarEscribiendo")}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              {/* Contraseña del operador — re-autenticación (ASVS 6.2.2).
                  Sin autocompletado y sin persistencia: estado local del
                  diálogo que se destruye al cerrar. */}
              <div className="space-y-2">
                <p className="font-medium text-foreground">
                  <ShieldAlert className="mr-1 inline h-4 w-4 text-primary" aria-hidden />
                  {cadenaBilingue(CADENAS_STEPUP_UI, "titulo", idioma)}
                </p>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  disabled={ocupado}
                  aria-label={cadenaBilingue(CADENAS_STEPUP_UI, "titulo", idioma)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  {cadenaBilingue(CADENAS_STEPUP_UI, "ayuda", idioma)}
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>{t("comun.cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!confirmado || ocupado}
            onClick={(e) => {
              e.preventDefault();
              if (confirmado && !ocupado) onConfirmar(respaldo.id, password);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {ocupado ? t("respaldo.restaurando") : t("respaldo.restaurarBoton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// DIÁLOGO: CONFIRMAR REVERSIÓN (escribir REVERTIR + CONTRASEÑA)
// ============================================================
// STEP-UP (RF-A2): misma re-autenticación que restaurar, ANTES de la
// petición. Contraseña solo en estado local del diálogo, sin
// autocompletado, destruida al cerrar/reabrir.
function DialogoRevertir({
  abierto,
  onCerrar,
  ocupado,
  onConfirmar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  ocupado: boolean;
  onConfirmar: (password: string) => void;
}) {
  const { t, idioma } = useIdioma();
  const [texto, setTexto] = useState("");
  const [password, setPassword] = useState("");

  const palabra = t("respaldo.palabraRevertir");
  // La habilitación exige la palabra; la CONTRASEÑA la valida el servidor
  // (400 PASSWORD_REQUERIDA específico y visible si va vacía — RF-A3).
  const confirmado = texto.trim().toUpperCase() === palabra.toUpperCase();

  return (
    <AlertDialog open={abierto} onOpenChange={(v) => !ocupado && (v ? undefined : onCerrar())}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" aria-hidden />
            {t("respaldo.revertirTitulo")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>{t("respaldo.revertirAdvertencia")}</p>
              <div className="space-y-2">
                <p className="font-medium text-foreground">{t("respaldo.confirmarEscribiendoPalabra")}</p>
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={palabra}
                  disabled={ocupado}
                  aria-label={t("respaldo.confirmarEscribiendoPalabra")}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              {/* Contraseña del operador — re-autenticación (ASVS 6.2.2) */}
              <div className="space-y-2">
                <p className="font-medium text-foreground">
                  <ShieldAlert className="mr-1 inline h-4 w-4 text-primary" aria-hidden />
                  {cadenaBilingue(CADENAS_STEPUP_UI, "titulo", idioma)}
                </p>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  disabled={ocupado}
                  aria-label={cadenaBilingue(CADENAS_STEPUP_UI, "titulo", idioma)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  {cadenaBilingue(CADENAS_STEPUP_UI, "ayuda", idioma)}
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>{t("comun.cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!confirmado || ocupado}
            onClick={(e) => {
              e.preventDefault();
              if (confirmado && !ocupado) onConfirmar(password);
            }}
          >
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {ocupado ? t("respaldo.revirtiendo") : t("respaldo.revertirBoton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// DIÁLOGO: RESULTADO DE RESTAURACIÓN / REVERSIÓN
// ============================================================
// RF-A4 (TASK-STR-012): tras el éxito se MUESTRA el informeDiferencias
// completo — cuentas agregadas, eliminadas y MODIFICADAS (rol, estado o
// contraseña sustituida). Con agregados o mutaciones de privilegio el
// informe lleva DISTINTIVO DE ALERTA; sin cambios se dice explícitamente.
function DialogoResultado({
  resultado,
  onRecargar,
}: {
  resultado: ResultadoRestauracion | null;
  onRecargar: () => void;
}) {
  const { t, idioma } = useIdioma();
  const f = useFormateadores();
  if (!resultado) return null;
  const exito = resultado.restauracion.estado === "COMPLETADA";

  // Informe de diferencias (defensivo: en éxito siempre llega; ante un
  // null imposible se trata como plantel sin cambios).
  const informe = resultado.informeDiferencias ?? { agregados: [], eliminados: [], modificados: [] };
  const hayAgregados = informe.agregados.length > 0;
  const hayEliminados = informe.eliminados.length > 0;
  const hayModificados = informe.modificados.length > 0;
  const sinCambios = exito && !hayAgregados && !hayEliminados && !hayModificados;
  // Distintivo de alerta: la operación INTRODUJO cuentas o MUTÓ cuentas
  // existentes (rol/estado/contraseña) — firma de respaldo envenenado o
  // de escalada involuntaria de accesos (hallazgos H5/B-7).
  const alerta = exito && (hayAgregados || hayModificados);

  return (
    <AlertDialog open onOpenChange={() => undefined}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {exito ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <TriangleAlert className="h-5 w-5 text-destructive" aria-hidden />
            )}
            {resultado.resumen.tipo === "REVERSION"
              ? exito
                ? t("respaldo.reversionExitosa")
                : t("respaldo.reversionFallida")
              : exito
                ? t("respaldo.restauracionExitosa")
                : t("respaldo.restauracionFallida")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {exito ? (
                <>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {t("respaldo.columnaRegistros")}
                      </p>
                      <p className="font-semibold">{f.entero(resultado.resumen.totalRegistros)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {t("respaldo.duracion")}
                      </p>
                      <p className="font-semibold">
                        {(resultado.resumen.duracionMs / 1000).toFixed(1)} s
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {t("respaldo.puedeRevertirHasta")}
                      </p>
                      <p className="font-semibold">
                        {resultado.resumen.ventanaReversaHasta
                          ? f.fechaHora(resultado.resumen.ventanaReversaHasta)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {/* ===== Informe de diferencias de cuentas (RF-A4) ===== */}
                  <div
                    className={
                      alerta
                        ? "rounded-lg border border-amber-500/50 bg-amber-500/10 p-3"
                        : "rounded-lg border p-3"
                    }
                  >
                    <p
                      className={
                        "flex items-center gap-2 text-xs font-semibold uppercase tracking-wider " +
                        (alerta ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")
                      }
                    >
                      {alerta && <ShieldAlert className="h-4 w-4" aria-hidden />}
                      {cadenaBilingue(CADENAS_INFORME, "titulo", idioma)}
                    </p>
                    {alerta && (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {cadenaBilingue(CADENAS_INFORME, "alerta", idioma)}
                      </p>
                    )}
                    {sinCambios ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {cadenaBilingue(CADENAS_INFORME, "sinCambios", idioma)}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {hayAgregados && (
                          <div>
                            <p className="text-xs font-semibold text-foreground">
                              {cadenaBilingue(CADENAS_INFORME, "agregados", idioma)}
                            </p>
                            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 font-mono text-xs">
                              {informe.agregados.map((cuenta) => (
                                <li key={cuenta}>{cuenta}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {hayEliminados && (
                          <div>
                            <p className="text-xs font-semibold text-foreground">
                              {cadenaBilingue(CADENAS_INFORME, "eliminados", idioma)}
                            </p>
                            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 font-mono text-xs">
                              {informe.eliminados.map((cuenta) => (
                                <li key={cuenta}>{cuenta}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {hayModificados && (
                          <div>
                            <p className="text-xs font-semibold text-foreground">
                              {cadenaBilingue(CADENAS_INFORME, "modificados", idioma)}
                            </p>
                            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 font-mono text-xs">
                              {informe.modificados.map((cuenta) => (
                                <li key={cuenta}>{cuenta}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <p>{t("respaldo.ventanaInfo")}</p>
                </>
              ) : (
                <p>{t("respaldo.falloInfo")}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onRecargar}>
            {t("comun.cerrar")}
          </Button>
          <Button onClick={onRecargar}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t("respaldo.recargar")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// VISTA PRINCIPAL
// ============================================================
export function ModuloRespaldo() {
  const { t, locale, idioma } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const tamano = (bytes: number) => formatearTamano(locale, bytes);

  const { data, isLoading } = useEstadoRespaldo();
  const crear = useCrearRespaldo();
  const eliminar = useEliminarRespaldo();
  const restaurar = useRestaurarRespaldo();
  const revertir = useRevertirRestauracion();
  const auto = useRespaldoAutomatico();
  const subir = useSubirRespaldo();

  const [etiqueta, setEtiqueta] = useState("");
  const [aRestaurar, setARestaurar] = useState<FilaRespaldo | null>(null);
  const [revertirAbierto, setRevertirAbierto] = useState(false);
  const [aEliminar, setAEliminar] = useState<FilaRespaldo | null>(null);
  const [resultado, setResultado] = useState<ResultadoRestauracion | null>(null);
  const [archivoSubida, setArchivoSubida] = useState<File | null>(null);
  const entradaArchivo = useRef<HTMLInputElement | null>(null);
  // Nonce de apertura: reinicia el estado interno de los diálogos al abrirlos
  const [apertura, setApertura] = useState(0);

  // ===== Respaldo automático diario (una sola vez por carga del módulo) =====
  // La referencia autoDisparado garantiza que el disparo ocurra una sola vez:
  // las dependencias completas solo añaden ejecuciones que retornan de inmediato.
  const autoDisparado = useRef(false);
  useEffect(() => {
    if (autoDisparado.current || isLoading || !data?.autoPendiente) return;
    autoDisparado.current = true;
    auto.mutate(undefined, {
      onSuccess: (resp) => {
        if (resp.respaldo) {
          toast({ description: t("respaldo.autoCreado") });
        }
      },
      onError: () => undefined, // silencioso: no interrumpe la operación
    });
  }, [isLoading, data?.autoPendiente, auto, t, toast]);

  // ===== Cuenta regresiva de la ventana de reversión =====
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const segundosRestantes = useMemo(() => {
    const objetivo = data?.reversion.segundosRestantes;
    if (objetivo == null || !data?.ultimaRestauracion?.ventanaReversaHasta) return objetivo ?? null;
    return Math.max(
      0,
      Math.floor((new Date(data.ultimaRestauracion.ventanaReversaHasta).getTime() - ahora) / 1000),
    );
  }, [ahora, data]);

  // ===== Acciones =====
  async function confirmarRestauracion(id: string, password: string) {
    try {
      const res = await restaurar.mutateAsync({ id, password });
      setARestaurar(null);
      setResultado(res);
    } catch (e) {
      setARestaurar(null);
      toast({ description: traducirError(e, t, idioma), variant: "destructive" });
    }
  }

  async function confirmarReversion(password: string) {
    try {
      const res = await revertir.mutateAsync(password);
      setRevertirAbierto(false);
      setResultado(res);
    } catch (e) {
      setRevertirAbierto(false);
      toast({ description: traducirError(e, t, idioma), variant: "destructive" });
    }
  }

  async function confirmarEliminacion() {
    if (!aEliminar) return;
    const objetivo = aEliminar;
    setAEliminar(null);
    try {
      await eliminar.mutateAsync(objetivo.id);
      toast({ description: t("respaldo.eliminado") });
    } catch (e) {
      toast({ description: traducirError(e, t, idioma), variant: "destructive" });
    }
  }

  async function crearManual() {
    try {
      await crear.mutateAsync(etiqueta.trim() || undefined);
      setEtiqueta("");
      toast({ description: t("respaldo.creado") });
    } catch (e) {
      toast({ description: traducirError(e, t, idioma), variant: "destructive" });
    }
  }

  // ===== Restaurar desde archivo subido =====
  async function subirYRestaurar() {
    if (!archivoSubida) return;
    const objetivo = archivoSubida;
    if (!objetivo.name.toLowerCase().endsWith(".dump")) {
      toast({ description: t("respaldo.errARCHIVO_INVALIDO"), variant: "destructive" });
      return;
    }
    try {
      const { respaldo } = await subir.mutateAsync(objetivo);
      setArchivoSubida(null);
      toast({ description: t("respaldo.subidoOk") });
      // Directo al diálogo de confirmación (escribir el nombre del archivo)
      setARestaurar(respaldo);
      setApertura((n) => n + 1);
    } catch (e) {
      toast({ description: traducirError(e, t, idioma), variant: "destructive" });
    }
  }

  const ocupado = restaurar.isPending || revertir.isPending || subir.isPending;
  const ultima = data?.ultimaRestauracion ?? null;
  const ultimoRespaldo = data?.respaldos.find((r) => r.tipo !== "PRE_RESTAURACION") ?? null;

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("respaldo.titulo")}
        descripcion={t("respaldo.subtitulo")}
        icono={<DatabaseBackup className="h-5 w-5" aria-hidden />}
      />

      {/* ===== Cómo funciona ===== */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icono: <HardDriveDownload className="h-4 w-4" aria-hidden />, texto: t("respaldo.explicacion1") },
          { icono: <Database className="h-4 w-4" aria-hidden />, texto: t("respaldo.explicacion2") },
          { icono: <Timer className="h-4 w-4" aria-hidden />, texto: t("respaldo.explicacion3") },
        ].map((paso, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {paso.icono}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{paso.texto}</p>
          </div>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          {/* ===== Estado actual + crear respaldo ===== */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <p className="font-semibold">{t("respaldo.crear")}</p>
                      <p className="text-sm text-muted-foreground">{t("respaldo.crearDesc")}</p>
                    </div>
                    <div className="flex max-w-md flex-col gap-2 sm:flex-row">
                      <Input
                        value={etiqueta}
                        onChange={(e) => setEtiqueta(e.target.value)}
                        placeholder={t("respaldo.etiquetaPlaceholder")}
                        aria-label={t("respaldo.etiqueta")}
                        disabled={crear.isPending}
                        maxLength={120}
                      />
                      <Button onClick={crearManual} disabled={createDisabled(crear.isPending, ocupado)} className="shrink-0">
                        {crear.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <HardDriveDownload className="h-4 w-4" aria-hidden />
                        )}
                        {crear.isPending ? t("respaldo.creando") : t("respaldo.crear")}
                      </Button>
                    </div>
                  </div>
                  <div className="shrink-0 space-y-1.5 border-t pt-4 text-sm sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                    <p className="text-muted-foreground">
                      {t("respaldo.registrosActuales")}:{" "}
                      <span className="font-semibold text-foreground">{f.entero(data.totalRegistrosVivos)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {t("respaldo.tamanoBase")}:{" "}
                      <span className="font-semibold text-foreground">{tamano(data.tamanoBaseBytes)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {t("respaldo.ultimoRespaldo")}:{" "}
                      <span className="font-semibold text-foreground">
                        {ultimoRespaldo ? f.fechaHora(ultimoRespaldo.creadoEn) : "—"}
                      </span>
                    </p>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <p>{t("respaldo.autoDesc")}</p>
                </div>
              </CardContent>
            </Card>

            {/* ===== Última restauración / reversión ===== */}
            <Card>
              <CardContent className="flex h-full flex-col p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" aria-hidden />
                  <p className="font-semibold">{t("respaldo.ultimaRestauracion")}</p>
                </div>

                {!ultima ? (
                  <div className="mt-4 flex flex-1 items-center">
                    <p className="text-sm text-muted-foreground">{t("respaldo.sinRestauraciones")}</p>
                  </div>
                ) : (
                  <div className="mt-3 flex-1 space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          ultima.estado === "COMPLETADA"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : ultima.estado === "FALLIDA"
                              ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }
                      >
                        {ultima.estado === "COMPLETADA"
                          ? t("respaldo.estadoCompletada")
                          : ultima.estado === "FALLIDA"
                            ? t("respaldo.estadoFallida")
                            : t("respaldo.estadoEnProgreso")}
                      </Badge>
                      {ultima.tipo === "REVERSION" && (
                        <Badge variant="secondary">{t("respaldo.esReversion")}</Badge>
                      )}
                      {ultima.revertidaEn && (
                        <Badge variant="outline">{t("respaldo.yaRevertida")}</Badge>
                      )}
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <p className="font-mono text-xs text-foreground">{ultima.respaldoArchivo}</p>
                      <p>{f.fechaHora(ultima.iniciadaEn)}</p>
                      {ultima.ejecutadaPor && (
                        <p>
                          {t("respaldo.ejecutadaPor")} <span className="text-foreground">{ultima.ejecutadaPor}</span>
                        </p>
                      )}
                    </div>

                    {/* Ventana de reversión */}
                    {data.reversion.puedeRevertir ? (
                      <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                          {t("respaldo.tiempoRestante")}
                        </p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums">
                          {duracionLegible(segundosRestantes ?? 0, t) ?? "—"}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => {
                            setRevertirAbierto(true);
                            setApertura((n) => n + 1);
                          }}
                          disabled={ocupado}
                        >
                          <Undo2 className="h-4 w-4" aria-hidden />
                          {t("respaldo.revertir")}
                        </Button>
                      </div>
                    ) : (
                      ultima.estado === "COMPLETADA" &&
                      !ultima.revertidaEn && (
                        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                          {data.reversion.motivo === "VENTANA_EXPIRADA"
                            ? t("respaldo.ventanaExpirada")
                            : data.reversion.motivo === "SNAPSHOT_NO_DISPONIBLE"
                              ? t("respaldo.errSNAPSHOT_NO_DISPONIBLE")
                              : t("respaldo.ventanaInfo")}
                        </p>
                      )
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ===== Restaurar desde archivo subido ===== */}
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-primary" aria-hidden />
                    <p className="font-semibold">{t("respaldo.desdeArchivoTitulo")}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("respaldo.desdeArchivoDesc")}</p>
                </div>
              </div>
              <Separator className="my-4" />
              <input
                ref={entradaArchivo}
                type="file"
                accept=".dump"
                className="hidden"
                aria-label={t("respaldo.elegirArchivo")}
                onChange={(e) => {
                  const elegido = e.target.files?.[0] ?? null;
                  if (elegido && !elegido.name.toLowerCase().endsWith(".dump")) {
                    toast({ description: t("respaldo.errARCHIVO_INVALIDO"), variant: "destructive" });
                    e.target.value = "";
                    return;
                  }
                  setArchivoSubida(elegido);
                  e.target.value = ""; // permite volver a elegir el mismo archivo
                }}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  onClick={() => entradaArchivo.current?.click()}
                  disabled={ocupado}
                  className="shrink-0"
                >
                  <FileUp className="h-4 w-4" aria-hidden />
                  {t("respaldo.elegirArchivo")}
                </Button>
                <div className="min-w-0 flex-1">
                  {archivoSubida && (
                    <p className="truncate text-sm">
                      <span className="text-muted-foreground">{t("respaldo.archivoSeleccionado")}: </span>
                      <span className="font-medium text-foreground">{archivoSubida.name}</span>
                      <span className="text-muted-foreground"> ({tamano(archivoSubida.size)})</span>
                    </p>
                  )}
                </div>
                <Button
                  onClick={subirYRestaurar}
                  disabled={!archivoSubida || subir.isPending || ocupado}
                  className="shrink-0"
                >
                  {subir.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden />
                  )}
                  {subir.isPending ? t("respaldo.subiendoArchivo") : t("respaldo.subirArchivoBoton")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ===== Tabla de respaldos ===== */}
          <Card>
            <CardContent className="p-0 sm:p-0">
              <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-primary" aria-hidden />
                  <p className="font-semibold">{t("respaldo.respaldosDisponibles")}</p>
                </div>
                <p className="text-xs text-muted-foreground">{t("respaldo.carpetaNota")}</p>
              </div>

              {data.respaldos.length === 0 ? (
                <div className="p-6">
                  <EstadoVacio
                    titulo={t("respaldo.sinRespaldos")}
                    descripcion={t("respaldo.sinRespaldosDesc")}
                    icono={<DatabaseBackup className="h-6 w-6" aria-hidden />}
                  />
                </div>
              ) : (
                <div className="max-h-[28rem] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>{t("respaldo.columnaRespaldo")}</TableHead>
                        <TableHead>{t("respaldo.columnaTipo")}</TableHead>
                        <TableHead className="hidden md:table-cell">{t("respaldo.columnaFecha")}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t("respaldo.columnaTamano")}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t("respaldo.columnaRegistros")}</TableHead>
                        <TableHead className="text-right">{t("respaldo.columnaAcciones")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.respaldos.map((r) => {
                        const esPuntoReversion =
                          r.tipo === "PRE_RESTAURACION" &&
                          data.reversion.puedeRevertir &&
                          ultima?.snapshotPre === r.archivo;
                        const puedeEliminar = !esPuntoReversion;
                        return (
                          <TableRow key={r.id} className={cn(r.tipo === "PRE_RESTAURACION" && "bg-amber-500/5")}>
                            <TableCell className="max-w-56">
                              <p className="truncate font-medium">{r.etiqueta ?? r.archivo}</p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">
                                {r.archivo}
                                {r.creadoPor ? ` · ${r.creadoPor}` : ""}
                              </p>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                <InsigniaTipo tipo={r.tipo} />
                                {esPuntoReversion && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                    {t("respaldo.puntoReversion")}
                                  </span>
                                )}
                                {!r.compatible && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                                    {t("respaldo.incompatible")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                              {f.fechaHora(r.creadoEn)}
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                              {tamano(r.tamanoBytes)}
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                              {/* SUBIDO/DETECTADO: el conteo se verifica al restaurar */}
                              {r.totalRegistros > 0 ? f.entero(r.totalRegistros) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9"
                                      disabled={!r.compatible || ocupado}
                                      onClick={() => {
                                        setARestaurar(r);
                                        setApertura((n) => n + 1);
                                      }}
                                      aria-label={t("respaldo.restaurar")}
                                    >
                                      <History className="h-4 w-4" aria-hidden />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t("respaldo.restaurar")}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
                                      <a
                                        href={urlDescarga(r.id)}
                                        download={r.archivo}
                                        aria-label={t("respaldo.descargar")}
                                      >
                                        <HardDriveDownload className="h-4 w-4" aria-hidden />
                                      </a>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t("respaldo.descargar")}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9 text-destructive hover:text-destructive"
                                      disabled={!puedeEliminar || ocupado}
                                      onClick={() => setAEliminar(r)}
                                      aria-label={t("comun.eliminar")}
                                    >
                                      <Trash2 className="h-4 w-4" aria-hidden />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {puedeEliminar ? t("comun.eliminar") : t("respaldo.errSNAPSHOT_EN_USO")}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ===== Diálogos ===== */}
      <DialogoRestaurar
        key={`restaurar-${apertura}`}
        respaldo={aRestaurar}
        abierto={aRestaurar !== null}
        onCerrar={() => setARestaurar(null)}
        ocupado={restaurar.isPending}
        onConfirmar={confirmarRestauracion}
      />
      <DialogoRevertir
        key={`revertir-${apertura}`}
        abierto={revertirAbierto}
        onCerrar={() => setRevertirAbierto(false)}
        ocupado={revertir.isPending}
        onConfirmar={confirmarReversion}
      />
      <AlertDialog
        open={aEliminar !== null}
        onOpenChange={(v) => !v && setAEliminar(null)}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("respaldo.eliminarTitulo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("respaldo.eliminarAdvertencia")}{" "}
              <span className="font-mono text-xs">{aEliminar?.archivo}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("comun.cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarEliminacion();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("comun.eliminar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DialogoResultado resultado={resultado} onRecargar={() => window.location.reload()} />
    </div>
  );
}

/** El botón crear se bloquea mientras otra operación crítica corre */
function createDisabled(creando: boolean, ocupado: boolean) {
  return creando || ocupado;
}
