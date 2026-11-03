# ============================================================
# CIG-MANUFACTURING — Imagen de producción con Bun
# Build:   docker build -t cig-manufacturing .
# Run:     docker run -d -p 3000:3000 -v fabriflow-data:/data -e AUTH_SECRET=$(openssl rand -hex 32) cig-manufacturing
# ============================================================
FROM oven/bun:1.2

WORKDIR /app

# 1) Dependencias (capa cacheable)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 2) Código fuente
COPY . .

# 3) Compilación de producción (standalone)
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# 4) Configuración de ejecución
# La BD vive en el volumen /data para persistir entre contenedores
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/data/fabriflow.db

VOLUME /data
EXPOSE 3000

# 5) Al arrancar: crea el esquema si la BD es nueva, siembra usuarios
#    (idempotente) y levanta el servidor
CMD ["sh", "-c", "bunx prisma db push --skip-generate && bun prisma/seed.ts; SERVER_JS=$(find .next/standalone -maxdepth 5 -name server.js -not -path '*node_modules*' | head -1); exec node \"$SERVER_JS\""]
