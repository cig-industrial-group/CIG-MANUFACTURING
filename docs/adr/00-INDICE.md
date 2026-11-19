# Índice de Decisiones Arquitectónicas (ADR)

> **Proyecto:** CIG-MANUFACTURING · **Versión documentada:** 2.3.0
>
> Cada ADR responde al **«¿por qué?»** de una decisión clave de arquitectura:
> contexto, decisión, alternativas descartadas y consecuencias. Un ADR es un
> documento histórico: si la decisión se revierte, se marca como `Reemplazado`
> y se añade su sucesor; el texto original nunca se edita para maquillar el
> pasado. Esta suite sustituye al antiguo archivo unificado
> `docs/06-REGISTRO-DECISIONES-ARQUITECTONICAS (ADR).md` (retirado en v2.3.0;
> su contenido se conservó íntegro, dividido por decisión).

---

| ADR | Título | Estado | Versión |
|---|---|---|---|
| [ADR-001](./ADR-001-sqlite-sobre-postgresql.md) | SQLite sobre PostgreSQL para despliegue autónomo | **Reemplazado** por ADR-009 | v1.0.0 |
| [ADR-002](./ADR-002-systemd-hardening.md) | `ProtectHome=read-only` + `ReadWritePaths` en systemd | Aceptado | v1.0.0 |
| [ADR-003](./ADR-003-folios-monotonicos-bitacoras-inmutables.md) | Folios monotónicos y bitácoras inmutables para auditoría forense | Aceptado | v1.0.0 |
| [ADR-004](./ADR-004-guarda-autenticacion-por-ruta.md) | Guarda de autenticación por ruta (`requerirPermiso`) en lugar de `middleware.ts` | Aceptado | v1.0.0 |
| [ADR-005](./ADR-005-referencias-suaves-snapshots.md) | Referencias suaves + snapshots en los registros de auditoría (sin FK hacia entidades de negocio) | Aceptado | v1.0.0 |
| [ADR-006](./ADR-006-reintentos-retroceso-exponencial.md) | Reintentos con retroceso exponencial para errores transitorios de la capa de datos | Aceptado | v1.0.0 |
| [ADR-007](./ADR-007-cookie-sesion-endurecida.md) | Endurecimiento de la cookie de sesión: `SameSite=Strict`, `Secure` condicional y expiración de 24 h | Aceptado | v1.0.0 |
| [ADR-008](./ADR-008-auditoria-cadena-suministro.md) | Auditoría de cadena de suministro en el build de la imagen: `bun audit --audit-level=high` | Aceptado | v2.0.0 |
| [ADR-009](./ADR-009-migracion-postgresql-16.md) | Migración del motor de base de datos a PostgreSQL 16 | Aceptado | v2.0.0 |
| [ADR-010](./ADR-010-migracion-directa-a-numeric.md) | Migración directa de los campos numéricos a NUMERIC nativo | Aceptado | v2.3.0 |

---

## Línea de decisión

- **Motor y persistencia:** ADR-001 (SQLite) → **ADR-009** (PostgreSQL 16) →
  **ADR-010** (NUMERIC nativo para cantidades/costos). La integridad numérica
  pasó de «texto exacto validado por la app» a «dominio impuesto por el motor».
- **Endurecimiento operativo:** ADR-002 (systemd), ADR-006 (reintentos SQLSTATE),
  ADR-008 (cadena de suministro del build).
- **Seguridad de aplicación:** ADR-004 (guarda por ruta), ADR-007 (cookie de sesión),
  ADR-005 (referencias suaves + snapshots de auditoría).

## Cómo se redacta un ADR nuevo

1. Copia la plantilla implícita de cualquier ADR vigente (cabecera de proyecto +
   `## ADR-NNN — Título` + **Estado**/**Fecha** + `### Contexto`, `### Decisión`,
   `### Alternativas descartadas`, `### Consecuencias`).
2. Numéralo consecutivamente y registra aquí título, estado y versión.
3. Si tu decisión reemplaza una anterior, marca aquella como `Reemplazado por
   ADR-NNN` en su propio archivo y enlázalo desde aquí; no borres nada.
