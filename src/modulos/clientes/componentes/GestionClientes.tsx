"use client";

/**
 * GESTIÓN DE CLIENTES — CRUD del catálogo de clientes
 * La eliminación es en 2 etapas: el cliente se envía a la papelera
 * (restaurable 30 días) y su registro se conserva completo.
 */
import { useMemo, useState } from "react";
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Power, Search, Trash2 } from "lucide-react";
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
  useActualizarCliente,
  useClientes,
  useCrearCliente,
  useEliminarCliente,
} from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import type { CuerpoCliente, Cliente } from "../tipos";
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
import { useToast } from "@/hooks/use-toast";

const VACIO: CuerpoCliente = {
  codigo: "",
  nombre: "",
  contacto: "",
  correo: "",
  telefono: "",
  direccion: "",
  notas: "",
};

export function GestionClientes() {
  const { t } = useIdioma();
  const { toast } = useToast();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const { data: clientes, isLoading } = useClientes(mostrarInactivos);
  const crear = useCrearCliente();
  const actualizar = useActualizarCliente();
  const eliminar = useEliminarCliente();

  const [busqueda, setBusqueda] = useState("");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [porEliminar, setPorEliminar] = useState<Cliente | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Cliente | null>(null);
  const [formulario, setFormulario] = useState<CuerpoCliente>(VACIO);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes ?? [];
    return (clientes ?? []).filter(
      (c) =>
        c.codigo.toLowerCase().includes(q) ||
        c.nombre.toLowerCase().includes(q) ||
        (c.contacto ?? "").toLowerCase().includes(q) ||
        (c.correo ?? "").toLowerCase().includes(q),
    );
  }, [clientes, busqueda]);

  function abrirNuevo() {
    setEditando(null);
    setFormulario(VACIO);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(c: Cliente) {
    setEditando(c);
    setFormulario({
      codigo: c.codigo,
      nombre: c.nombre,
      contacto: c.contacto ?? "",
      correo: c.correo ?? "",
      telefono: c.telefono ?? "",
      direccion: c.direccion ?? "",
      notas: c.notas ?? "",
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

  async function reactivar(c: Cliente) {
    try {
      await actualizar.mutateAsync({ id: c.id, cuerpo: { activo: true } });
      toast({ description: t("comun.registroReactivado") });
    } catch {
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("clientes.titulo")}
        descripcion={t("nav.descripcionClientes")}
        icono={<Building2 className="h-5 w-5" />}
        acciones={
          <Button onClick={abrirNuevo} className="min-h-9">
            <Plus className="mr-2 h-4 w-4" />
            {t("clientes.nuevo")}
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
        <EstadoVacio
          titulo={t("comun.sinResultados")}
          descripcion={t("clientes.vacio")}
          icono={<Building2 className="h-8 w-8 text-muted-foreground" aria-hidden />}
        />
      ) : (
        <>
          {/* Tabla escritorio */}
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("clientes.codigo")}</th>
                  <th className="px-3 py-2.5">{t("clientes.nombre")}</th>
                  <th className="px-3 py-2.5">{t("clientes.personaContacto")}</th>
                  <th className="px-3 py-2.5">{t("comun.estado")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrados.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{c.codigo}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{c.nombre}</p>
                      {c.direccion && (
                        <p className="flex max-w-xs items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" /> {c.direccion}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.contacto ? (
                        <p className="text-sm">{c.contacto}</p>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      <div className="mt-0.5 space-y-0.5">
                        {c.correo && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" /> {c.correo}
                          </p>
                        )}
                        {c.telefono && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" /> {c.telefono}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.activo ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                          {t("comun.activo")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t("comun.inactivo")}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => abrirEdicion(c)}
                          aria-label={t("comun.editar")}
                          title={t("comun.editar")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => (c.activo ? setPorDesactivar(c) : reactivar(c))}
                          aria-label={c.activo ? t("comun.desactivar") : t("comun.reactivar")}
                          title={c.activo ? t("comun.desactivar") : t("comun.reactivar")}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setPorEliminar(c)}
                          aria-label={t("comun.eliminar")}
                          title={t("comun.eliminar")}
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
            {filtrados.map((c) => (
              <div key={c.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-primary">{c.codigo}</p>
                    <p className="truncate font-semibold">{c.nombre}</p>
                  </div>
                  {c.activo ? (
                    <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                      {t("comun.activo")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">{t("comun.inactivo")}</Badge>
                  )}
                </div>
                {c.contacto && <p className="mt-1 text-xs text-muted-foreground">{c.contacto}</p>}
                {c.correo && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" /> {c.correo}
                  </p>
                )}
                {c.telefono && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {c.telefono}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => abrirEdicion(c)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("comun.editar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => (c.activo ? setPorDesactivar(c) : reactivar(c))}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                    {c.activo ? t("comun.desactivar") : t("comun.reactivar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-destructive hover:text-destructive"
                    onClick={() => setPorEliminar(c)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("comun.eliminar")}
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
            <DialogTitle>
              {editando ? t("clientes.editar") : t("clientes.nuevo")}
            </DialogTitle>
            <DialogDescription>{t("clientes.subtitulo")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cliente-codigo">{t("clientes.codigo")} *</Label>
                <Input
                  id="cliente-codigo"
                  value={formulario.codigo}
                  onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value.toUpperCase() })}
                  placeholder="CLI-0001"
                  maxLength={40}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cliente-nombre">{t("clientes.nombre")} *</Label>
                <Input
                  id="cliente-nombre"
                  value={formulario.nombre}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                  placeholder="Aceros del Norte S.A. de C.V."
                  maxLength={120}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cliente-contacto">
                  {t("clientes.personaContacto")}{" "}
                  <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
                </Label>
                <Input
                  id="cliente-contacto"
                  value={formulario.contacto}
                  onChange={(e) => setFormulario({ ...formulario, contacto: e.target.value })}
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cliente-telefono">
                  {t("clientes.telefono")}{" "}
                  <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
                </Label>
                <Input
                  id="cliente-telefono"
                  value={formulario.telefono}
                  onChange={(e) => setFormulario({ ...formulario, telefono: e.target.value })}
                  maxLength={30}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-correo">
                {t("clientes.correo")}{" "}
                <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="cliente-correo"
                type="email"
                value={formulario.correo}
                onChange={(e) => setFormulario({ ...formulario, correo: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-direccion">
                {t("clientes.direccion")}{" "}
                <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="cliente-direccion"
                value={formulario.direccion}
                onChange={(e) => setFormulario({ ...formulario, direccion: e.target.value })}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-notas">
                {t("clientes.notas")}{" "}
                <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="cliente-notas"
                value={formulario.notas}
                onChange={(e) => setFormulario({ ...formulario, notas: e.target.value })}
                maxLength={200}
              />
            </div>
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

      {/* ===== Confirmación de eliminación (2 etapas: papelera + 30 días) ===== */}
      <DialogoEliminarRegistro
        abierto={!!porEliminar}
        titulo={t("clientes.eliminar")}
        descripcion={`${t("clientes.eliminarConfirmacion")} ${t("comun.eliminarSinUndo")}`}
        cargando={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setPorEliminar(null)}
      />

      {/* ===== Confirmación de desactivación (reversible) ===== */}
      <DialogoDesactivarRegistro
        abierto={!!porDesactivar}
        titulo={t("clientes.desactivar")}
        descripcion={t("clientes.desactivarConfirmacion")}
        cargando={actualizar.isPending}
        onConfirmar={confirmarDesactivar}
        onCerrar={() => setPorDesactivar(null)}
      />
    </div>
  );
}
