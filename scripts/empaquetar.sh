#!/bin/bash
# Empaqueta el código fuente de FabriFlow v1.0.0 en download/
# (zip + tar.gz, estructura fabriflow/, sin dependencias ni bases de datos)
set -e
cd /home/z/my-project
rm -rf /tmp/fabriflow-pkg && mkdir -p /tmp/fabriflow-pkg/fabriflow

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
  ./ /tmp/fabriflow-pkg/fabriflow/

cd /tmp/fabriflow-pkg
rm -f /home/z/my-project/download/fabriflow-codigo-fuente.zip
rm -f /home/z/my-project/download/fabriflow-codigo-fuente.tar.gz
zip -r -q /home/z/my-project/download/fabriflow-codigo-fuente.zip fabriflow
tar -czf /home/z/my-project/download/fabriflow-codigo-fuente.tar.gz fabriflow

echo "=== Empaquetado completo ==="
unzip -l /home/z/my-project/download/fabriflow-codigo-fuente.zip | tail -2
ls -la /home/z/my-project/download/
