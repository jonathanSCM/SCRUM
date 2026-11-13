# Despliegue de SCRUM ProShop

SCRUM ProShop es una app independiente: no depende de ningún otro panel. Dockerfile + Coolify, Postgres en producción, SQLite en local. Repositorio: `github.com/jonathanSCM/SCRUM` (Coolify despliega desde `main`).

## Variables de entorno (Coolify)

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | La del recurso Postgres de esta app |
| `NEXTAUTH_SECRET` | Random, ej. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | El dominio público (ej. `https://scrum.proshop.lat`) |
| `RESEND_API_KEY` | Para el correo de recuperar contraseña |
| `MAIL_FROM` | Remitente, con comillas por el espacio: `"SCRUM ProShop <noreply@proshop.lat>"` |

Ya **no** se usan `SYNC_TOKEN`, `MAIN_PANEL_URL` ni `MAIN_PANEL_API_TOKEN`: se pueden borrar de Coolify.

## Actualizar desde la versión anterior (espejo del panel interno)

La versión nueva cambia el modelo de datos (tickets con clave `PRO-12`, sprints por proyecto, comentarios, adjuntos). Los cambios de esquema son **solo aditivos** y los datos viejos se convierten solos al arrancar.

1. **Hacer un backup de Postgres antes de desplegar** (Coolify → el recurso Postgres → Backups → “Backup now”, o `pg_dump`). El arranque corre `prisma db push --accept-data-loss` porque no es interactivo; el backup es la red de seguridad.
2. Actualizar las variables de entorno de la tabla de arriba (agregar `MAIL_FROM` si falta).
3. Redeploy desde `main`. Al arrancar, `docker-entrypoint.sh` aplica el esquema y corre `prisma/seed.ts`, que ejecuta la migración de datos de forma idempotente:
   - Cada proyecto recibe una clave de 2 a 5 letras (se puede ver en la cabecera del proyecto).
   - Las tareas se numeran por proyecto y su estado viejo (`CAMBIO_REALIZADO` → Hecho, el resto → Por hacer) pasa al flujo nuevo.
   - El encargado se vincula a la cuenta local cuyo nombre coincide; si no coincide, queda sin asignar.
   - Los sprints viejos (globales) se copian a cada proyecto involucrado.
   - Se crean los estados de proyecto por defecto si no existían.
4. Entrar y revisar: Proyectos → un proyecto → Backlog / Tablero.
5. Reconfigurar el webhook de Discord de cada proyecto (Proyecto → Ajustes → Integraciones): las URLs vivían en la base del panel interno y no se migran. Cada persona puede cargar su ID de Discord en **Mi perfil** para recibir menciones.

El panel interno ya no hace falta: se puede apagar en Coolify cuando quieras (no se borró nada de su repo ni de su base).

## Primera instalación (base vacía)

1. Crear un recurso Postgres en Coolify y una aplicación apuntando al repo (build pack “Dockerfile”, puerto 3000) con las variables de arriba.
2. Entrar al dominio → `/register` → crear el primer usuario (queda como Líder). Después se agregan cuentas desde **Equipo**.

## Notas

- Los adjuntos de los tickets se guardan en la base de datos (máx. 5 MB cada uno). Si algún día pesan demasiado conviene pasarlos a un bucket de objetos.
- La URL del webhook de Discord nunca se devuelve completa por la API: solo se muestra si hay una configurada y cómo termina.
- Solo un Líder puede configurar webhooks, estados de proyecto, borrar proyectos/sprints y administrar usuarios.
- **Notificaciones**: cada proyecto puede usar Discord (webhook), Telegram (token de bot + chat) y Slack (Incoming Webhook) a la vez, configurados por un Líder en Proyecto → Ajustes. Los secretos (webhook/token) nunca se devuelven completos por la API. Cada persona carga su ID/usuario en **Mi perfil** para recibir menciones.
- **PDF del sprint con Gemini → Slack** (**desactivado por defecto**: se activa con `SPRINT_PDF_ENABLED=true`; sin esa variable no se genera ni se envía nada y los botones no aparecen): al iniciar un sprint se genera un PDF (resumen, carga por persona, sugerencias, riesgos, orden recomendado y detalle de tickets) y se manda al Slack del proyecto. Variables de entorno en Coolify:
  - `GEMINI_API_KEY`: clave de Gemini. Sin ella el PDF sale igual, con sugerencias automáticas básicas. Opcional `GEMINI_MODEL` (por defecto `gemini-2.5-flash`).
  - `SLACK_BOT_TOKEN`: token del bot de Slack (permisos `files:write`, `chat:write`), agregado al canal, para **adjuntar** el PDF. En Proyecto → Ajustes → Slack se guarda el **ID del canal** (`C…`). Sin bot, se manda por el webhook un mensaje con el enlace de descarga (`/api/sprints/<id>/report`, requiere sesión). Un Incoming Webhook no puede subir archivos.
  - Desde el Backlog, cada sprint tiene los botones **PDF** (descarga) y **Enviar a Slack** (sprint activo).
- **Ceremonias**: pestaña Ceremonias en cada proyecto (Daily asíncrono, actas de Planning/Review, Retro, Ayuda y contactos). Solo agrega tablas nuevas; no necesita variables de entorno.
- **App instalable (PWA) y notificaciones del navegador**: `/manifest.webmanifest` + `public/sw.js` hacen la app instalable (Chrome/Edge/Android: icono de instalar; iPhone: Compartir → Añadir a pantalla de inicio, y ahí recién se pueden activar las notificaciones). Los avisos push llegan aunque la app esté cerrada: al que se le asigna un ticket, al que le comentan, y a todo el equipo cuando un sprint empieza o termina. Cada persona los activa en **Inicio** (aviso) o en **Mi perfil → App y notificaciones**. Requiere HTTPS y estas variables (sin ellas queda desactivado y no se muestra nada):
  - `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`: se generan una sola vez con `npx web-push generate-vapid-keys`.
  - `VAPID_SUBJECT` (opcional): `mailto:tu@correo` de contacto.
  - Agrega la tabla `PushSubscription` (aditiva).
- **Chat general**: el chat ahora es uno solo para todo el equipo (menú "Chat"), con menciones `#` (proyecto, ticket, sprint) y `@` (persona, que recibe aviso push), archivos de hasta 5 MB, emojis, enlaces y color propio por persona (Mi perfil). La pestaña "Chat" de cada proyecto muestra los mensajes que lo mencionan. Al arrancar, `prisma/seed.ts` copia una sola vez los mensajes del chat por proyecto anterior al chat general. Borrar un mensaje lo elimina por completo (las respuestas que lo citaban quedan sin la cita); la tabla `ChatDeletion` solo avisa a los demás navegadores y se limpia sola a los 3 días. Los archivos se guardan en la base de datos (`src/lib/fileStore.ts` es el único lugar a cambiar si más adelante pasan a un almacenamiento S3: MinIO en Coolify, Cloudflare R2 o Backblaze B2).
- **Modo oscuro**: botón de sol/luna en la barra superior. Si la persona nunca eligió, se sigue el tema del sistema; la elección se guarda en ese navegador. No requiere configuración.
- **Token IA (cargar proyectos con Claude)**: en **Mi perfil → Token IA** cada persona genera un token (se muestra una sola vez; en la base solo se guarda su hash) y copia un prompt listo para pegarle a su asistente. Con el token, Claude puede leer proyectos y cargar proyectos, épicas, historias, tareas, notas, sprints (sin iniciarlos) y comentarios, todo **a nombre de la persona dueña** y con sus mismos permisos; el endpoint `POST /api/ai/import` carga un proyecto completo de una vez y es idempotente. Lo que NO puede hacer: borrar, administrar personas o estados, iniciar/completar sprints ni tocar integraciones. La lista cerrada vive en `src/lib/aiAccess.ts` y la aplica `src/middleware.ts`. Solo el dueño ve su registro de uso (no aparece en los proyectos). Modelos nuevos aditivos: `ApiToken` y `ApiTokenLog`.
- **Chat en el celular**: ocupa toda la pantalla bajo la barra, con botones de iconos y Enter como salto de línea (se envía con el botón).
- **Fotos de perfil y perfil público**: en **Mi perfil** cada persona sube foto y banner (JPG/PNG/WebP/GIF, hasta 10 MB) y una frase. El servidor las lee como imagen real, las recorta al centro, las reduce y las guarda como WebP sin metadatos (SVG y archivos falsos se rechazan); viven en la base de datos (`UserImage`). La foto se ve en la barra, el chat, los tickets, notas, ceremonias y Equipo. **Equipo** (menú; reúne la lista de personas y la gestión de cuentas, y `/settings/team` redirige ahí) lista al equipo y, solo para un líder, permite crear y borrar cuentas; `/people/<id>` muestra el perfil: proyectos activos, en qué trabaja ahora y el resumen de los últimos 7 días contra los 7 anteriores (tickets terminados y creados, comentarios, notas y dailys). Solo para personas con sesión iniciada; el resumen **no incluye el chat**. Usa la librería `sharp` (ya es dependencia directa). Modelo nuevo aditivo: `UserImage`; columna `User.tagline`.
- **Multi-equipo, Fase 1 (cimientos)**: la app ahora organiza todo en **equipos** (`Workspace`) con **membresías** por persona y rol por equipo (Dueño, Admin, Miembro). En el primer arranque, `prisma/workspace-migrate.ts` (dentro del seed) crea el equipo **ProShop**, mete a todas las cuentas (la cuenta de `OWNER_EMAIL`, o si no está definida el líder más antiguo, queda como **Dueño**; los demás líderes pasan a Admin y los miembros siguen siendo Miembros) y asigna a ese equipo todos los proyectos, estados, chat y tokens existentes. Es idempotente. **Haz backup de Postgres antes de este despliegue**: se agregan tablas y columnas (todas aditivas) y se cambia la clave única de proyecto de global a por-equipo (`@@unique([workspaceId, key])`).
  - Cada ruta de la API y cada página comprueba que la persona sea miembro del equipo del recurso; si no, responde "no encontrado". La capa vive en `src/lib/session.ts` y `src/lib/workspace.ts`.
  - El rol "Líder/Miembro" ahora se calcula **por equipo** (dueño y admin cuentan como líder). Las pantallas muestran la marca de rol: `DUEÑO DE ProShop`, `ADMIN DE …`, `MIEMBRO DE …`.
  - Un token IA solo actúa dentro del equipo donde se creó.
  - Pruebas: `npm test` incluye un guardia que falla si una ruta nueva no declara su equipo, y `scripts/isolation-test.mjs` crea dos equipos reales y comprueba (78 comprobaciones) que ninguno ve ni toca nada del otro. Se corre con el servidor levantado: `DATABASE_URL=… NEXTAUTH_URL=http://localhost:3056 BASE_URL=http://localhost:3056 npx tsx scripts/isolation-test.mjs`. Ya se corrió contra PostgreSQL 16 (0 fallas); repetila contra PostgreSQL antes de abrir equipos a terceros. Después del primer arranque en producción, comprobá la migración con `psql "$DATABASE_URL" -f scripts/verify-workspaces.sql` (todo lo marcado "debe ser 0" tiene que dar 0).
  - Variable opcional: `OWNER_EMAIL` (email del dueño del equipo ProShop en la migración).

## Multi-equipo, Fase 2 (equipos usables)

- Selector de equipo en la barra superior (cookie `ws`), crear equipo (tope `MAX_OWNED_TEAMS`, por defecto 3), salir del equipo, renombrar.
- Roles por equipo (Dueño / Admin / Miembro) editables desde Equipo; el último dueño no puede bajarse ni salir.
- Invitaciones por email: enlace `/invite/<token>` de un solo uso, vence en 7 días, atado al email. Sin `RESEND_API_KEY` el enlace se muestra para copiarlo. Quien no tiene cuenta la crea al aceptar.
- Abrir un proyecto de otro de tus equipos cambia el equipo activo solo.
- Borrar un equipo NO está implementado a propósito (se hará con exportación previa).
- `scripts/isolation-test.mjs` ahora tiene 106 comprobaciones; pasa en SQLite y PostgreSQL 16.
- Nota: se usa cookie + selector en vez de URLs `/t/<slug>` (desvío respecto al plan, más simple y sin romper enlaces existentes).

## Multi-equipo, Fase 3 (integraciones por equipo)

- Menú de la cuenta > **Integraciones** (dueño/admin): clave de Gemini y token del bot de Slack **por equipo**, cifradas en la base (AES-256-GCM). La llave sale de `SECRETS_KEY` (si no está, de `NEXTAUTH_SECRET`; si cambia, hay que volver a cargar las claves).
- Cada equipo usa solo las suyas. `GEMINI_API_KEY` y `SLACK_BOT_TOKEN` del servidor siguen valiendo solo para el equipo más antiguo (o los slugs de `ENV_KEYS_WORKSPACES`, separados por coma).
- Cambia el esquema (4 columnas nuevas, nulas, en `Workspace`): `db push` las crea sin tocar datos.
- Pendiente de la fase: almacenamiento S3 con cuota y Slack por OAuth (hoy se pega el token del bot a mano).

## Chat por canales
- Cada equipo tiene `General` y `Reuniones` (se crean solos la primera vez); los líderes crean más desde el chat. Los mensajes anteriores sin canal cuentan como General. Borrar un canal pasa sus mensajes a General.
- `/reunion` se guarda en Reuniones; `/noti general`, `/urgente` y `/ayuda`, en General. Todos quedan marcados como avisos.
- Chat de proyecto: pestaña "Del proyecto" (mensajes que lo mencionan) y "Del equipo" (avisos, solo lectura).
- Esquema: tabla nueva `ChatChannel` y columnas opcionales `channelId`/`announce` en `ChatMessage` (`db push` sin tocar datos).

## Avisos agrupados (bandeja, resumen y silencio)
- Todo aviso queda en la **bandeja** de cada persona (campana y `/notifications`). Llegan **al instante** al navegador y al teléfono: menciones, mensajes directos (`/noti persona`), `/urgente`, `/ayuda`, `/reunion`, avisos del equipo, asignaciones (si llegan varias seguidas, las siguientes se juntan) e inicio de sprint. Lo demás (cambios y comentarios en tus tickets, tickets completados o nuevos, cambios del proyecto, cierre de sprint) se junta en **un resumen** (30 min por defecto; cada persona elige 15/30/60/120 min o solo bandeja, horas de silencio y categorías).
- Los canales de Discord, Telegram y Slack de cada proyecto también reciben un resumen (configurable en Ajustes del proyecto > Integraciones); inicio y cierre de sprint salen al instante.
- Los resúmenes los envía el propio servidor **cada minuto** (`src/instrumentation-node.ts`; se apaga con `DISABLE_NOTIF_TIMER=1`). Opcional, como respaldo: una tarea programada de Coolify cada minuto con `POST /api/cron/notifications` y la cabecera `Authorization: Bearer $CRON_SECRET` (define `CRON_SECRET`).
- Esquema: tablas nuevas `Notification`, `NotifPrefs` y `ProjectFeedItem`, y la columna `Project.feedDigestMinutes` (`db push` sin tocar datos). Backup de PostgreSQL antes de desplegar.

## Reuniones, calendario y extensión de Meet

- **Antes de desplegar:** respaldo de PostgreSQL. Se agregan tablas (`Meeting`, `MeetingAttendee`, `MeetingRecording`, `AudioPart`, `DraftIssue`, `ChatChannelMember`…) y columnas (`User.country`, `User.timezone`, `ApiToken.scope`, claves de OpenAI en `Workspace`).
- **Zona horaria:** cada persona elige su país en *Editar perfil*; las reuniones se guardan en UTC y se muestran en la zona de quien mira.
- **Transcripción (OpenAI):** un líder pega la clave en *Ajustes → Integraciones → OpenAI* (se guarda cifrada y es de cada equipo). Opcional: `OPENAI_API_KEY` en el servidor (vale solo para el equipo más antiguo, como Gemini), `OPENAI_TRANSCRIBE_MODEL` (por defecto `whisper-1`; también sirven `gpt-4o-transcribe` y `gpt-4o-mini-transcribe`), `OPENAI_TRANSCRIBE_LANGUAGE` (por defecto `es`). Sin clave, el audio espera en cola y se transcribe solo cuando se configure. **El audio se conserva en la reunión** (se puede escuchar y descargar; quien grabó o un líder lo borra). Opcional: `DELETE_AUDIO_AFTER_TRANSCRIBE=1` lo borra apenas se transcribe, y `AUDIO_RETENTION_DAYS=90` borra el audio (no la transcripción) de más de 90 días. Ojo con el espacio: unos 0,2 MB por minuto de audio (≈11 MB por hora de reunión) en la base de datos. El costo de OpenAI es por minuto de audio.
- **Cola de transcripción:** la procesa el temporizador del servidor cada minuto (y al llegar cada parte). Con `DISABLE_NOTIF_TIMER=1` queda solo `POST /api/cron/notifications`.
- **Extensión de Chrome:** el código está en `extensions/meet/`. Para publicar una versión nueva: subir `version` en `extensions/meet/manifest.json`, correr `bash scripts/pack-extension.sh` (genera `public/downloads/scrum-proshop-meet-extension.zip`, que se descarga desde `/extension-authorize`) y subir ese zip a la Chrome Web Store (ficha lista en `extensions/meet/STORE-LISTING.md`). Cada persona conecta la extensión en `/extension-authorize` (token propio, solo sirve en `/api/extension/*`).
- **Páginas públicas:** `/` (landing), `/privacy` y `/terms`. Datos de contacto: `NEXT_PUBLIC_CONTACT_EMAIL` y `NEXT_PUBLIC_COMPANY_NAME` (opcionales; se leen al compilar).
- **Borrar el caché de todos los dispositivos:** subir `CACHE_VERSION` y reiniciar (ver arriba).

## Daily general, estado "Bloqueadas" y actividad del equipo

- **Respaldo antes de desplegar:** cambia el esquema de `StandupEntry` (columnas nuevas, `projectId` ahora opcional). Todo es aditivo.
- **Daily general:** pasó de ser por proyecto a ser uno por persona y día en el equipo (`/daily`). Al arrancar, `prisma/seed.ts` junta los dailys viejos de varios proyectos en uno solo (cada campo con el nombre del proyecto si había más de uno). No borra nada y es idempotente.
- **Nuevo estado de ticket `BLOCKED` ("Bloqueadas")** entre En progreso y En revisión. Es un texto en `Task.status`: no hay migración.
- **Actividad del equipo (`/activity`):** solo la ve el dueño (OWNER). Sale del historial de cambios y de los dailys; no mira el chat.
