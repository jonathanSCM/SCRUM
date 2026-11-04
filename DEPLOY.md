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
