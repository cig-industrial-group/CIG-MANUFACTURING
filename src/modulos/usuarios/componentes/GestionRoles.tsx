"use client";

/**
 * MÓDULO: USUARIOS — Gestión de roles y permisos
 * Creación de roles personalizados y edición de la matriz de permisos.
 * Los roles de sistema (ADMIN, TI) no se pueden eliminar; los permisos
 * del rol ADMIN no se pueden reducir.
 */
import { useState } from "react";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Lock,
  Users2,
} from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  EncabezadoSeccion,
  EstadoVacio,
} from "@/modulos/compartidos/ui";
import { claveErrorApi } from "@/modulos/compartidos/errores";
import { PERMISOS, PERMISOS_AGRUPADOS } from "@/modulos/autenticacion/permisos";
import type { InfoRol } from "@/modulos/autenticacion/tipos";
import {
  useActualizarRol,
  useCrearRol,
  useEliminarRol,
  useRoles,
} from "../servicios/consultas";
import { ErrorApiUsuarios } from "../servicios/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useToast } from "@/hooks/use-toast";

// ============================================================
// MATRIZ DE PERMISOS (CHECKBOXES AGRUPADOS)
// ============================================================
function MatrizPermisos({
  permisos,
  onCambiar,
  bloqueado,
}: {
  permisos: string[];
  onCambiar: (permiso: string, activo: boolean) => void;
  bloqueado: boolean;
}) {
  const { t, idioma } = useIdioma();
  return (
    <div className="space-y-4">
      {PERMISOS_AGRUPADOS.map((grupo) => (
        <div key={grupo.grupoEs} className="rounded-lg border p-3">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {idioma === "es" ? grupo.grupoEs : grupo.grupoEn}
          </p>
          <div className="space-y-2.5">
            {grupo.permisos.map((p) => (
              <label
                key={p.clave}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  checked={permisos.includes(p.clave)}
                  onCheckedChange={(v) => !bloqueado && onCambiar(p.clave, Boolean(v))}
                  disabled={bloqueado}
                  aria-label={idioma === "es" ? p.es : p.en}
                />
                <span className="text-sm">{idioma === "es" ? p.es : p.en}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        {t("roles.permisosSeleccionados", {
          n: permisos.length,
          total: PERMISOS.length,
        })}
      </p>
    </div>
  );
}

// ============================================================
// DIÁLOGO: CREAR / EDITAR ROL (se monta al abrirse: estado fresco)
// ============================================================
function DialogoRol({
  onCerrar,
  editando,
}: {
  onCerrar: () => void;
  editando: InfoRol | null;
}) {
  const { t } = useIdioma();
  const { toast } = useToast();
  const crear = useCrearRol();
  const actualizar = useActualizarRol();

  const [clave, setClave] = useState(editando?.clave ?? "");
  const [nombre, setNombre] = useState(editando?.nombre ?? "");
  const [nombreEn, setNombreEn] = useState(editando?.nombreEn ?? "");
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? "");
  const [permisos, setPermisos] = useState<string[]>(editando?.permisos ?? []);
  const [error, setError] = useState<string | null>(null);

  // El ADMIN no puede ver reducidos sus permisos
  const bloqueado = editando?.clave === "ADMIN";

  function alternarPermiso(permiso: string, activo: boolean) {
    setPermisos((actuales) =>
      activo ? [...actuales, permiso] : actuales.filter((p) => p !== permiso),
    );
  }

  async function guardar() {
    setError(null);
    if (!nombre.trim() || (!editando && !clave.trim()) || permisos.length === 0) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    try {
      if (editando) {
        await actualizar.mutateAsync({
          id: editando.id,
          cuerpo: {
            nombre: nombre.trim(),
            nombreEn: nombreEn.trim() || nombre.trim(),
            descripcion: descripcion.trim() || null,
            permisos,
          },
        });
        toast({ description: t("roles.rolActualizado") });
      } else {
        await crear.mutateAsync({
          clave: clave.trim(),
          nombre: nombre.trim(),
          nombreEn: nombreEn.trim() || nombre.trim(),
          descripcion: descripcion.trim() || null,
          permisos,
        });
        toast({ description: t("roles.rolCreado") });
      }
      onCerrar();
    } catch (e) {
      setError(t(claveErrorApi(e instanceof ErrorApiUsuarios ? e.codigo : "ERROR_INTERNO")));
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? t("roles.editar") : t("roles.nuevo")}</DialogTitle>
          {!editando && <DialogDescription>{t("roles.subtitulo")}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          {!editando && (
            <div className="space-y-2">
              <Label htmlFor="rol-clave">{t("roles.clave")}</Label>
              <Input
                id="rol-clave"
                value={clave}
                onChange={(e) => setClave(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                placeholder={t("roles.clavePlaceholder")}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">{t("roles.claveAyuda")}</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rol-nombre">{t("roles.nombreEs")}</Label>
              <Input
                id="rol-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rol-nombre-en">{t("roles.nombreEn")}</Label>
              <Input
                id="rol-nombre-en"
                value={nombreEn}
                onChange={(e) => setNombreEn(e.target.value)}
                placeholder={t("roles.nombreEn")}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rol-desc">{t("roles.descripcion")}</Label>
            <Input
              id="rol-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {t("roles.permisos")}
              {bloqueado && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Lock className="h-3 w-3" aria-hidden />
                  {t("roles.adminNoModificable")}
                </Badge>
              )}
            </Label>
            <MatrizPermisos
              permisos={permisos}
              onCambiar={alternarPermiso}
              bloqueado={bloqueado}
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            {t("comun.cancelar")}
          </Button>
          <Button onClick={guardar}>{t("comun.guardar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// VISTA PRINCIPAL: GESTIÓN DE ROLES
// ============================================================
export function GestionRoles() {
  const { t, idioma } = useIdioma();
  const { toast } = useToast();
  const { data, isLoading } = useRoles();
  const eliminar = useEliminarRol();

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<InfoRol | null>(null);
  const [porEliminar, setPorEliminar] = useState<InfoRol | null>(null);

  const roles = data?.roles ?? [];

  async function confirmarEliminar() {
    if (!porEliminar) return;
    try {
      await eliminar.mutateAsync(porEliminar.id);
      toast({ description: t("roles.rolEliminado") });
    } catch (e) {
      toast({
        description: t(claveErrorApi(e instanceof ErrorApiUsuarios ? e.codigo : "ERROR_INTERNO")),
        variant: "destructive",
      });
    } finally {
      setPorEliminar(null);
    }
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("roles.titulo")}
        descripcion={t("roles.subtitulo")}
        icono={<ShieldCheck className="h-5 w-5" aria-hidden />}
        acciones={
          <Button
            onClick={() => {
              setEditando(null);
              setDialogoAbierto(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("roles.nuevo")}
          </Button>
        }
      />

      {isLoading ? (
        <CargandoFilas filas={4} />
      ) : roles.length === 0 ? (
        <EstadoVacio titulo={t("comun.sinDatos")} icono={<ShieldCheck className="h-6 w-6" aria-hidden />} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((rol) => (
            <Card key={rol.id} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{idioma === "es" ? rol.nombre : rol.nombreEn}</p>
                      {rol.sistema && (
                        <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                          <Lock className="h-3 w-3" aria-hidden />
                          {t("roles.rolSistema")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{rol.clave}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("comun.editar")}
                      title={t("comun.editar")}
                      onClick={() => {
                        setEditando(rol);
                        setDialogoAbierto(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("comun.eliminar")}
                      title={t("comun.eliminar")}
                      disabled={rol.sistema}
                      onClick={() => setPorEliminar(rol)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                {rol.descripcion && (
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {rol.descripcion}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {rol.permisos.slice(0, 3).map((p) => {
                    const info = PERMISOS_AGRUPADOS.flatMap((g) => g.permisos).find((x) => x.clave === p);
                    return (
                      <Badge key={p} variant="outline" className="max-w-full truncate text-[10px]">
                        {info ? (idioma === "es" ? info.es : info.en) : p}
                      </Badge>
                    );
                  })}
                  {rol.permisos.length > 3 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{rol.permisos.length - 3}
                    </Badge>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users2 className="h-3.5 w-3.5" aria-hidden />
                    {t("roles.usuariosAsignados", { n: rol.numUsuarios ?? 0 })}
                  </span>
                  <span className="font-medium">
                    {t("roles.permisosSeleccionados", {
                      n: rol.permisos.length,
                      total: PERMISOS.length,
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialogoAbierto && (
        <DialogoRol
          key={`rol-${editando?.id ?? "nuevo"}`}
          onCerrar={() => setDialogoAbierto(false)}
          editando={editando}
        />
      )}

      <AlertDialog open={Boolean(porEliminar)} onOpenChange={(v) => !v && setPorEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("roles.eliminar")}</AlertDialogTitle>
            <AlertDialogDescription>{t("roles.eliminarConfirmacion")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("comun.cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmarEliminar}
            >
              {t("comun.eliminar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
