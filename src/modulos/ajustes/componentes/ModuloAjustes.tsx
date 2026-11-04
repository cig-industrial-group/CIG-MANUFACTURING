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
 * MÓDULO: AJUSTES — Configuración de seguridad y acceso
 * Permite activar/desactivar:
 *   · El autoregistro de cuentas desde la pantalla de acceso
 *   · La recuperación automática de contraseña
 * Cuando una opción está desactivada, la operación únicamente puede
 * realizarla un rol con privilegios (p. ej. TI o Administrador) desde
 * el módulo de Usuarios.
 */
import { useEffect, useState } from "react";
import {
  Settings2,
  UserPlus,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Info,
} from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  EncabezadoSeccion,
} from "@/modulos/compartidos/ui";
import { useAjustes, useGuardarAjustes } from "../servicios/consultas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// TARJETA DE AJUSTE CON INTERRUPTOR
// ============================================================
function TarjetaAjuste({
  icono,
  titulo,
  descripcion,
  habilitado,
  onCambiar,
  guardando,
  textoOn,
  textoOff,
  extra,
}: {
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  habilitado: boolean;
  onCambiar: (valor: boolean) => void;
  guardando: boolean;
  textoOn: string;
  textoOff: string;
  extra?: React.ReactNode;
}) {
  const { t } = useIdioma();
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                habilitado
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {habilitado ? (
                <ShieldCheck className="h-5 w-5" aria-hidden />
              ) : (
                <ShieldAlert className="h-5 w-5" aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{titulo}</p>
                <Badge
                  variant="outline"
                  className={
                    habilitado
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : ""
                  }
                >
                  {habilitado ? t("ajustes.habilitado") : t("ajustes.deshabilitado")}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
              <p
                className={`mt-2.5 rounded-md px-3 py-2 text-xs leading-relaxed ${
                  habilitado
                    ? "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/5 text-amber-700 dark:text-amber-400"
                }`}
              >
                {habilitado ? textoOn : textoOff}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <Switch
              checked={habilitado}
              onCheckedChange={onCambiar}
              disabled={guardando}
              aria-label={titulo}
            />
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
          </div>
        </div>
        {extra}
      </CardContent>
    </Card>
  );
}

// ============================================================
// VISTA PRINCIPAL: AJUSTES
// ============================================================
export function ModuloAjustes() {
  const { t, idioma } = useIdioma();
  const { toast } = useToast();
  const { data, isLoading } = useAjustes();
  const guardar = useGuardarAjustes();

  const [registro, setRegistro] = useState(true);
  const [recuperacion, setRecuperacion] = useState(true);
  const [rolRegistro, setRolRegistro] = useState("OPERADOR");

  // Sincronizar estado local con el servidor
  useEffect(() => {
    if (data?.ajustes) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegistro(data.ajustes.registroHabilitado);
      setRecuperacion(data.ajustes.recuperacionHabilitada);
      setRolRegistro(data.ajustes.rolRegistro);
    }
  }, [data]);

  async function cambiarRegistro(valor: boolean) {
    setRegistro(valor);
    try {
      await guardar.mutateAsync({ registroHabilitado: valor });
      toast({ description: t("ajustes.guardado") });
    } catch {
      setRegistro(!valor);
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    }
  }

  async function cambiarRecuperacion(valor: boolean) {
    setRecuperacion(valor);
    try {
      await guardar.mutateAsync({ recuperacionHabilitada: valor });
      toast({ description: t("ajustes.guardado") });
    } catch {
      setRecuperacion(!valor);
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    }
  }

  async function cambiarRolRegistro(clave: string) {
    const anterior = rolRegistro;
    setRolRegistro(clave);
    try {
      await guardar.mutateAsync({ rolRegistro: clave });
      toast({ description: t("ajustes.guardado") });
    } catch {
      setRolRegistro(anterior);
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("ajustes.titulo")}
        descripcion={t("ajustes.subtitulo")}
        icono={<Settings2 className="h-5 w-5" aria-hidden />}
      />

      {/* Nota de gestión manual */}
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>
          <span className="font-medium text-foreground">{t("ajustes.gestionManual")}: </span>
          {t("ajustes.gestionManualDesc")}
        </p>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
        {t("ajustes.seguridad")}
      </p>

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* ===== Registro de usuarios ===== */}
          <TarjetaAjuste
            icono={<UserPlus className="h-5 w-5" aria-hidden />}
            titulo={t("ajustes.registro")}
            descripcion={t("ajustes.registroDesc")}
            habilitado={registro}
            onCambiar={cambiarRegistro}
            guardando={guardar.isPending}
            textoOn={t("ajustes.registroOn")}
            textoOff={t("ajustes.registroOff")}
            extra={
              registro && (
                <div className="mt-4 max-w-xs space-y-2 border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("ajustes.rolRegistro")}
                  </p>
                  <Select value={rolRegistro} onValueChange={cambiarRolRegistro}>
                    <SelectTrigger className="w-full" aria-label={t("ajustes.rolRegistro")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.roles.map((r) => (
                        <SelectItem key={r.id} value={r.clave}>
                          {idioma === "es" ? r.nombre : r.nombreEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("ajustes.rolRegistroDesc")}</p>
                </div>
              )
            }
          />

          {/* ===== Recuperación automática de contraseña ===== */}
          <TarjetaAjuste
            icono={<KeyRound className="h-5 w-5" aria-hidden />}
            titulo={t("ajustes.recuperacion")}
            descripcion={t("ajustes.recuperacionDesc")}
            habilitado={recuperacion}
            onCambiar={cambiarRecuperacion}
            guardando={guardar.isPending}
            textoOn={t("ajustes.recuperacionOn")}
            textoOff={t("ajustes.recuperacionOff")}
          />
        </div>
      )}
    </div>
  );
}
