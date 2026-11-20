> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

---

## ADR-001 — SQLite sobre PostgreSQL para despliegue autónomo

**Estado:** Reemplazado por [ADR-009](./ADR-009-migracion-postgresql-16.md) · **Fecha:** v1.0.0 · **Retirado en:** v2.0.0

### Contexto

CIG-MANUFACTURING se despliega en **un solo servidor** (frecuentemente una VM sin
equipo de operaciones dedicado) y debe levantar producción en minutos con `deploy.sh`.
El volumen de datos es de planta: miles a cientos de miles de movimientos, no millones
de escrituras por segundo. Las operaciones de inventario son transaccionales y cortas.

### Decisión

Usar **SQLite** accedido mediante **Prisma** (`datasource db { provider = "sqlite" }`
en `prisma/schema.prisma`). La base de datos es un archivo único direccionado por
`DATABASE_URL` con **ruta absoluta** (requisito del modo `standalone`, donde las rutas
relativas no se resuelven correctamente).

### Justificación

1. **Despliegue autónomo y portabilidad**: nada que instalar, versionar, proteger o
   monitorear además de la propia app. Copiar el archivo (mejor: `VACUUM INTO`) es un
   respaldo consistente y transportable; la restauración en caliente del módulo
   Respaldo se apoya en esto.
2. **Costo operativo nulo**: sin credenciales de BD que rotar, sin superficie de
   ataque de un servicio de red adicional, sin firewall interno que configurar —
   coherente con el principio de mínimo privilegio.
3. **Aislamiento systemd limpio**: la unidad `ProtectSystem=strict` +
   `ReadWritePaths=…/db` delimita exactamente qué puede tocar el proceso; con un
   servidor de BD externo esa contención sería imposible desde la unidad de la app.
4. **Suficiencia transaccional**: SQLite garantiza ACID; las operaciones compuestas
   (folio + stock + bitácora) usan `db.$transaction` de Prisma y el
   *todo-o-nada* requerido se cumple (ver `STOCK_INSUFICIENTE` en liberaciones OQC).
5. **Simplicidad de pruebas**: la CI (`scripts/simulacion-ci.sh`) crea una BD efímera
   en un directorio temporal por ejecución.

### Alternativas descartadas

- **PostgreSQL**: robusto y concurrente, pero exige un segundo servicio en producción
  (memoria, parcheo, credenciales, UFW, respaldos propios) que ningún requisito actual
  justifica. Se volvería razonable si el sistema creciera a escrituras concurrentes
  masivas o despliegue multi-servidor.
- **MySQL/MariaDB**: mismo costo operativo que PostgreSQL sin ventaja adicional aquí.

### Consecuencias

- Escrituras serializadas a nivel de archivo: para carga de una sola planta es
  irrelevante; el diseño ya minimiza transacciones largas.
- Administración por archivo: mantenimiento (integridad, respaldo) documentado en
  [05-DESPLIEGUE-Y-OPERACION.md](./05-DESPLIEGUE-Y-OPERACION.md) §4.
- `DATABASE_URL` **debe** ser absoluta en producción (error clásico
  `PrismaClientInitializationError: Unable to open DB file`).

> **Nota (v2.0.0):** esta decisión quedó **reemplazada por ADR-009** (migración del
> motor a PostgreSQL 16). El texto se conserva íntegro como registro histórico del
> razonamiento original y de las condiciones que motivaron el motor embebido.

---
