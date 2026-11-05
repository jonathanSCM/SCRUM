# Plan: SCRUM ProShop multi-equipo (para poder venderlo)

Estado: **solo investigación y planificación. No se ha construido nada.**
Fecha de la auditoría: 2026-11-05, sobre `main` en `448d6d8`.

## 1. Qué se quiere lograr

- Una persona crea su cuenta y **crea su propio equipo**.
- En su equipo mete gente con **distintos roles**.
- Una misma cuenta puede estar en **varios equipos** y ser **invitada** a otros.
- Los datos de un equipo **nunca** se ven desde otro.
- Se puede **vender**: planes, límites y cobro.
- El equipo actual de ProShop sigue funcionando igual, como primer equipo.

## 2. Cómo está hoy (hallazgos de la auditoría)

La app es de **un solo equipo por diseño**: todas las cuentas ven todo.

| Hallazgo | Dato | Por qué importa |
|---|---|---|
| Código a revisar | 82 archivos con 267 llamadas a Prisma, 63 rutas API, 25 páginas | Cada una tiene que quedar "limitada al equipo" |
| `Project` no tiene dueño | No hay equipo ni membresía; cualquier cuenta con sesión abre cualquier proyecto por su id (`getProjectOrNotFound`) | Es el riesgo n.º 1: sin cambios, un equipo vería los proyectos de otro |
| Listas de "todas las personas" | 22 consultas `prisma.user.findMany` sin filtro (miembros, menciones, responsables, chat, Equipo, token IA, importación…) | Mostrarían personas de otros equipos |
| Rol global | `User.role` (LEAD o MEMBER) usado en 43 lugares | Un rol por cuenta no sirve: se necesita **un rol por equipo** |
| Claves únicas globales | `Project.key` es único en toda la base; `findIssueByKey("SAI-2")` busca en toda la base | Dos equipos querrían el mismo `SAI`; hay que hacerla única por equipo |
| Estados de proyecto | `StatusOption` es global (Pendiente, En progreso…) | Cada equipo debe tener los suyos |
| Chat | `ChatMessage` es global | Cada equipo necesita su chat |
| Token IA | Un token por persona, con todo su acceso | Debe ser por persona **y** equipo |
| Configuración por variables de entorno | `SLACK_BOT_TOKEN`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `VAPID_*` | Slack y Gemini deben poder ser por equipo; Resend y VAPID pueden seguir siendo de la plataforma |
| Alta de cuentas | Solo la primera cuenta (`/register`) y un líder que crea cuentas con contraseña temporal | Falta registro abierto, invitaciones por email y verificación de email |
| Base de datos de prueba | SQLite en local, PostgreSQL en producción | Las pruebas de aislamiento deben correr también sobre Postgres |

Lo que ya está bien encaminado y se reutiliza:
- 13 de los 24 modelos cuelgan de un `projectId`, así que **heredan** el equipo a través del proyecto.
- Discord, Telegram y Slack ya se configuran **por proyecto**.
- Los archivos ya pasan por un único punto (`src/lib/fileStore.ts`), listo para cambiar a almacenamiento S3.
- Resend ya envía correos; el token IA ya tiene una lista cerrada de acciones; el PDF con Gemini ya se activa por variable.

## 3. Decisiones de diseño (con recomendación)

### 3.1 Modelo de datos
- **`Workspace`** (el equipo): nombre, `slug`, dueño, plan, creado.
- **`Membership`**: (persona, equipo, rol). Una persona puede tener muchas.
- **`Invitation`**: email, equipo, rol, token (hasheado), vence, estado.
- **`User`** pasa a ser solo la **identidad** (nombre, email, contraseña, foto, banner, frase). El rol sale de `User`.
- El equipo se cuelga en `Project`, `StatusOption`, `ChatMessage` y `ApiToken`. El resto hereda por el proyecto.
- `Project.key` pasa a ser único **por equipo**.

### 3.2 Roles por equipo
| Rol | Puede |
|---|---|
| **Dueño** | Todo, más facturación, borrar el equipo y transferirlo. Siempre hay uno. |
| **Admin** | Lo que hoy hace un "Líder": integraciones, estados, Definition of Ready, invitar y quitar miembros. |
| **Miembro** | Trabajar con proyectos, tickets, notas y chat. |
| **Invitado** *(fase posterior)* | Ver o comentar solo proyectos concretos (por ejemplo un cliente). |

Los actuales LEAD pasan a Admin, y tú a Dueño.

### 3.3 Aislamiento: base compartida, no una base por equipo
Una sola base con el equipo en cada tabla raíz. Una base por equipo cuesta mucho de operar. Defensa en capas:
1. **Una única puerta de entrada**: `requireWorkspace()` / `requireProjectAccess()`, que comprueba la membresía y devuelve **404** (no 403) si el recurso es de otro equipo, para no revelar que existe.
2. **Prisma "con alcance"**: un cliente de Prisma que añade solo el filtro de equipo en cada consulta, para que olvidar un `where` no abra una fuga.
3. **Pruebas de aislamiento automáticas**: se crean dos equipos y se recorren todas las rutas pidiendo datos del otro. Si alguna devuelve algo, falla la compilación.
4. **Opcional, más adelante**: RLS de PostgreSQL como red de seguridad final.

### 3.4 Dirección web
Recomendado: `/t/<slug>/…` (por ejemplo `/t/proshop/projects`). Es más simple y no requiere configuración de dominio. **Subdominios por equipo** (`proshop.tuapp.com`) quedan como fase posterior.
El **equipo activo viaja en la dirección**, no en la sesión, para que dos pestañas con equipos distintos no se pisen.

### 3.5 Registro, invitaciones y cambio de equipo
- `/register` abierto: crea la cuenta y pide crear el primer equipo (onboarding de 1 paso).
- **Verificación de email** y límite de intentos para evitar abuso.
- Invitar por **email con enlace** (vence en 7 días) y también por **enlace compartible**. Quien ya tiene cuenta lo acepta con un clic y queda en ambos equipos.
- **Selector de equipo** en la barra superior; se recuerda el último usado. Crear equipo desde ahí.
- Se retira la contraseña temporal como método principal: queda solo como opción de admin.

### 3.6 Qué pasa con cada cosa al ser multi-equipo
| Elemento | Decisión |
|---|---|
| Foto, banner y frase | Globales de la persona |
| Resumen semanal del perfil | Solo con datos del equipo que se está viendo; nunca mezcla equipos |
| Color del chat | Global |
| Chat | Uno por equipo |
| Equipo (lista de personas) | Solo miembros del equipo actual |
| Token IA | Por persona y equipo; lista cerrada de acciones igual; revocable por el dueño del equipo |
| Slack | App de Slack con "Añadir a Slack" (OAuth): cada equipo conecta el suyo; adiós al `SLACK_BOT_TOKEN` único |
| Discord y Telegram | Siguen por proyecto |
| Gemini | Clave de la plataforma con cuota según plan, o clave propia del equipo (a decidir) |
| Notificaciones del navegador | Siguen por dispositivo; el aviso indica el equipo |
| Archivos | Cuota por equipo; **pasar a almacenamiento S3 antes de vender** |

## 4. Para venderlo

### 4.1 Planes y límites (propuesta inicial, a ajustar)
| | Gratis | Pro | Business |
|---|---|---|---|
| Miembros | hasta 5 | por asiento | por asiento |
| Proyectos | 3 | ilimitados | ilimitados |
| Almacenamiento | 1 GB | 20 GB | 100 GB |
| PDF y sugerencias con IA | no | sí, con cuota | cuota mayor |
| Token IA e importación | sí | sí | sí |
| Soporte | — | email | prioritario |

Los límites se aplican **en el servidor**, no solo ocultando botones, con mensajes claros y un botón de mejorar plan.

### 4.2 Cobro
- Una pasarela con facturación recurrente (por ejemplo Stripe, o un "merchant of record" como Paddle o Lemon Squeezy si hay problemas fiscales). **Hay que verificar cuál está disponible y conviene en tu país.**
- Flujo: página de facturación → Checkout → webhook que actualiza `Subscription` → el servidor lee el plan desde esa tabla.
- Prueba gratis, cobro por asiento, cambio de plan, cancelación y recibos desde el portal del cliente.
- Estados de impago con margen (gracia) antes de limitar.

### 4.3 Lo que un cliente espera de un producto de pago
- Términos, política de privacidad y borrado de datos al cancelar.
- **Exportar** todo el equipo (ya hay Excel de tickets; falta exportación completa).
- Verificación de email, recuperación de contraseña (ya existe) y, más adelante, 2FA.
- **Panel interno de superadministrador** para ver equipos, suspender abusos y dar soporte.
- Backups probados y monitorización de errores.

## 5. Plan por fases

El orden importa: **primero seguridad de aislamiento, después lo visible, al final el cobro.**

### Fase 1. Cimientos (sin cambios visibles)
- Tablas `Workspace`, `Membership`, `Invitation`.
- **Migración de los datos actuales**: se crea el equipo "ProShop", todas las cuentas pasan a ser miembros (LEAD → Admin, tú → Dueño) y todo lo existente se asigna a ese equipo. Idempotente y con backup.
- Capa de acceso única y Prisma con alcance; **las 63 rutas y 25 páginas** pasan a usarla.
- `Project.key` único por equipo; `findIssueByKey` y la búsqueda con alcance.
- **Suite de pruebas de aislamiento** (dos equipos, todas las rutas).
- Resultado: la app se ve y funciona igual con un solo equipo, pero ya está blindada.
- Tamaño: **grande** (es el trabajo más delicado).

### Fase 2. Multi-equipo usable
- Selector de equipo y crear equipo.
- Direcciones `/t/<slug>/…` y redirecciones desde las actuales.
- Roles por equipo: gestión de miembros, cambiar rol, quitar, transferir dueño.
- Invitaciones por email y enlace; aceptar con cuenta nueva o existente.
- Registro abierto con verificación de email y límites anti-abuso.
- Tamaño: **grande**.

### Fase 3. Datos y integraciones por equipo
- Estados de proyecto y chat por equipo (con migración).
- Token IA por persona y equipo.
- Slack con OAuth por equipo; claves de Gemini por equipo o cuota.
- Notificaciones indicando el equipo; perfil que no mezcla equipos.
- Almacenamiento S3 con cuota por equipo.
- Tamaño: **mediano**.

### Fase 4. Monetización
- `Plan`, `Subscription` y los límites aplicados en el servidor.
- Página de facturación, Checkout, webhooks, portal del cliente, prueba gratis.
- Medición de uso (miembros, proyectos, almacenamiento, IA).
- Tamaño: **mediano**.

### Fase 5. Operación y confianza
- Panel de superadministrador, auditoría de acciones sensibles, límites de peticiones.
- 2FA opcional, términos y privacidad, borrado y exportación completa.
- Monitorización, copias de seguridad probadas, correos transaccionales con dominio verificado.
- Tamaño: **mediano**.

### Fase 6. Opcional
Subdominios por equipo, invitados con acceso por proyecto, SSO, dominio propio, API pública con claves por equipo.

**Orden de entrega recomendado:** 1 → 2 → 3 → 4 → 5. Después de la Fase 2 ya se puede **probar con clientes reales** sin cobrar; después de la Fase 4 se puede **vender**.
Duración orientativa si se trabaja de forma continua: de **6 a 9 semanas** hasta poder vender, con la Fase 1 como el tramo más largo. Es una estimación, no un compromiso.

## 6. Riesgos y cómo los cubrimos

| Riesgo | Cobertura |
|---|---|
| **Fuga de datos entre equipos** (el peor) | Una sola puerta de acceso, Prisma con alcance, 404 en cruces, pruebas automáticas por ruta, revisión de cada consulta, RLS más adelante |
| **Romper producción al migrar** | Backup obligatorio, migración idempotente y probada sobre una copia de producción, despliegue con la Fase 1 sin cambios visibles |
| Archivos en la base de datos crecen sin control | S3 y cuotas antes de abrir el registro |
| Abuso (spam, cuentas falsas, relleno de almacenamiento) | Verificación de email, límites de peticiones, cuotas, panel de suspensión |
| Coste de Gemini | Cuota por plan o clave propia del equipo |
| Pruebas solo en SQLite | Suite de aislamiento corriendo también contra PostgreSQL |
| Un solo servidor (Coolify) | Aceptable al principio; documentar plan de escalado y backups externos |
| Email no llega (invitaciones) | Dominio verificado en Resend, reenvío manual, enlace compartible como alternativa |
| Cumplimiento (datos personales) | Términos, privacidad, borrado y exportación; confirmar requisitos según los países de los clientes |

## 7. Qué NO cambia
Tableros, sprints, Definition of Ready, ceremonias, notas, chat, token IA, perfil público y modo oscuro siguen igual: solo pasan a vivir **dentro de un equipo**.

## 8. Decisiones tomadas (2026-11-05)

| Tema | Decisión |
|---|---|
| Registro | **Solo por invitación** al inicio. Sin registro abierto. |
| Cobro | Se define más adelante; lo probable son ventajas por plan o cuenta gratis. **No se construye todavía.** |
| Pasarela de pago | En el futuro, después de definir el cobro. |
| IA (Gemini) | **Una clave por equipo**, configurable desde un panel del equipo (Fase 3). |
| Nombre y dominio | Se mantiene SCRUM ProShop en `https://scrum.proshop.lat/`. |
| Equipo actual | Sigue como primer equipo ("ProShop"), con el dueño actual como **Dueño**. |
| Marca de rol | En el perfil y en la lista del equipo se muestra el rol por equipo: **DUEÑO DE ProShop**, **ADMIN DE …**, **MIEMBRO DE …**. Solo se muestran los equipos que comparten quien mira y la persona. |
| Invitados (clientes) | Fase posterior. |

Consecuencias en el plan:
- La Fase 4 (cobro) queda en pausa hasta definir el modelo; las Fases 1, 2, 3 y 5 siguen.
- Sin registro abierto, la verificación de email y los límites anti-abuso del alta bajan de prioridad (siguen siendo necesarios para las invitaciones).
- Crear equipos nuevos: lo puede hacer una cuenta existente, con un tope configurable de equipos propios (`MAX_OWNED_TEAMS`, por defecto 3).

## 9. Primer paso propuesto
Empezar por la **Fase 1** en una rama aparte, con la migración probada sobre una copia de los datos y las pruebas de aislamiento corriendo antes de unir nada a `main`. Nada de la Fase 2 en adelante se construye hasta que la Fase 1 pase todas las pruebas.
