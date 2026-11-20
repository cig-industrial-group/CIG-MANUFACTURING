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
 * MÓDULO: USUARIOS — Gestión de cuentas
 * Creación, edición, restablecimiento de contraseña y activación/desactivación.
 * Exclusivo para roles con el permiso «usuarios.gestionar» (p. ej. TI o Administrador).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  Pencil,
  Search,
  KeyRound,
  Power,
  Trash2,
  Copy,
  Check,
  Info,
  ShieldCheck,
} from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  DialogoEliminarRegistro,
  EncabezadoSeccion,
  EstadoVacio,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import { claveErrorApi } from "@/modulos/compartidos/errores";
import { useSesion } from "@/modulos/autenticacion/servicios/sesion";
import type { UsuarioLista } from "@/modulos/autenticacion/tipos";
import {
  useActualizarUsuario,
  useCrearUsuario,
  useEliminarUsuario,
  useRoles,
  useUsuarios,
} from "../servicios/consultas";
import { ErrorApiUsuarios } from "../servicios/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// ============================================================
// DIÁLOGO: CREAR / EDITAR USUARIO
// Se monta al abrirse (patrón key) para inicializar estado fresco
// ============================================================
function DialogoUsuario({
  onCerrar,
  editando,
}: {
  onCerrar: () => void;
  editando: UsuarioLista | null;
}) {
  const { t, idioma } = useIdioma();
  const { toast } = useToast();
  const { data: roles } = useRoles();
  const crear = useCrearUsuario();
  const actualizar = useActualizarUsuario();

  const [nombre, setNombre] = useState(editando?.nombre ?? "");
  const [correo, setCorreo] = useState(editando?.correo ?? "");
  const [rolId, setRolId] = useState(editando?.rol.id ?? "");
  const [password, setPassword] = useState("");
  const [generarPassword, setGenerarPassword] = useState(true);
  const [debeCambiar, setDebeCambiar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordTemporal, setPasswordTemporal] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function guardar() {
    setError(null);
    if (!nombre.trim() || !correo.trim() || !rolId) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    if (!editando && !generarPassword && !password) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    try {
      if (editando) {
        await actualizar.mutateAsync({
          id: editando.id,
          cuerpo: { accion: "actualizar", nombre: nombre.trim(), correo: correo.trim(), rolId },
        });
        toast({ description: t("usuarios.usuarioActualizado") });
      } else {
        const resp = await crear.mutateAsync({
          nombre: nombre.trim(),
          correo: correo.trim(),
          rolId,
          ...(generarPassword
            ? { generarPassword: true, debeCambiarPassword: debeCambiar }
            : { password, debeCambiarPassword: false }),
        });
        if (resp.passwordTemporal) {
          setPasswordTemporal(resp.passwordTemporal);
          toast({ description: t("usuarios.usuarioCreado") });
        } else {
          toast({ description: t("usuarios.usuarioCreado") });
          onCerrar();
        }
      }
    } catch (e) {
      setError(t(claveErrorApi(e instanceof ErrorApiUsuarios ? e.codigo : "ERROR_INTERNO")));
    }
  }

  async function copiar() {
    if (!passwordTemporal) return;
    try {
      await navigator.clipboard.writeText(passwordTemporal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {passwordTemporal ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                {t("usuarios.passwordTemporal")}
              </DialogTitle>
              <DialogDescription>{t("usuarios.passwordTemporalSub")}</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="select-all text-2xl font-bold tracking-wider">{passwordTemporal}</p>
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={copiar}>
                {copiado ? (
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copiado ? t("comun.copiado") : t("comun.copiar")}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={onCerrar}>{t("comun.cerrar")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {editando ? t("usuarios.editar") : t("usuarios.nuevo")}
              </DialogTitle>
              {!editando && (
                <DialogDescription>{t("usuarios.informacion")}</DialogDescription>
              )}
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="u-nombre">{t("usuarios.nombre")}</Label>
                <Input
                  id="u-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={t("auth.nombrePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-correo">{t("usuarios.correo")}</Label>
                <Input
                  id="u-correo"
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder={t("auth.correoPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("usuarios.rol")}</Label>
                <Select value={rolId} onValueChange={setRolId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("comun.seleccionarOpcion")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(roles?.roles ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {idioma === "es" ? r.nombre : r.nombreEn}
                        {r.sistema ? ` · ${t("roles.rolSistema")}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!editando && (
                <>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="pr-3">
                      <Label htmlFor="u-generar" className="text-sm font-medium">
                        {t("usuarios.generarPassword")}
                      </Label>
                    </div>
                    <Switch id="u-generar" checked={generarPassword} onCheckedChange={setGenerarPassword} />
                  </div>
                  {!generarPassword && (
                    <div className="space-y-2">
                      <Label htmlFor="u-pass">{t("comun.contrasena")}</Label>
                      <Input
                        id="u-pass"
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("auth.politica")}
                      />
                    </div>
                  )}
                  {generarPassword && (
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="pr-3">
                        <Label htmlFor="u-debe" className="text-sm font-medium">
                          {t("usuarios.debeCambiar")}
                        </Label>
                      </div>
                      <Switch id="u-debe" checked={debeCambiar} onCheckedChange={setDebeCambiar} />
                    </div>
                  )}
                </>
              )}
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCerrar}>
                {t("comun.cancelar")}
              </Button>
              <Button onClick={guardar}>{t("comun.guardar")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DIÁLOGO: RESTABLECER CONTRASEÑA (GESTIÓN MANUAL)
// ============================================================
function DialogoRestablecer({
  usuario,
  onCerrar,
}: {
  usuario: UsuarioLista;
  onCerrar: () => void;
}) {
  const { t } = useIdioma();
  const { toast } = useToast();
  const actualizar = useActualizarUsuario();

  const [password, setPassword] = useState("");
  const [generar, setGenerar] = useState(true);
  const [debeCambiar, setDebeCambiar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordTemporal, setPasswordTemporal] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function guardar() {
    setError(null);
    if (!generar && !password) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    try {
      const resp = await actualizar.mutateAsync({
        id: usuario.id,
        cuerpo: {
          accion: "restablecerPassword",
          ...(generar
            ? { generarPassword: true, debeCambiarPassword: debeCambiar }
            : { password, debeCambiarPassword: debeCambiar }),
        },
      });
      if (resp.passwordTemporal) {
        setPasswordTemporal(resp.passwordTemporal);
      } else {
        toast({ description: t("usuarios.contrasenaRestablecida") });
        onCerrar();
      }
    } catch (e) {
      setError(t(claveErrorApi(e instanceof ErrorApiUsuarios ? e.codigo : "ERROR_INTERNO")));
    }
  }

  async function copiar() {
    if (!passwordTemporal) return;
    try {
      await navigator.clipboard.writeText(passwordTemporal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        {passwordTemporal ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                {t("usuarios.passwordTemporal")}
              </DialogTitle>
              <DialogDescription>{t("usuarios.passwordTemporalSub")}</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="select-all text-2xl font-bold tracking-wider">{passwordTemporal}</p>
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={copiar}>
                {copiado ? (
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copiado ? t("comun.copiado") : t("comun.copiar")}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={onCerrar}>{t("comun.cerrar")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" aria-hidden />
                {t("usuarios.restablecer")}
              </DialogTitle>
              <DialogDescription>
                {t("usuarios.restablecerSub")}
                {usuario ? ` — ${usuario.nombre}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-3">
                  <Label htmlFor="r-generar" className="text-sm font-medium">
                    {t("usuarios.generarPassword")}
                  </Label>
                </div>
                <Switch id="r-generar" checked={generar} onCheckedChange={setGenerar} />
              </div>
              {!generar && (
                <div className="space-y-2">
                  <Label htmlFor="r-pass">{t("auth.nuevaContrasena")}</Label>
                  <Input
                    id="r-pass"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("auth.politica")}
                  />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-3">
                  <Label htmlFor="r-debe" className="text-sm font-medium">
                    {t("usuarios.debeCambiar")}
                  </Label>
                </div>
                <Switch id="r-debe" checked={debeCambiar} onCheckedChange={setDebeCambiar} />
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCerrar}>
                {t("comun.cancelar")}
              </Button>
              <Button onClick={guardar}>{t("comun.guardar")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// VISTA PRINCIPAL: GESTIÓN DE USUARIOS
// ============================================================
export function GestionUsuarios() {
  const { t, idioma } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const { usuario: usuarioActual } = useSesion();
  const { data, isLoading } = useUsuarios();
  const actualizar = useActualizarUsuario();
  const eliminar = useEliminarUsuario();

  const [busqueda, setBusqueda] = useState("");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<UsuarioLista | null>(null);
  const [restableciendo, setRestableciendo] = useState<UsuarioLista | null>(null);
  const [porAlternar, setPorAlternar] = useState<UsuarioLista | null>(null);
  const [porEliminar, setPorEliminar] = useState<UsuarioLista | null>(null);

  // La expresión data?.usuarios ?? [] vive DENTRO del useMemo: fuera de él,
  // su «?? []» generaba un array nuevo en cada render (mientras cargan los
  // datos) y forzaba recálculos del memo en cada render.
  const filtrados = useMemo(() => {
    const usuarios = data?.usuarios ?? [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nombre.toLowerCase().includes(q) ||
        u.correo.toLowerCase().includes(q) ||
        (idioma === "es" ? u.rol.nombre : u.rol.nombreEn).toLowerCase().includes(q),
    );
  }, [data, busqueda, idioma]);

  async function alternarActivo() {
    if (!porAlternar) return;
    try {
      await actualizar.mutateAsync({ id: porAlternar.id, cuerpo: { accion: "alternarActivo" } });
      toast({
        description: porAlternar.activo
          ? t("usuarios.desactivarConfirmacion")
          : t("usuarios.activarConfirmacion"),
      });
    } catch {
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    } finally {
      setPorAlternar(null);
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    try {
      await eliminar.mutateAsync(porEliminar.id);
      toast({ description: t("comun.registroEliminado") });
    } catch (e) {
      const codigo = e instanceof ErrorApiUsuarios ? e.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
    } finally {
      setPorEliminar(null);
    }
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("usuarios.titulo")}
        descripcion={t("usuarios.subtitulo")}
        icono={<Users className="h-5 w-5" aria-hidden />}
        acciones={
          <Button
            onClick={() => {
              setEditando(null);
              setDialogoAbierto(true);
            }}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("usuarios.nuevo")}
          </Button>
        }
      />

      {/* Aviso de gestión privilegiada */}
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>{t("usuarios.informacion")}</p>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t("usuarios.buscarPlaceholder")}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <CargandoFilas filas={5} />
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          titulo={t("usuarios.sinUsuarios")}
          icono={<Users className="h-6 w-6" aria-hidden />}
        />
      ) : (
        <TablaResponsiva>
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">{t("usuarios.nombre")}</th>
              <th className="px-4 py-3">{t("usuarios.rol")}</th>
              <th className="hidden px-4 py-3 md:table-cell">{t("usuarios.ultimoAcceso")}</th>
              <th className="px-4 py-3">{t("usuarios.estado")}</th>
              <th className="px-4 py-3 text-right">{t("comun.acciones")}</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((u) => (
              <tr key={u.id} className="border-b transition-colors hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {iniciales(u.nombre)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.correo}</p>
                    </div>
                    {u.id === usuarioActual?.id && (
                      <Badge variant="outline" className="ml-1 shrink-0 text-[10px]">
                        {t("auth.miCuenta")}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={u.rol.clave === "ADMIN" || u.rol.clave === "TI" ? "default" : "secondary"}
                    className="max-w-40 truncate"
                  >
                    {idioma === "es" ? u.rol.nombre : u.rol.nombreEn}
                  </Badge>
                </td>
                <td className="hidden px-4 py-3 text-sm text-muted-foreground md:table-cell">
                  {u.ultimoAcceso ? f.fechaHora(u.ultimoAcceso) : t("usuarios.nunca")}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={
                      u.activo
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                    }
                  >
                    {u.activo ? t("comun.activo") : t("comun.inactivo")}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("usuarios.restablecer")}
                      title={t("usuarios.restablecer")}
                      onClick={() => setRestableciendo(u)}
                    >
                      <KeyRound className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("comun.editar")}
                      title={t("comun.editar")}
                      onClick={() => {
                        setEditando(u);
                        setDialogoAbierto(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={u.activo ? t("usuarios.desactivar") : t("usuarios.activar")}
                      title={u.activo ? t("usuarios.desactivar") : t("usuarios.activar")}
                      disabled={u.id === usuarioActual?.id}
                      onClick={() => setPorAlternar(u)}
                    >
                      <Power className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label={t("usuarios.eliminar")}
                      title={t("usuarios.eliminar")}
                      disabled={u.id === usuarioActual?.id}
                      onClick={() => setPorEliminar(u)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TablaResponsiva>
      )}

      {/* Diálogos (se montan al abrirse para estado fresco) */}
      {dialogoAbierto && (
        <DialogoUsuario
          key={`usuario-${editando?.id ?? "nuevo"}`}
          onCerrar={() => setDialogoAbierto(false)}
          editando={editando}
        />
      )}
      {restableciendo && (
        <DialogoRestablecer
          key={`restablecer-${restableciendo.id}`}
          usuario={restableciendo}
          onCerrar={() => setRestableciendo(null)}
        />
      )}

      <AlertDialog open={Boolean(porAlternar)} onOpenChange={(v) => !v && setPorAlternar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {porAlternar?.activo ? t("usuarios.desactivar") : t("usuarios.activar")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {porAlternar?.activo
                ? t("usuarios.desactivarConfirmacion")
                : t("usuarios.activarConfirmacion")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("comun.cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={alternarActivo}>{t("comun.guardar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Confirmación de eliminación (borrado real) ===== */}
      <DialogoEliminarRegistro
        abierto={!!porEliminar}
        titulo={t("usuarios.eliminar")}
        descripcion={`${t("usuarios.eliminarConfirmacion")} ${t("comun.eliminarSinUndo")}`}
        cargando={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setPorEliminar(null)}
      />
    </div>
  );
}
