# ============================================================
# CIG-MANUFACTURING — Imagen de producción con Bun + PostgreSQL
#
# Build:   docker build -t cig-manufacturing .
# Run:     docker compose up -d (ver docker-compose.yml)
#
# El runtime de EJECUCIÓN es Bun (la imagen oven/bun no incluye
# Node.js): la app standalone se sirve con `bun server.js`, el mismo
# runtime con el que se compila y se prueba en CI (versión fijada
# 1.3.14 para reproducibilidad).
#
# Seguridad:
#   · Proceso sin privilegios (usuario `bun` de la imagen base).
#   · Sin secretos horneados: AUTH_SECRET y DATABASE_URL se exigen en
#     el arranque (docker-entrypoint.sh) y se validan antes de tocar nada.
#   · AUDITORÍA DE CADENA DE SUMINISTRO (Fase 5 — ADR-008): el build se
#     DETIENE si `bun audit --audit-level=high` halla vulnerabilidades
#     Alta o Crítica en el árbol de dependencias recién instalado.
#   · devDependencies se eliminan tras la compilación.
#   · HEALTHCHECK sobre GET /api.
#
# PostgreSQL:
#   · postgresql-client-16 desde el repositorio oficial PGDG: el módulo
#     Respaldo invoca pg_dump/pg_restore/psql (la restauración en
#     caliente lo exige). La versión del cliente debe ser >= la del
#     servidor (postgres:16): el cliente 15 del Debian base abortaría
#     con «server version mismatch».
# ============================================================
FROM oven/bun:1.3.14-debian

WORKDIR /app

# 0) Cliente de PostgreSQL 16 (PGDG: bookworm solo empaqueta el 15).
#    La clave se instala en el keyring firmado y el paquete temporal
#    de descarga se purga para no engordar la imagen.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
    && apt-get purge -y gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# 1) Dependencias (capa cacheable; lockfile congelado)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 1.5) Auditoría de cadena de suministro (Fase 5 — ADR-008)
#      Corre sobre el árbol recién instalado (mismo lockfile congelado
#      que usará el build) y ANTES de compilar: fail-fast, y la capa
#      se cachea junto a la de dependencias (solo se re-audita cuando
#      cambian package.json o bun.lock).
#      `bun audit` no tiene bandera `--severity`: su equivalente nativo
#      es `--audit-level` (low|moderate|high|critical), idéntico en
#      semántica a `npm audit --audit-level`. Sale con código 1 si hay
#      avisos >= high, lo que DETIENE el build de la imagen.
RUN bun audit --audit-level=high

# 2) Código fuente
COPY . .

# 3) Compilación de producción (standalone)
#    prisma generate: el cliente debe existir para el build
ENV NEXT_TELEMETRY_DISABLED=1
RUN bunx prisma generate && bun run build

# 4) Podar dependencias de desarrollo (la imagen final solo necesita
#    las de runtime: @prisma/client + prisma CLI para el arranque)
RUN bun install --frozen-lockfile --production

# 5) Configuración de ejecución
#    Sin DATABASE_URL horneada: la inyecta docker-compose (nunca se
#    gradúan credenciales dentro de la imagen). El entrypoint valida
#    su presencia y formato ANTES de aplicar migraciones.
#    DATA_DIR apunta al volumen /data (respaldos, branding,
#    credenciales) para persistir entre contenedores.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    BRANDING_DIR=/data/branding

# Volumen de datos con propiedad del usuario sin privilegios: los
# volúmenes nombrados NUEVOS heredan estos permisos en su primer uso.
RUN mkdir -p /data/backups /data/branding .next/standalone/.next/cache \
    && chown -R bun:bun /data .next/standalone/.next/cache

VOLUME /data
EXPOSE 3000

# 6) Comprobación de salud: GET /api responde 200 cuando el
#    servidor standalone está operativo
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

COPY --chmod=755 docker-entrypoint.sh /app/docker-entrypoint.sh

# Sin privilegios de root para el proceso de la aplicación
USER bun

ENTRYPOINT ["/app/docker-entrypoint.sh"]
