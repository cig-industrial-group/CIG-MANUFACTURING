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
 * CAPTURA DE CANTIDAD EN UNIDADES DE MANEJO
 * Widget compartido por Almacén (entradas, recepción, salidas, traslados
 * y ajustes) y OQC (liberaciones y scrap).
 *
 * Dos modos, según el EMPAQUE CONFIGURADO DEL PRODUCTO (la cantidad que
 * lleva cada paquete varía por producto y se define al registrarlo):
 *   · DIRECTO: la cantidad se captura en la unidad base (PZA, KG, M...).
 *   · PAQUETES: se capturan paquetes completos (cajas, paquetes, bultos)
 *     + unidades sueltas. El total equivalente en unidad base se
 *     calcula y muestra en vivo: 3 PAQ × 10 + 2 PZA = 32 PZA.
 *
 * El catálogo de unidades solo aporta el nombre visible de la unidad de
 * empaque y su disponibilidad (si se desactiva, la captura vuelve al
 * modo directo). El estado es controlado por el padre (EstadoConteo);
 * el total se calcula con `calcularConteo` (consultas.ts). El servidor
 * vuelve a validar y calcular todo de forma autoritativa en
 * `resolverConteoTx`.
 */
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import { calcularConteo, paqueteDelProducto, useUnidades } from "../servicios/consultas";
import type { EmpaqueProductoConteo, EstadoConteo } from "../tipos";
import { formatearNumeroConteo } from "../tipos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CapturaConteo({
  producto,
  valor,
  onChange,
  etiquetaCantidad,
  idPrefijo = "conteo",
  compacto = false,
}: {
  /** producto seleccionado: unidad base + empaque configurado (si tiene) */
  producto: EmpaqueProductoConteo | null | undefined;
  valor: EstadoConteo;
  onChange: (nuevo: EstadoConteo) => void;
  /** etiqueta del campo en modo directo (p. ej. «Cantidad a ingresar») */
  etiquetaCantidad: string;
  idPrefijo?: string;
  compacto?: boolean;
}) {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { data: unidades } = useUnidades();

  const unidadBase = producto?.unidad ?? "PZA";
  const empaque = paqueteDelProducto(unidades, producto);
  const enPaquetes = Boolean(empaque && valor.unidad === empaque.codigo);
  const resultado = calcularConteo(valor, producto);

  return (
    <div className="space-y-2">
      {/* Selector de unidad de conteo (solo si el producto tiene empaque) */}
      {empaque && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefijo}-unidad`}>{t("operacion.conteoEn")}</Label>
          <Select
            value={enPaquetes ? empaque.codigo : unidadBase}
            onValueChange={(unidad) => onChange({ unidad, paquetes: "", sueltas: "" })}
          >
            <SelectTrigger id={`${idPrefijo}-unidad`} className="h-9 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Unidad base (captura directa) */}
              <SelectItem value={unidadBase}>
                {unidadBase} — {t("operacion.conteoDirecto")}
              </SelectItem>
              {/* Empaque configurado del producto */}
              <SelectItem value={empaque.codigo}>
                {empaque.codigo} — {empaque.nombre} (
                {formatearNumeroConteo(producto?.contenidoPaquete ?? 0)} {unidadBase})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!enPaquetes ? (
        /* ===== Modo directo: cantidad en la unidad base ===== */
        <div className="relative">
          <Input
            id={`${idPrefijo}-cantidad`}
            type="number"
            min={0}
            step="any"
            value={valor.sueltas}
            onChange={(e) => onChange({ ...valor, sueltas: e.target.value })}
            className={compacto ? "h-9 pr-14" : "pr-16"}
            aria-label={etiquetaCantidad}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unidadBase}
          </span>
        </div>
      ) : (
        /* ===== Modo paquetes: completos + sueltas + total en vivo ===== */
        <div className="space-y-2">
          <div className={`grid gap-2 ${compacto ? "" : "sm:grid-cols-2"}`}>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefijo}-paquetes`} className="text-xs">
                {t("operacion.paquetesCompletos")} ({empaque?.codigo} ×{" "}
                {formatearNumeroConteo(producto?.contenidoPaquete ?? 1)})
              </Label>
              <Input
                id={`${idPrefijo}-paquetes`}
                type="number"
                min={0}
                step="any"
                value={valor.paquetes}
                onChange={(e) => onChange({ ...valor, paquetes: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefijo}-sueltas`} className="text-xs">
                {t("operacion.unidadesSueltas")} ({unidadBase})
              </Label>
              <Input
                id={`${idPrefijo}-sueltas`}
                type="number"
                min={0}
                step="any"
                value={valor.sueltas}
                onChange={(e) => onChange({ ...valor, sueltas: e.target.value })}
                className="h-9"
              />
            </div>
          </div>
          <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
            {t("operacion.totalEquivalente")}:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {f.numero(resultado.total, 2)} {unidadBase}
            </span>
            {resultado.valido && resultado.partes && (
              <span className="ml-1">
                ({resultado.partes.map((p) => `${formatearNumeroConteo(p.cantidad)} ${p.unidad}`).join(" + ")})
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
