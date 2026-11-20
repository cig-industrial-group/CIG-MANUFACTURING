> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

---

## ADR-003 — Folios monotónicos y bitácoras inmutables para auditoría forense

**Estado:** Aceptado · **Fecha:** v1.0.0

### Contexto

En un entorno de fábrica, los folios de movimientos y salidas se **imprimen** (etiquetas,
remisiones, referencias cruzadas en papel) y se citan en auditorías. Reutilizar un folio
— aunque sea tras eliminar el registro que lo portaba — rompe la trazabilidad y puede
hacer parecer que un registro histórico "nunca existió". Por su parte, editar un
movimiento *in place* destruiría la evidencia del error original: exactamente lo que una
auditoría necesita ver.

### Decisión

1. **Series de folios monotónicas** (`SecuenciaFolio`): una fila por serie
   `prefijo-fecha` (p. ej. `SAL-20261103`); `ultimo` es el último número emitido y **el
   contador jamás retrocede**. La emisión es un incremento atómico dentro de la
   transacción del movimiento (`reservarNumeroSerie` en
   `src/modulos/almacen/servicios/nucleo.ts`). La primera emisión de una serie se
   siembra con el mayor número histórico ya emitido (registros vivos **+ bitácora**),
   para que bases de datos existentes conserven su histórico sin reutilizar números.
2. **Ledger inmutable**: `Movimiento` nunca se actualiza ni se borra. Corregir o
   eliminar crea una fila en `CorreccionMovimiento` con `accion` (`EDICION` /
   `ELIMINACION`), el estado `antes` (JSON), el estado `despues` (JSON, `null` en
   eliminaciones), el `motivo` capturado y el usuario (`usuarioId` + snapshot de
   nombre).
3. **Autodescripción**: cada movimiento congela snapshots del producto, almacenes,
   cliente y usuario (`productoSku`, `clienteNombre`, `salidaFolio`…), con referencias
   suaves sin FK, de modo que el histórico sobrevive a la eliminación de cualquier
   entidad y se re-vincula solo si la entidad se restaura desde la papelera con el
   mismo id.
4. **Eliminación en niveles** (Papelera): desactivar / papelera 30 días con snapshot /
   purga irreversible que conserva la fila como bitácora (estado `PURGADO`, `datos`
   null). Ver [04-REFERENCIA-BASE-DATOS.md](./04-REFERENCIA-BASE-DATOS.md) §8.2.

### Alternativas descartadas

- **Folio = máx(id)+1 o contar filas**: recicla números al eliminar registros y
  condiciona la numeración a un conteo vivo (además de condiciones de carrera).
- **UUID como identificador público**: único pero ilegible e imprimible con dificultad;
  el consecutivo por fecha (`SAL-20261103-0004`) es operativo en piso de planta y sigue
  siendo garantizado único por la serie monotónica.
- **Editar movimientos in place con columna `actualizadoPor`**: pierde el estado
  anterior; la auditoría forense requiere el **antes y el después**, no solo el
  último estado.

### Consecuencias

- Eliminar un movimiento **no** libera su folio: puede existir un hueco en la
  numeración viva; el número sigue atribuible vía bitácora. Es el comportamiento
  correcto, no un defecto.
- Costo de almacenamiento: cada corrección duplica el registro en JSON (`antes` /
  `despues`). Aceptable: es el precio de la evidencia.
- Los registros de entidades eliminadas quedan congelados (no editables) y marcados
  con distintivo «Eliminado» en la UI (`clienteExiste=false` y equivalentes).
- Regla de desarrollo derivada: jamás `UPDATE`/`DELETE` sobre `Movimiento`,
  `CorreccionMovimiento`, `Papelera` ni `RestauracionBD` fuera de sus servicios.

---
