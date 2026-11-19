> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

---

## ADR-005 — Referencias suaves + snapshots en los registros de auditoría (sin FK hacia entidades de negocio)

**Estado:** Aceptado · **Fecha:** v1.0.0

### Contexto

Los movimientos y registros de calidad refieren productos, almacenes, clientes y
usuarios. Si esas entidades se eliminan (papelera → purga), un FK duro con
`onDelete: Cascade` borraría la historia — inaceptable para un sistema de auditoría
(ADR-003) — y con `SetNull`/`Restrict` complicaría la eliminación legítima.

### Decisión

Los registros tipo ledger (`Movimiento`, `CorreccionMovimiento`, `SalidaOQC`,
`RegistroScrap`, `RegistroRechazo`, `Papelera`, `RestauracionBD`) guardan
**referencias suaves** (`productoId`, `clienteId`, `usuarioId`, `salidaId`… como
`String` sin `@relation`) junto con **snapshots** de los datos vivos al momento del
registro (`productoSku`, `clienteNombre`, `usuarioNombre`, `salidaFolio`…). Las FK
duras quedan reservadas a relaciones estructurales (`Usuario→Rol`,
`Stock→Producto/Almacen`, `ModeloParte→…`, `Restablecimiento→Usuario`).

### Justificación

1. La historia sobrevive intacta a la eliminación de cualquier entidad referenciada, y
   se **re-vincula sola** si la entidad se restaura desde la papelera con el mismo id.
2. El snapshot describe el mundo *como era al registrarse* (razón social de entonces,
   unidad de entonces), que es lo que la auditoría forense exige.
3. La eliminación de entidades sigue siendo operativa (papelera) sin bloqueos de
   integridad referencial.

### Consecuencias

- Los listados deben complementar la referencia suave con el snapshot para mostrar
  datos fiables (patrón `clienteExiste` en el historial).
- No hay `onDelete` que proteja la consistencia: es responsabilidad de los servicios
  (transacciones) mantener coherencia entre ledger y estado vivo.
- Un módulo nuevo que participe en movimientos debe adoptar este patrón (doc 03, regla
  previa 7).

---
