## Descripción del cambio

<!-- Qué hace este pull request y por qué. Describe el comportamiento
     antes y después, y enlaza el issue o incidente relacionado. -->

## Tipo de cambio

- [ ] Bug fix (corrección de un defecto; sin cambio de comportamiento esperado)
- [ ] Nueva funcionalidad (feature)
- [ ] Refactor (reestructuración sin cambio de comportamiento observable)
- [ ] Documentación
- [ ] Infraestructura / despliegue

## Checklist de calidad y seguridad

<!-- Marca cada punto. Los comandos de verificación local son los mismos
     del pipeline (.github/workflows/ci.yml). -->

- [ ] **`bun audit` limpio** — sin vulnerabilidades conocidas en dependencias (`bun audit`)
- [ ] **Migraciones de Prisma revisadas** — si `prisma/` cambió: `bunx prisma validate` en verde y migración auditables (no `db push` en producción)
- [ ] **Pruebas E2E aprobadas** — `bash scripts/simulacion-ci.sh` completa sin errores (build, tipos, humo con BD efímera)
- [ ] **Documentación actualizada** — `docs/`, `README.md` o `README-DEPLOY.md` reflejan el cambio cuando aplica
- [ ] **Sin secretos hardcodeados** — ni credenciales, tokens ni valores de `AUTH_SECRET` en el código o en este PR (el CI lo rechaza)

## Notas para el revisor

<!-- Opcional: puntos de riesgo, decisiones de diseño, áreas que merecen
     revisión especial (p. ej. autenticación, folios, transacciones de
     stock) o evidencia de pruebas locales. -->
