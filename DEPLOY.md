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
  - Pruebas: `npm test` incluye un guardia que falla si una ruta nueva no declara su equipo, y `scripts/isolation-test.mjs` crea dos equipos reales y comprueba (78 comprobaciones) que ninguno ve ni toca nada del otro. Se corre con el servidor levantado: `DATABASE_URL=… NEXTAUTH_URL=http://localhost:3056 BASE_URL=http://localhost:3056 npx tsx scripts/isolation-test.mjs`. **Corrélo también contra PostgreSQL antes de abrir equipos a terceros.**
  - Variable opcional: `OWNER_EMAIL` (email del dueño del equipo ProShop en la migración).
