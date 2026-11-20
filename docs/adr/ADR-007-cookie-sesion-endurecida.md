> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

---

## ADR-007 — Endurecimiento de la cookie de sesión: `SameSite=Strict`, `Secure` condicional y expiración de 24 h

**Estado:** Aceptado · **Fecha:** v1.5.0 (Fase 4)

### Contexto

La autenticación vive en una única cookie (`cig_manufacturing_sesion`) que
transporta un JWT HS256 (`jose`) y se emite/elimina desde dos funciones
centralizadas de `src/modulos/autenticacion/servicios/auth.ts`
(`conCookieSesion`/`sinCookieSesion`), invocadas por tres rutas que crean
sesión (`login`, `registro`, `recuperacion/confirmar`) y una que la cierra
(`logout`). No existe `middleware.ts` (ADR-004) ni ninguna otra cookie de
sesión en el sistema (la única otra cookie es `sidebar_state`, de estado de
UI emitida por el componente shadcn, sin valor de seguridad).

Auditoría empírica del estado previo: `HttpOnly` ✓, `Path=/` ✓ y `Secure`
condicional ✓ (`NODE_ENV=production` Y `COOKIE_INSEGURA_HTTP !== "1"`) ya se
cumplían; quedaban dos huecos — `SameSite=Lax` (la cookie SÍ viajaba en
navegación cruzada de primer nivel) y una expiración de **7 días** sin token
de refresco (ventana de exposición de una cookie expropiada excesiva).

### Decisión

1. **`SameSite=Strict`** en emisión Y eliminación de la cookie. La cookie no
   se envía en ninguna petición iniciada desde otro sitio: neutraliza el
   CSRF en origen sin depender de tokens anti-CSRF adicionales.
2. **`Secure` condicional intacto** (`cookieSegura()`): `true` solo con
   `NODE_ENV=production` Y `COOKIE_INSEGURA_HTTP !== "1"`. El escape para LAN
   sin TLS queda documentado y avisa por consola en cada arranque; nunca es
   silencioso.
3. **Expiración de 24 h** (`DURACION_SESION_SEG = 60 * 60 * 24`), aplicada a
   la vez al `exp` del JWT y al `maxAge` de la cookie: caducan juntos. No se
   introduce token de refresco: cada petición autenticada ya recarga el
   usuario desde la BD (`obtenerSesion`), de modo que desactivar/eliminar el
   usuario revoca la sesión al instante — la expiración es el límite de la
   ventana de exposición de una cookie expropiada, no el mecanismo de
   revocación.

### Justificación

- **`Strict` vs `Lax`**: `Lax` permite que un enlace externo (correo, chat,
  ERP ajeno) llegue YA autenticado a la app; `Strict` exige que la primera
   petición sea misma-sitio. Para una aplicación interna de manufactura a la
  que se entra tecleando la URL (no siguiendo enlaces de terceros), el coste
  de UX es marginal y la superficie CSRF queda cerrada en el propio atributo
  (defensa en el navegador, no en código de aplicación).
- **24 h vs 7 días**: reduce la ventana de una cookie robada de 168 h a 24 h
  (−85,7 %). El coste (re-autenticación diaria) es aceptable en una fábrica
  con turnos: el login es rápido y está protegido contra fuerza bruta
  (5 fallos/IP+cuenta y 20/IP en 15 min, con `Retry-After`).
- **Sin token de refresco**: añadirlo duplicaría la superficie (rotación,
  revocación del refresh, almacenamiento) para ganar solo comodidad. La
  recarga por BD en cada petición ya ofrece la revocación inmediata que un
  refresh token suele aportar.
- **Atributos en la eliminación**: `sinCookieSesion` usa los mismos atributos
  que la emisión — el borrado no depende de diferencias de atributos para
  emparejar la cookie, y la política queda declarada en un solo lugar por
  función.

### Alternativas descartadas

- **Tokens anti-CSRF sincronizados**: exigirían tocar cada formulario y cada
  ruta API; `SameSite=Strict` logra la protección CSRF en el atributo de la
  cookie, sin estado adicional.
- **`SameSite=None; Secure`**: sería necesario solo para casos cruzados
  (SSO de terceros, iframes); la app no tiene ninguno.
- **Sesión deslizante (renovar `exp` en cada petición)**: alarga
  indefinidamente la vida de una cookie expropiada mientras el atacante la
  use; contradice el objetivo del endurecimiento.
- **Token de refresco de 7 días**: ver Justificación — superficie nueva sin
  beneficio de seguridad real en esta arquitectura.

### Consecuencias

- Los usuarios deben iniciar sesión una vez al día (o tras 24 h de emisión
  de la cookie). Las sesiones activas al desplegar el cambio caducan antes:
  el `exp` de los tokens de 7 días ya emitidos sigue siendo válido hasta su
  vencimiento, pero la cookie se re-emite con `maxAge` de 24 h en el
  siguiente login.
- La navegación desde un enlace externo llega como NO autenticada (el
  usuario ve el login y entra); dentro del sitio todo funciona igual.
- Las verificaciones E2E (Python/urllib con cookie jar) no se ven afectadas:
  `urllib` no aplica la política SameSite, que es del navegador.
- `scripts/prueba-humo-fase4.ts` verifica empíricamente la matriz completa
  de atributos tras un login real (producción con/sin `COOKIE_INSEGURA_HTTP`,
  desarrollo, logout) y la coherencia `exp − iat = 86400`.

---
