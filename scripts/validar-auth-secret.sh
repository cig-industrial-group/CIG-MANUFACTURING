#!/usr/bin/env bash
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

# ============================================================
# VALIDACIÓN DE AUTH_SECRET (fuente compartida)
#
# La usan setup.sh, start.sh y docker-entrypoint.sh para rechazar
# la misma clase de secretos inválidos que el módulo de la app
# (src/modulos/autenticacion/servicios/seguridad.ts):
#   · ausente / vacío
#   · menor de 32 caracteres (≈256 bits)
#   · valores publicados (plantillas, fallbacks históricos,
#     secretos de prueba)
#
# El valor NUNCA se imprime: los mensajes describen la causa.
#
# Uso:  source scripts/validar-auth-secret.sh
#       validar_auth_secret "$AUTH_SECRET" || exit 1
# ============================================================

AUTH_SECRET_MIN_CARACTERES=32

# Valores publicados en el repositorio: inutilizables como secretos.
SECRETOS_PROHIBIDOS=(
  "cig-manufacturing-secreto-desarrollo-2024-cambiar-en-produccion"
  "fabriflow-secreto-desarrollo-2024-cambiar-en-produccion"
  "cambia-esta-clave-por-una-aleatoria-de-64-caracteres"
  "cambia-esta-clave-con-openssl-rand-hex-32"
  "pega-aqui-tu-clave-aleatoria"
  "ci-clave-efimera-solo-pruebas"
  "clave-local-solo-pruebas"
)

# Imprime el mensaje de ayuda estándar (sin el valor del secreto).
_ayuda_auth_secret() {
  echo "  Genera uno aleatorio con:   openssl rand -hex 32"
  echo "  y define la variable AUTH_SECRET (en .env, en el orquestador o"
  echo "  en el entorno del servicio)."
}

# validar_auth_secret <valor> — devuelve 0 si es apto para producción.
validar_auth_secret() {
  local valor="${1:-}"
  if [ -z "$valor" ]; then
    echo "✖ Configuración de seguridad inválida: AUTH_SECRET no está definido o está vacío."
    _ayuda_auth_secret
    return 1
  fi
  if [ "$valor" != "${valor//[[:space:]]/}" ] || [ "$valor" != "$(printf '%s' "$valor" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')" ]; then
    echo "✖ Configuración de seguridad inválida: AUTH_SECRET contiene espacios."
    _ayuda_auth_secret
    return 1
  fi
  local longitud=${#valor}
  if [ "$longitud" -lt "$AUTH_SECRET_MIN_CARACTERES" ]; then
    echo "✖ Configuración de seguridad inválida: AUTH_SECRET tiene $longitud caracteres (mínimo $AUTH_SECRET_MIN_CARACTERES ≈ 256 bits)."
    _ayuda_auth_secret
    return 1
  fi
  local prohibido
  for prohibido in "${SECRETOS_PROHIBIDOS[@]}"; do
    if [ "$valor" = "$prohibido" ]; then
      echo "✖ Configuración de seguridad inválida: AUTH_SECRET coincide con un valor publicado (plantilla/ejemplo/prueba) y no puede usarse."
      _ayuda_auth_secret
      return 1
    fi
  done
  return 0
}
