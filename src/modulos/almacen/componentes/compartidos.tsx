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
 * COMPONENTES COMPARTIDOS DENTRO DEL MÓDULO ALMACÉN
 * Insignias de tipo de movimiento, categorías y selectores especializados.
 */
import { useIdioma } from "@/modulos/compartidos/idioma";
import { SelectorBuscador } from "@/modulos/compartidos/ui";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FilePenLine,
  PackagePlus,
  Repeat,
  SlidersHorizontal,
  Boxes,
} from "lucide-react";
import type { Almacen, Producto } from "../tipos";

// ============================================================
// INSIGNIA DE TIPO DE MOVIMIENTO
// ============================================================
export function InsigniaTipoMovimiento({ tipo, compacto = false }: { tipo: string; compacto?: boolean }) {
  const { t } = useIdioma();
  const config: Record<
    string,
    { clase: string; icono: React.ReactNode; suffix: string }
  > = {
    ENTRADA: {
      clase: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      icono: <PackagePlus className="h-3.5 w-3.5" />,
      suffix: "mov.tipos.ENTRADA",
    },
    RECEPCION: {
      clase: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30",
      icono: <ArrowDownToLine className="h-3.5 w-3.5" />,
      suffix: "mov.tipos.RECEPCION",
    },
    SALIDA: {
      clase: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
      icono: <ArrowUpFromLine className="h-3.5 w-3.5" />,
      suffix: "mov.tipos.SALIDA",
    },
    TRASLADO: {
      clase: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30",
      icono: <Repeat className="h-3.5 w-3.5" />,
      suffix: "mov.tipos.TRASLADO",
    },
    AJUSTE: {
      clase: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30",
      icono: <SlidersHorizontal className="h-3.5 w-3.5" />,
      suffix: "mov.tipos.AJUSTE",
    },
  };
  const c = config[tipo] ?? config.AJUSTE;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        c.clase,
      )}
    >
      {c.icono}
      {!compacto && t(c.suffix)}
    </span>
  );
}

// ============================================================
// INSIGNIA DE REGISTRO CORREGIDO
// ============================================================
/** Marca los registros que fueron corregidos desde su sección de origen */
export function InsigniaCorregido() {
  const { t } = useIdioma();
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">
      <FilePenLine className="h-3 w-3" aria-hidden />
      {t("registros.corregido")}
    </span>
  );
}

// ============================================================
// INSIGNIA DE CATEGORÍA DE PRODUCTO
// ============================================================
export function InsigniaCategoria({ categoria }: { categoria: string }) {
  const { t } = useIdioma();
  const clases: Record<string, string> = {
    MATERIA_PRIMA: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    PRODUCTO_TERMINADO: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    MATERIAL: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
    INSUMO: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
  };
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", clases[categoria] ?? clases.MATERIAL)}>
      {t(`categorias.${categoria}`)}
    </Badge>
  );
}

// ============================================================
// INSIGNIA DE PRODUCTO ELIMINADO (en papelera o purgado)
// ============================================================
export function InsigniaProductoEliminado() {
  const { t } = useIdioma();
  return (
    <Badge
      variant="outline"
      className="whitespace-nowrap border-destructive/40 bg-destructive/10 text-destructive"
    >
      {t("comun.eliminado")}
    </Badge>
  );
}

// ============================================================
// SELECTOR DE PRODUCTO (con stock disponible)
// ============================================================
export function SelectorProducto({
  productos,
  valor,
  onChange,
  stockPorAlmacen,
}: {
  productos: Producto[];
  valor: string | null;
  onChange: (id: string) => void;
  stockPorAlmacen?: Map<string, number>; // productoId -> stock (cuando se filtra por almacén)
}) {
  const { t } = useIdioma();
  return (
    <SelectorBuscador
      opciones={productos.map((p) => ({
        valor: p.id,
        etiqueta: `${p.sku} — ${p.nombre}`,
        subetiqueta: stockPorAlmacen
          ? `${t("comun.disponible")}: ${stockPorAlmacen.get(p.id) ?? 0} ${p.unidad}`
          : `${t("producto.stockTotal")}: ${p.stockTotal} ${p.unidad}`,
      }))}
      valor={valor}
      onChange={onChange}
      placeholder={t("comun.seleccionarProducto")}
      placeholderBusqueda={t("comun.buscarProducto")}
      sinResultados={t("comun.sinResultados")}
    />
  );
}

// ============================================================
// SELECTOR DE ALMACÉN
// ============================================================
export function SelectorAlmacen({
  almacenes,
  valor,
  onChange,
  soloActivos = true,
}: {
  almacenes: Almacen[];
  valor: string | null;
  onChange: (id: string) => void;
  soloActivos?: boolean;
}) {
  const { t } = useIdioma();
  return (
    <SelectorBuscador
      opciones={almacenes
        .filter((a) => (soloActivos ? a.activo : true))
        .map((a) => ({
          valor: a.id,
          etiqueta: a.nombre,
          subetiqueta: a.codigo,
          detalle: t(`tiposAlmacen.${a.tipo}`),
        }))}
      valor={valor}
      onChange={onChange}
      placeholder={t("comun.seleccionarAlmacen")}
      placeholderBusqueda={t("comun.buscar")}
      sinResultados={t("comun.sinResultados")}
    />
  );
}

// ============================================================
// INDICADOR DE STOCK BAJO
// ============================================================
export function IndicadorStock({
  stock,
  minimo,
}: {
  stock: number;
  minimo: number;
}) {
  const { t } = useIdioma();
  if (minimo <= 0) return null;
  const ratio = stock / minimo;
  if (ratio < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
        <Boxes className="h-3 w-3" />
        {t("panel.critico")}
      </span>
    );
  }
  if (ratio < 1) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
        <Boxes className="h-3 w-3" />
        {t("panel.bajoMinimo")}
      </span>
    );
  }
  if (ratio < 1.1) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Boxes className="h-3 w-3" />
        {t("panel.cercaMinimo")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <Boxes className="h-3 w-3" />
      {t("inventario.optimo")}
    </span>
  );
}
