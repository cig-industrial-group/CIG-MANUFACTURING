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
 * GESTIÓN DE UNIDADES DE MEDIDA — CRUD del catálogo
 *
 * Define las unidades del inventario (PIEZA, PAQUETE, ROLLO, KG, M...)
 * y, para las unidades de paquete, su unidad base (PAQUETE→PZA).
 * La cantidad que lleva cada paquete NO se define aquí: varía por
 * producto y se configura al registrar cada producto (Empaque para
 * conteo). El conteo de movimientos puede capturarse en unidades
 * sueltas o en paquetes + sueltas; el stock siempre queda en la base.
 *
 * Unidades del sistema (sembradas): no se eliminan y conservan su
 * código/tipo, pero sí se ajustan (nombres, unidad base, notas) o
 * desactivan.
 */
import { useMemo, useState } from "react";
import {
  Boxes,
  Package,
  Pencil,
  Plus,
  Power,
  Ruler,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
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
  useActualizarUnidad,
  useCrearUnidad,
  useEliminarUnidad,
  useUnidades,
} from "../servicios/consultas";
import { ErrorApiUnidades } from "../servicios/api";
import { claveErrorApi } from "@/modulos/compartidos/errores";
import type { CuerpoUnidad, TipoUnidad, Unidad } from "../tipos";
import { TIPOS_UNIDAD, TIPOS_UNIDAD_BASE } from "../tipos";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const VACIO: CuerpoUnidad = {
  codigo: "",
  nombre: "",
  nombreEn: "",
  tipo: "CONTEO",
  unidadBase: null,
  notas: "",
};

/** Insignia del tipo de unidad */
function InsigniaTipoUnidad({ tipo }: { tipo: TipoUnidad }) {
  const { t } = useIdioma();
  const clases: Record<string, string> = {
    CONTEO: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
    PAQUETE: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30",
    PESO: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    LONGITUD: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    VOLUMEN: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
    OTRO: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30",
  };
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", clases[tipo] ?? clases.OTRO)}>
      {tipo === "PAQUETE" ? (
        <Boxes className="mr-1 h-3 w-3" aria-hidden />
      ) : tipo === "PESO" || tipo === "LONGITUD" || tipo === "VOLUMEN" ? (
        <Ruler className="mr-1 h-3 w-3" aria-hidden />
      ) : (
        <Package className="mr-1 h-3 w-3" aria-hidden />
      )}
      {t(`unidades.tipos.${tipo}`)}
    </Badge>
  );
}

/** Texto de la unidad base del paquete: «PAQUETE → PZA» */
function TextoEquivalencia({ unidad }: { unidad: Unidad }) {
  const { t } = useIdioma();
  if (unidad.tipo !== "PAQUETE") return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-medium tabular-nums">
      {unidad.codigo} → {unidad.unidadBase}
    </span>
  );
}

export function GestionUnidades() {
  const { t } = useIdioma();
  const { toast } = useToast();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const { data: unidades, isLoading } = useUnidades(mostrarInactivos);
  const crear = useCrearUnidad();
  const actualizar = useActualizarUnidad();
  const eliminar = useEliminarUnidad();

  const [busqueda, setBusqueda] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("TODOS");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Unidad | null>(null);
  const [formulario, setFormulario] = useState<CuerpoUnidad>(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [porEliminar, setPorEliminar] = useState<Unidad | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Unidad | null>(null);

  /** Unidades base disponibles como base de un paquete */
  const basesDisponibles = useMemo(
    () => (unidades ?? []).filter((u) => TIPOS_UNIDAD_BASE.includes(u.tipo) && u.activo),
    [unidades],
  );

  const filtradas = useMemo(() => {
    if (!unidades) return [];
    const q = busqueda.trim().toLowerCase();
    return unidades.filter((u) => {
      if (tipoFiltro !== "TODOS" && u.tipo !== tipoFiltro) return false;
      if (!q) return true;
      return (
        u.codigo.toLowerCase().includes(q) ||
        u.nombre.toLowerCase().includes(q) ||
        (u.nombreEn ?? "").toLowerCase().includes(q) ||
        (u.unidadBase ?? "").toLowerCase().includes(q)
      );
    });
  }, [unidades, busqueda, tipoFiltro]);

  function abrirNuevo() {
    setEditando(null);
    setFormulario(VACIO);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(u: Unidad) {
    setEditando(u);
    setFormulario({
      codigo: u.codigo,
      nombre: u.nombre,
      nombreEn: u.nombreEn,
      tipo: u.tipo,
      unidadBase: u.unidadBase,
      notas: u.notas ?? "",
    });
    setError(null);
    setDialogoAbierto(true);
  }

  async function guardar() {
    setError(null);
    if (!formulario.codigo.trim()) return setError(t("validaciones.codigoRequerido"));
    if (!formulario.nombre.trim()) return setError(t("validaciones.nombreRequerido"));
    if (formulario.tipo === "PAQUETE" && !formulario.unidadBase) {
      return setError(t("unidades.baseRequerida"));
    }
    try {
      if (editando) {
        await actualizar.mutateAsync({ id: editando.id, cuerpo: formulario });
        toast({ description: t("unidades.actualizada") });
      } else {
        await crear.mutateAsync(formulario);
        toast({ description: t("unidades.creada") });
      }
      setDialogoAbierto(false);
    } catch (e) {
      const codigo = e instanceof ErrorApiUnidades ? e.codigo : "ERROR_INTERNO";
      setError(t(claveErrorApi(codigo)));
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    try {
      await eliminar.mutateAsync(porEliminar.id);
      toast({ description: t("unidades.eliminada") });
      setPorEliminar(null);
    } catch (e) {
      const codigo = e instanceof ErrorApiUnidades ? e.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
      setPorEliminar(null);
    }
  }

  async function confirmarDesactivar() {
    if (!porDesactivar) return;
    try {
      await actualizar.mutateAsync({ id: porDesactivar.id, cuerpo: { activo: !porDesactivar.activo } });
      toast({ description: porDesactivar.activo ? t("unidades.desactivada") : t("unidades.reactivada") });
      setPorDesactivar(null);
    } catch (e) {
      const codigo = e instanceof ErrorApiUnidades ? e.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
      setPorDesactivar(null);
    }
  }

  const esPaquete = formulario.tipo === "PAQUETE";

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("unidades.titulo")}
        descripcion={t("nav.descripcionUnidades")}
        icono={<Boxes className="h-5 w-5" />}
        acciones={
          <Button onClick={abrirNuevo} className="min-h-9">
            <Plus className="mr-2 h-4 w-4" />
            {t("unidades.nueva")}
          </Button>
        }
      />

      {/* Nota explicativa */}
      <p className="rounded-lg border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {t("unidades.ayuda")}
      </p>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t("comun.buscar")}
              className="pl-9"
              aria-label={t("comun.buscar")}
            />
          </div>
          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">{t("comun.todos")}</SelectItem>
              {TIPOS_UNIDAD.map((tp) => (
                <SelectItem key={tp} value={tp}>
                  {t(`unidades.tipos.${tp}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <InterruptorInactivos marcado={mostrarInactivos} onCambiar={setMostrarInactivos} />
      </div>

      {isLoading ? (
        <CargandoFilas filas={6} />
      ) : filtradas.length === 0 ? (
        <EstadoVacio titulo={t("comun.sinResultados")} />
      ) : (
        <>
          {/* Tabla escritorio */}
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("unidades.codigo")}</th>
                  <th className="px-3 py-2.5">{t("unidades.nombre")}</th>
                  <th className="px-3 py-2.5">{t("unidades.tipo")}</th>
                  <th className="px-3 py-2.5">{t("unidades.equivalencia")}</th>
                  <th className="px-3 py-2.5 text-right">{t("unidades.uso")}</th>
                  <th className="px-3 py-2.5">{t("comun.estado")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtradas.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-bold">{u.codigo}</span>
                      {u.esSistema && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          {t("unidades.sistema")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className={cn("font-medium", !u.activo && "line-through opacity-60")}>{u.nombre}</p>
                      <p className="text-xs text-muted-foreground">{u.nombreEn}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <InsigniaTipoUnidad tipo={u.tipo} />
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <TextoEquivalencia unidad={u} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                      {u.tipo !== "PAQUETE" && u.productosAsociados > 0 && (
                        <span className="block">
                          {u.productosAsociados} {t("unidades.productos").toLowerCase()}
                        </span>
                      )}
                      {u.usadaComoBase > 0 && (
                        <span className="block">
                          {u.usadaComoBase} {t("unidades.paquetes").toLowerCase()}
                        </span>
                      )}
                      {u.productosAsociados === 0 && u.usadaComoBase === 0 && "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {u.activo ? (
                        <Badge variant="secondary">{t("comun.activo")}</Badge>
                      ) : (
                        <Badge variant="secondary">{t("comun.inactivo")}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicion(u)} aria-label={t("comun.editar")} title={t("comun.editar")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => (u.activo ? setPorDesactivar(u) : actualizar.mutate({ id: u.id, cuerpo: { activo: true } }))}
                          aria-label={u.activo ? t("comun.desactivar") : t("comun.reactivar")}
                          title={u.activo ? t("comun.desactivar") : t("comun.reactivar")}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setPorEliminar(u)}
                          disabled={u.esSistema}
                          aria-label={u.esSistema ? t("unidades.sistemaNoEliminable") : t("comun.eliminar")}
                          title={u.esSistema ? t("unidades.sistemaNoEliminable") : t("comun.eliminar")}
                        >
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
            {filtradas.map((u) => (
              <div key={u.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-mono text-xs font-bold text-primary">
                      {u.codigo}
                      {u.esSistema && <ShieldCheck className="h-3 w-3 text-muted-foreground" aria-hidden />}
                    </p>
                    <p className={cn("font-semibold", !u.activo && "line-through opacity-60")}>{u.nombre}</p>
                    <p className="text-xs text-muted-foreground">{u.nombreEn}</p>
                  </div>
                  <InsigniaTipoUnidad tipo={u.tipo} />
                </div>
                {u.tipo === "PAQUETE" && (
                  <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium tabular-nums">
                    {u.codigo} → {u.unidadBase}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => abrirEdicion(u)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> {t("comun.editar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => (u.activo ? setPorDesactivar(u) : actualizar.mutate({ id: u.id, cuerpo: { activo: true } }))}
                  >
                    <Power className="mr-1 h-3.5 w-3.5" />
                    {u.activo ? t("comun.desactivar") : t("comun.reactivar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-destructive hover:text-destructive"
                    onClick={() => setPorEliminar(u)}
                    disabled={u.esSistema}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("comun.eliminar")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== Diálogo crear/editar ===== */}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? t("unidades.editar") : t("unidades.nueva")}</DialogTitle>
            <DialogDescription>{t("unidades.subtitulo")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="u-codigo">{t("unidades.codigo")} *</Label>
                <Input
                  id="u-codigo"
                  value={formulario.codigo}
                  onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value.toUpperCase() })}
                  placeholder="CJA"
                  maxLength={12}
                  disabled={editando?.esSistema === true}
                />
                {editando?.esSistema && (
                  <p className="text-[11px] text-muted-foreground">{t("unidades.codigoBloqueado")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("unidades.tipo")}</Label>
                <Select
                  value={formulario.tipo}
                  onValueChange={(v) =>
                    setFormulario({
                      ...formulario,
                      tipo: v as TipoUnidad,
                      ...(v === "PAQUETE"
                        ? { unidadBase: formulario.unidadBase ?? "PZA" }
                        : { unidadBase: null }),
                    })
                  }
                  disabled={editando?.esSistema === true}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_UNIDAD.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {t(`unidades.tipos.${tp}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="u-nombre">{t("unidades.nombre")} *</Label>
                <Input
                  id="u-nombre"
                  value={formulario.nombre}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                  maxLength={60}
                  placeholder="Caja"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-nombre-en">{t("unidades.nombreEn")}</Label>
                <Input
                  id="u-nombre-en"
                  value={formulario.nombreEn ?? ""}
                  onChange={(e) => setFormulario({ ...formulario, nombreEn: e.target.value })}
                  maxLength={60}
                  placeholder="Box"
                />
              </div>
            </div>

            {esPaquete && (
              <div className="space-y-2">
                <Label>{t("unidades.unidadBase")} *</Label>
                <Select
                  value={formulario.unidadBase ?? ""}
                  onValueChange={(v) => setFormulario({ ...formulario, unidadBase: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("unidades.seleccionarBase")} />
                  </SelectTrigger>
                  <SelectContent>
                    {basesDisponibles.map((b) => (
                      <SelectItem key={b.id} value={b.codigo}>
                        {b.codigo} — {b.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{t("unidades.ayudaBase")}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="u-notas">
                {t("unidades.notas")} <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Textarea
                id="u-notas"
                value={formulario.notas ?? ""}
                onChange={(e) => setFormulario({ ...formulario, notas: e.target.value })}
                maxLength={200}
                rows={2}
              />
            </div>

            {esPaquete && formulario.unidadBase && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                {formulario.codigo || "…"} → {formulario.unidadBase}{" "}
                <span className="text-xs text-muted-foreground">({t("unidades.vistaPreviaBase")})</span>
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogoAbierto(false)}>
              {t("comun.cancelar")}
            </Button>
            <Button onClick={guardar} disabled={crear.isPending || actualizar.isPending}>
              {editando ? t("comun.guardarCambios") : t("comun.guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Confirmación de eliminación ===== */}
      <DialogoEliminarRegistro
        abierto={!!porEliminar}
        titulo={t("unidades.eliminar")}
        descripcion={`${t("unidades.eliminarConfirmacion")} ${t("comun.eliminarSinUndo")}`}
        cargando={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setPorEliminar(null)}
      />

      {/* ===== Confirmación de desactivación ===== */}
      <DialogoDesactivarRegistro
        abierto={!!porDesactivar}
        titulo={t("unidades.desactivar")}
        descripcion={t("unidades.desactivarConfirmacion")}
        cargando={actualizar.isPending}
        onConfirmar={confirmarDesactivar}
        onCerrar={() => setPorDesactivar(null)}
      />
    </div>
  );
}
