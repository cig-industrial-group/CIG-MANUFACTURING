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
 * GESTIÓN DE ALMACENES — CRUD de almacenes de la planta
 */
import { useMemo, useState } from "react";
import {
  Warehouse,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  User,
  Search,
  Power,
  Package,
} from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  DialogoDesactivarRegistro,
  DialogoEliminarRegistro,
  EncabezadoSeccion,
  EstadoVacio,
  InterruptorInactivos,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import {
  useActualizarAlmacen,
  useAlmacenes,
  useCrearAlmacen,
  useEliminarAlmacen,
} from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import type { Almacen, CuerpoAlmacen } from "../tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const VACIO: CuerpoAlmacen = {
  codigo: "",
  nombre: "",
  ubicacion: "",
  tipo: "GENERAL",
  responsable: "",
};

export function GestionAlmacenes() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const { data: almacenes, isLoading } = useAlmacenes(mostrarInactivos);
  const crear = useCrearAlmacen();
  const actualizar = useActualizarAlmacen();
  const eliminar = useEliminarAlmacen();

  const [busqueda, setBusqueda] = useState("");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Almacen | null>(null);
  const [porEliminar, setPorEliminar] = useState<Almacen | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Almacen | null>(null);
  const [formulario, setFormulario] = useState<CuerpoAlmacen>(VACIO);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return almacenes ?? [];
    return (almacenes ?? []).filter(
      (a) =>
        a.codigo.toLowerCase().includes(q) ||
        a.nombre.toLowerCase().includes(q) ||
        (a.ubicacion ?? "").toLowerCase().includes(q) ||
        (a.responsable ?? "").toLowerCase().includes(q),
    );
  }, [almacenes, busqueda]);

  function abrirNuevo() {
    setEditando(null);
    setFormulario(VACIO);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(a: Almacen) {
    setEditando(a);
    setFormulario({
      codigo: a.codigo,
      nombre: a.nombre,
      ubicacion: a.ubicacion ?? "",
      tipo: a.tipo,
      responsable: a.responsable ?? "",
    });
    setError(null);
    setDialogoAbierto(true);
  }

  async function guardar() {
    if (!formulario.codigo.trim() || !formulario.nombre.trim()) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    try {
      if (editando) {
        await actualizar.mutateAsync({ id: editando.id, cuerpo: formulario });
        toast({ description: t("comun.registroActualizado") });
      } else {
        await crear.mutateAsync(formulario);
        toast({ description: t("comun.registroGuardado") });
      }
      setDialogoAbierto(false);
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      setError(t(claveErrorApi(codigo)));
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    try {
      await eliminar.mutateAsync(porEliminar.id);
      toast({ description: t("comun.registroEliminado") });
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
    } finally {
      setPorEliminar(null);
    }
  }

  async function confirmarDesactivar() {
    if (!porDesactivar) return;
    try {
      await actualizar.mutateAsync({ id: porDesactivar.id, cuerpo: { activo: false } });
      toast({ description: t("comun.registroDesactivado") });
    } catch {
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    } finally {
      setPorDesactivar(null);
    }
  }

  async function reactivar(a: Almacen) {
    try {
      await actualizar.mutateAsync({ id: a.id, cuerpo: { activo: true } });
      toast({ description: t("comun.registroReactivado") });
    } catch {
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("almacen.titulo")}
        descripcion={t("nav.descripcionAlmacenes")}
        icono={<Warehouse className="h-5 w-5" />}
        acciones={
          <Button onClick={abrirNuevo} className="min-h-9">
            <Plus className="mr-2 h-4 w-4" />
            {t("almacen.nuevo")}
          </Button>
        }
      />

      {/* Búsqueda y filtro de estado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t("comun.buscar")}
            className="pl-9"
            aria-label={t("comun.buscar")}
          />
        </div>
        <InterruptorInactivos marcado={mostrarInactivos} onCambiar={setMostrarInactivos} />
      </div>

      {isLoading ? (
        <CargandoFilas />
      ) : filtrados.length === 0 ? (
        <EstadoVacio titulo={t("comun.sinResultados")} />
      ) : (
        <>
          {/* Tabla escritorio */}
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("almacen.codigo")}</th>
                  <th className="px-3 py-2.5">{t("almacen.nombre")}</th>
                  <th className="px-3 py-2.5">{t("almacen.tipo")}</th>
                  <th className="px-3 py-2.5">{t("almacen.responsable")}</th>
                  <th className="px-3 py-2.5 text-right">{t("almacen.productosAlmacenados")}</th>
                  <th className="px-3 py-2.5 text-right">{t("almacen.valor")}</th>
                  <th className="px-3 py-2.5">{t("comun.total")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrados.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{a.codigo}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{a.nombre}</p>
                      {a.ubicacion && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {a.ubicacion}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline">{t(`tiposAlmacen.${a.tipo}`)}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-sm">
                      {a.responsable ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{a.numProductos}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{f.moneda(a.valorInventario)}</td>
                    <td className="px-3 py-2.5">
                      {a.activo ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                          {t("comun.activo")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t("comun.inactivo")}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicion(a)} aria-label={t("comun.editar")} title={t("comun.editar")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => (a.activo ? setPorDesactivar(a) : reactivar(a))}
                          aria-label={a.activo ? t("comun.desactivar") : t("comun.reactivar")}
                          title={a.activo ? t("comun.desactivar") : t("comun.reactivar")}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setPorEliminar(a)} aria-label={t("comun.eliminar")} title={t("comun.eliminar")}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TablaResponsiva>
          </div>

          {/* Tarjetas móvil */}
          <div className="space-y-3 md:hidden">
            {filtrados.map((a) => (
              <div key={a.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-primary">{a.codigo}</p>
                    <p className="truncate font-semibold">{a.nombre}</p>
                  </div>
                  {a.activo ? (
                    <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                      {t("comun.activo")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">{t("comun.inactivo")}</Badge>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <Badge variant="outline">{t(`tiposAlmacen.${a.tipo}`)}</Badge>
                  {a.ubicacion && (
                    <p className="flex items-center gap-1.5 text-xs">
                      <MapPin className="h-3 w-3" /> {a.ubicacion}
                    </p>
                  )}
                  {a.responsable && (
                    <p className="flex items-center gap-1.5 text-xs">
                      <User className="h-3 w-3" /> {a.responsable}
                    </p>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" /> {a.numProductos} {t("comun.productos").toLowerCase()}
                  </span>
                  <span className="font-semibold tabular-nums">{f.moneda(a.valorInventario)}</span>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => abrirEdicion(a)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("comun.editar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => (a.activo ? setPorDesactivar(a) : reactivar(a))}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                    {a.activo ? t("comun.desactivar") : t("comun.reactivar")}
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 text-destructive hover:text-destructive" onClick={() => setPorEliminar(a)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("comun.eliminar")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== Dialogo crear/editar ===== */}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editando ? t("almacen.editar") : t("almacen.nuevo")}
            </DialogTitle>
            <DialogDescription>{t("almacen.subtitulo")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="codigo">{t("almacen.codigo")} *</Label>
                <Input
                  id="codigo"
                  value={formulario.codigo}
                  onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value.toUpperCase() })}
                  placeholder="ALM-XX-00"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("almacen.tipo")}</Label>
                <Select
                  value={formulario.tipo}
                  onValueChange={(v) => setFormulario({ ...formulario, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "GENERAL"].map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {t(`tiposAlmacen.${tipo}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre">{t("almacen.nombre")} *</Label>
              <Input
                id="nombre"
                value={formulario.nombre}
                onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ubicacion">
                {t("almacen.ubicacion")} <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="ubicacion"
                value={formulario.ubicacion}
                onChange={(e) => setFormulario({ ...formulario, ubicacion: e.target.value })}
                placeholder="Nave A - Pasillo 3"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsable">
                {t("almacen.responsable")} <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="responsable"
                value={formulario.responsable}
                onChange={(e) => setFormulario({ ...formulario, responsable: e.target.value })}
                maxLength={80}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogoAbierto(false)}>
              {t("comun.cancelar")}
            </Button>
            <Button
              onClick={guardar}
              disabled={crear.isPending || actualizar.isPending}
            >
              {editando ? t("comun.guardarCambios") : t("comun.guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Confirmación de eliminación (borrado real) ===== */}
      <DialogoEliminarRegistro
        abierto={!!porEliminar}
        titulo={t("almacen.eliminar")}
        descripcion={`${t("almacen.eliminarConfirmacion")} ${t("comun.eliminarSinUndo")}`}
        cargando={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setPorEliminar(null)}
      />

      {/* ===== Confirmación de desactivación (reversible) ===== */}
      <DialogoDesactivarRegistro
        abierto={!!porDesactivar}
        titulo={t("almacen.desactivar")}
        descripcion={t("almacen.desactivarConfirmacion")}
        cargando={actualizar.isPending}
        onConfirmar={confirmarDesactivar}
        onCerrar={() => setPorDesactivar(null)}
      />
    </div>
  );
}
