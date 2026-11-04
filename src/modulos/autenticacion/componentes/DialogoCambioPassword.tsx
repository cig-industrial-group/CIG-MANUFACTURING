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
 * MÓDULO: AUTENTICACIÓN — Diálogo de cambio de contraseña propia
 * Se usa desde el menú de usuario (voluntario) y tras iniciar sesión
 * con una contraseña temporal (obligatorio).
 */
import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
import { claveErrorApi } from "@/modulos/compartidos/errores";
import { ErrorApiAuth, cambiarPassword } from "../servicios/api";
import { useSesion } from "../servicios/sesion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function DialogoCambioPassword({
  abierta,
  onCerrar,
  forzado = false,
}: {
  abierta: boolean;
  onCerrar: () => void;
  forzado?: boolean;
}) {
  const { t } = useIdioma();
  const { toast } = useToast();
  const { usuario, establecerUsuario } = useSesion();

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function reiniciar() {
    setActual("");
    setNueva("");
    setConfirmacion("");
    setError(null);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva !== confirmacion) {
      setError(t("auth.errorPasswordsNoCoinciden"));
      return;
    }
    setGuardando(true);
    try {
      await cambiarPassword(actual, nueva);
      toast({ description: t("auth.contrasenaCambiada") });
      if (usuario) {
        establecerUsuario({ ...usuario, debeCambiarPassword: false });
      }
      reiniciar();
      onCerrar();
    } catch (err) {
      setError(t(claveErrorApi(err instanceof ErrorApiAuth ? err.codigo : "ERROR_INTERNO")));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierta} onOpenChange={(v) => {
      if (!v && forzado) return; // no se puede omitir si es obligatorio
      if (!v) {
        reiniciar();
        onCerrar();
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden />
            {t("auth.cambiarContrasena")}
          </DialogTitle>
          <DialogDescription>
            {forzado ? t("auth.cambiarAhora") : t("auth.cambiarContrasenaSub")}
          </DialogDescription>
        </DialogHeader>

        {forzado && (
          <Alert className="border-amber-500/40 bg-amber-500/5">
            <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              {t("usuarios.debeCambiar")}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cp-actual">{t("auth.contrasenaActual")}</Label>
            <Input
              id="cp-actual"
              type="password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="h-11"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-nueva">{t("auth.nuevaContrasena")}</Label>
            <Input
              id="cp-nueva"
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              className="h-11"
              autoComplete="new-password"
              required
            />
            <p className="text-xs text-muted-foreground">{t("auth.politica")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirmar">{t("auth.confirmarContrasena")}</Label>
            <Input
              id="cp-confirmar"
              type="password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              className="h-11"
              autoComplete="new-password"
              required
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          {!forzado && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reiniciar();
                  onCerrar();
                }}
              >
                {t("comun.cancelar")}
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {t("comun.guardar")}
              </Button>
            </DialogFooter>
          )}
          {forzado && (
            <Button type="submit" className="h-11 w-full" disabled={guardando}>
              {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("auth.confirmarCambio")}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
