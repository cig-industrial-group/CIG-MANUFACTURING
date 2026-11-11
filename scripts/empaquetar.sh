#!/bin/bash
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

# Empaqueta el código fuente de CIG-MANUFACTURING en download/
# (la versión del sistema vive únicamente en package.json — SSOT,
# ver src/lib/version.ts; este script ya no la fija a mano)
# (zip + tar.gz, estructura cig-manufacturing/, sin dependencias ni bases de datos)
set -e
cd /home/z/my-project
rm -rf /tmp/cig-manufacturing-pkg && mkdir -p /tmp/cig-manufacturing-pkg/cig-manufacturing

# Copia del proyecto excluyendo artefactos no distribuibles
rsync -a --quiet \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'db' \
  --exclude 'dev.log' \
  --exclude 'server.log' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude 'download' \
  --exclude 'upload' \
  --exclude 'tool-results' \
  --exclude 'examples' \
  --exclude 'mini-services' \
  --exclude 'skills' \
  --exclude 'tests' \
  --exclude '.env' \
  --exclude '.git' \
  --exclude '.staging' \
  --exclude '.zscripts' \
  ./ /tmp/cig-manufacturing-pkg/cig-manufacturing/

cd /tmp/cig-manufacturing-pkg
rm -f /home/z/my-project/download/cig-manufacturing-codigo-fuente.zip
rm -f /home/z/my-project/download/cig-manufacturing-codigo-fuente.tar.gz
zip -r -q /home/z/my-project/download/cig-manufacturing-codigo-fuente.zip cig-manufacturing
tar -czf /home/z/my-project/download/cig-manufacturing-codigo-fuente.tar.gz cig-manufacturing

echo "=== Empaquetado completo ==="
unzip -l /home/z/my-project/download/cig-manufacturing-codigo-fuente.zip | tail -2
ls -la /home/z/my-project/download/
