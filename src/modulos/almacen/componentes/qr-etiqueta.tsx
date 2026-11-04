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
 * ETIQUETAS QR — Componente reutilizable del módulo almacén
 * Genera etiquetas imprimibles con código QR para productos y almacenes.
 * El contenido del QR es un JSON corto que el sistema puede interpretar
 * al escanear: {"tipo":"producto","sku":"MP-0001"}
 */
import QRCode from "react-qr-code";
import { Printer } from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
import type { Almacen, Producto } from "../tipos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type TamanoEtiqueta = "S" | "M" | "L";

const TAMANOS: Record<TamanoEtiqueta, { qr: number; texto: string }> = {
  S: { qr: 84, texto: "text-[10px]" },
  M: { qr: 112, texto: "text-xs" },
  L: { qr: 148, texto: "text-sm" },
};

export function payloadProducto(p: Pick<Producto, "sku">) {
  return JSON.stringify({ tipo: "producto", sku: p.sku });
}

export function payloadAlmacen(a: Pick<Almacen, "codigo">) {
  return JSON.stringify({ tipo: "almacen", codigo: a.codigo });
}

// ============================================================
// ETIQUETA DE PRODUCTO
// ============================================================
export function EtiquetaQrProducto({
  producto,
  tamano = "M",
  conSku = true,
  conNombre = true,
  conUnidad = true,
}: {
  producto: Pick<Producto, "sku" | "nombre" | "unidad" | "unidadPaquete" | "contenidoPaquete">;
  tamano?: TamanoEtiqueta;
  conSku?: boolean;
  conNombre?: boolean;
  conUnidad?: boolean;
}) {
  const { t } = useIdioma();
  const config = TAMANOS[tamano];
  return (
    <div className="area-impresion-etiqueta inline-flex flex-col items-center gap-1.5 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm print:break-inside-avoid">
      <QRCode value={payloadProducto(producto)} size={config.qr} fgColor="#0f172a" />
      <div className="max-w-[180px] text-center leading-tight">
        {conSku && (
          <p className="font-mono font-bold tracking-wide">{producto.sku}</p>
        )}
        {conNombre && (
          <p className={cn("line-clamp-2 font-medium", config.texto)}>{producto.nombre}</p>
        )}
        {conUnidad && (
          <p className={cn("text-slate-500", config.texto)}>
            {t("producto.unidad")}: {producto.unidad}
          </p>
        )}
        {conUnidad && producto.unidadPaquete && producto.contenidoPaquete && (
          <p className={cn("tabular-nums text-slate-500", config.texto)}>
            1 {producto.unidadPaquete} = {producto.contenidoPaquete} {producto.unidad}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ETIQUETA DE ALMACÉN / UBICACIÓN
// ============================================================
export function EtiquetaQrAlmacen({
  almacen,
  tamano = "M",
}: {
  almacen: Pick<Almacen, "codigo" | "nombre" | "ubicacion">;
  tamano?: TamanoEtiqueta;
}) {
  const { t } = useIdioma();
  const config = TAMANOS[tamano];
  return (
    <div className="area-impresion-etiqueta inline-flex flex-col items-center gap-1.5 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm print:break-inside-avoid">
      <QRCode value={payloadAlmacen(almacen)} size={config.qr} fgColor="#0f172a" />
      <div className="max-w-[180px] text-center leading-tight">
        <p className="font-mono font-bold tracking-wide">{almacen.codigo}</p>
        <p className={cn("line-clamp-2 font-medium", config.texto)}>{almacen.nombre}</p>
        {almacen.ubicacion && (
          <p className={cn("line-clamp-1 text-slate-500", config.texto)}>{almacen.ubicacion}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DIÁLOGO: ETIQUETA INDIVIDUAL CON IMPRESIÓN
// ============================================================
export function DialogoEtiquetaQr({
  abierto,
  onCerrar,
  children,
  titulo,
  descripcion,
}: {
  abierto: boolean;
  onCerrar: () => void;
  children: React.ReactNode;
  titulo: string;
  descripcion?: string;
}) {
  const { t } = useIdioma();
  return (
    <Dialog open={abierto} onOpenChange={onCerrar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
        </DialogHeader>
        <div className="flex justify-center py-2">
          <div className="area-impresion">{children}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            {t("comun.cerrar")}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            {t("comun.imprimir")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
