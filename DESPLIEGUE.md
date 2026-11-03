# Guía de despliegue — CIG-MANUFACTURING

Guía completa para desplegar CIG-MANUFACTURING en tu propio servidor (Linux recomendado;
también aplica a macOS y Windows con WSL).

---

## 1. Requisitos

| Componente | Versión mínima | Notas |
|---|---|---|
| **Node.js** | 20 LTS o superior | `node -v` para comprobar. Incluye `npm` y `npx`. |
| **Bun** (opcional) | 1.1+ | Alternativa más rápida: `curl -fsSL https://bun.sh/install \| bash` |
| **RAM** | 1 GB | Para compilar. En ejecución consume ~150-250 MB. |
| **Disco** | 2 GB | `node_modules` + build + base de datos. |
| **Internet** | — | Solo durante la instalación/compilación (descarga dependencias y fuentes de Google). |

> 💡 Con solo **uno** de los dos runtimes (Node.js o Bun) es suficiente: `setup.sh`
> detecta cuál hay disponible.

## 2. Instalación rápida (recomendada)

```bash
# 1. Copia el paquete a tu servidor y descomprímelo
unzip cig-manufacturing-codigo-fuente.zip
cd cig-manufacturing

# 2. Da permisos y ejecuta la instalación completa
chmod +x setup.sh start.sh
./setup.sh

# 3. Levanta el servidor
./start.sh
```

`setup.sh` hace todo: genera `.env` con una clave aleatoria, instala dependencias,
crea la base de datos SQLite con su esquema, siembra **roles + usuarios + configuración**
(sin datos de demostración) y compila para producción.

Abre `http://TU_IP:3000` e inicia sesión:

| Correo | Contraseña |
|---|---|
| `admin@cig-manufacturing.com` | `Admin*2024` |
| `ti@cig-manufacturing.com` | `Ti*2024` |

> ⚠️ **El paquete ya incluye una base de datos limpia** (`db/custom.db`) con solo roles,
> usuarios y configuración. `setup.sh` simplemente la verifica y re-siembra si hiciera
> falta. Si prefieres empezar de cero: `rm db/custom.db` antes de ejecutar `setup.sh`.

## 3. Instalación manual (paso a paso)

Si prefieres controlar cada paso en lugar de usar `setup.sh`:

```bash
# 1. Variables de entorno
cp .env.example .env
nano .env
```

Edita `.env`:

```ini
# RUTA ABSOLUTA al archivo de la base de datos en TU servidor
DATABASE_URL=file:/opt/cig-manufacturing/db/custom.db

# Clave aleatoria para firmar sesiones (genera la tuya):
#   openssl rand -hex 32
AUTH_SECRET=pega-aqui-tu-clave-aleatoria
```

> ⚠️ **`DATABASE_URL` debe ser una ruta absoluta** (`file:/opt/cig-manufacturing/db/custom.db`).
> Las rutas relativas no se resuelven correctamente en el modo de producción *standalone*
> de Next.js + Prisma.

```bash
# 2. Instalar dependencias (elige una)
bun install          # con Bun
npm install          # con Node.js

# 3. Crear la base de datos y sembrar usuarios
bunx prisma db push --skip-generate     # o: npx prisma db push --skip-generate
bun prisma/seed.ts                      # o: npx tsx prisma/seed.ts

# 4. Compilar para producción
bun run build        # o: npm run build

# 5. Arrancar
./start.sh           # o directamente: node .next/standalone/server.js
```

## 4. Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | Ruta absoluta del SQLite: `file:/ruta/absoluta/db/custom.db` |
| `AUTH_SECRET` | ✅ | Clave de firmado JWT. Si falta, se usa una insegura de desarrollo. |
| `PORT` | ❌ | Puerto de escucha (por defecto `3000`). |
| `BIND_HOST` | ❌ | Dirección de escucha (por defecto `0.0.0.0` = todas las interfaces; usa `127.0.0.1` para solo local). |

## 5. Mantener el servidor corriendo

### Opción A — PM2 (recomendada, la más simple)

```bash
npm install -g pm2
cd /opt/cig-manufacturing   # (la ruta donde desplegaste)

pm2 start start.sh --name cig-manufacturing
pm2 save
pm2 startup         # arranca CIG-MANUFACTURING al reiniciar el servidor
```

Comandos útiles: `pm2 logs cig-manufacturing` · `pm2 restart cig-manufacturing` · `pm2 monit`

### Opción B — systemd (sin dependencias externas)

Crea `/etc/systemd/system/cig-manufacturing.service`:

```ini
[Unit]
Description=CIG-MANUFACTURING — Sistema de Gestión de Fábrica
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/cig-manufacturing
EnvironmentFile=/opt/cig-manufacturing/.env
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/cig-manufacturing/.next/standalone/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/cig-manufacturing
sudo systemctl daemon-reload
sudo systemctl enable --now cig-manufacturing
sudo systemctl status cig-manufacturing
```

### Opción C — Docker

```bash
docker compose up -d --build
```

Ver `docker-compose.yml`. La base de datos vive en un volumen (`fabriflow-data`)
y sobrevive a reinicios y reconstrucciones del contenedor.

## 6. Exponer el servicio (proxy inverso)

Para usar el puerto 80/443 con dominio propio:

### Nginx

```nginx
server {
    listen 80;
    server_name cig-manufacturing.tuempresa.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Con HTTPS (Let's Encrypt): `sudo certbot --nginx -d cig-manufacturing.tuempresa.com`

### Caddy (más simple, HTTPS automático)

```
cig-manufacturing.tuempresa.com {
    reverse_proxy 127.0.0.1:3000
}
```

> Las cookies de sesión funcionan tanto por HTTP (red interna) como por HTTPS.
> Para acceso desde Internet se recomienda HTTPS.

## 7. Respaldos

La base de datos completa es **un solo archivo**. Para respaldarla en caliente:

```bash
sqlite3 /opt/cig-manufacturing/db/custom.db ".backup '/backups/cig-manufacturing-$(date +%F).db'"
```

O en frío (servidor detenido), simplemente copia el archivo:

```bash
cp db/custom.db /backups/cig-manufacturing-$(date +%F).db
```

Para restaurar: detén el servidor, reemplaza `db/custom.db` y arranca de nuevo.
Recomendación: respaldo diario con `cron`:

```
0 2 * * * sqlite3 /opt/cig-manufacturing/db/custom.db ".backup '/backups/cig-manufacturing-$(date +\%F).db'"
```

## 8. Actualizar a una nueva versión del código

```bash
cd /opt/cig-manufacturing
pm2 stop cig-manufacturing                # o: sudo systemctl stop cig-manufacturing

# Reemplaza el código fuente por la nueva versión
# (por ejemplo: unzip -o cig-manufacturing-codigo-fuente.zip)
# Conserva tu .env y tu db/custom.db actuales

bun install          # o npm install
bunx prisma db push --skip-generate   # aplica cambios de esquema si los hay

# Si actualizas una instalación previa al módulo Catálogo (roles sin
# catalogo.ver / catalogo.gestionar), aplica la migración de permisos
# a los roles existentes (una sola vez):
bun scripts/permiso-catalogo.ts       # o: npx tsx scripts/permiso-catalogo.ts

# Si actualizas una instalación previa al módulo Papelera (histórico de
# movimientos sin snapshots), aplica la migración una sola vez:
# rellena los snapshots de los movimientos existentes y habilita los
# permisos papelera.ver / papelera.gestionar en ADMIN y TI:
bun scripts/migrar-papelera.ts        # o: npx tsx scripts/migrar-papelera.ts

bun run build        # o npm run build

pm2 start cig-manufacturing  # o: sudo systemctl start cig-manufacturing
```

## 9. Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| `PrismaClientInitializationError: Unable to open DB file` | `DATABASE_URL` relativa o sin permisos | Usa una **ruta absoluta** en `.env` y verifica permisos de escritura sobre `db/`. |
| El servidor arranca pero no es accesible desde otras máquinas | Escucha solo en localhost o el firewall bloquea | `start.sh` ya fuerza la escucha en `0.0.0.0` (para solo local: `BIND_HOST=127.0.0.1 ./start.sh`). Abre el puerto en el firewall (`sudo ufw allow 3000`). |
| Sesiones se pierden al reiniciar | `AUTH_SECRET` cambia entre arranques | Define `AUTH_SECRET` fija en `.env` (la genera `setup.sh` una sola vez). |
| Errores de `prisma generate` tras `npm install` | Instalación interrumpida | Ejecuta `npx prisma generate` manualmente y reintenta el build. |
| Error descargando fuentes de Google durante `npm run build` | Sin salida a Internet en el servidor | Compila en otra máquina con Internet y copia el proyecto completo (incluido `.next/`), o edita `src/app/layout.tsx` quitando `Geist`/`Geist_Mono` de `next/font/google`. |
| `EADDRINUSE: port 3000 in use` | Otro proceso usa el puerto | `PORT=8080 ./start.sh` o libera el puerto. |
| Prisma no encuentra el *query engine* | `.next/standalone` incompleto | Vuelve a ejecutar `npm run build` desde la raíz del proyecto. |

## 10. Seguridad en producción (checklist)

- [ ] Cambiar las contraseñas de `admin@cig-manufacturing.com` y `ti@cig-manufacturing.com`
- [ ] `AUTH_SECRET` aleatorio y único (lo genera `setup.sh`)
- [ ] Deshabilitar el autoregistro si no lo necesitas (Sistema → Ajustes)
- [ ] HTTPS si hay acceso desde Internet
- [ ] Respaldo diario programado de `db/custom.db`
- [ ] Firewall: exponer solo 80/443 (y SSH), no el 3000 directamente
- [ ] Crear usuarios reales por persona y desactivar cuentas genéricas cuando ya no se usen
