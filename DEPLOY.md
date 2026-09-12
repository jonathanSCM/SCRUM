# Despliegue de SCRUM ProShop

Mismo patrón que el panel interno (`D:\Trabajo\Organizacion`): Dockerfile + Coolify, Postgres en producción, SQLite en local.

## 1. Subir el repo

Esta app todavía no tiene su propio repositorio de GitHub. Creá uno nuevo (ej. `jonathanSCM/OrganizacionJefe`) y subí esta carpeta ahí — igual que se hizo con el panel interno.

## 2. Crear el recurso Postgres en Coolify

Un recurso nuevo, separado del que usa el panel interno (puede vivir en el mismo servidor sin problema). Copiá su `DATABASE_URL` interna.

## 3. Crear la aplicación en Coolify

Apuntá al repo de GitHub nuevo, build pack "Dockerfile", puerto 3000.

## 4. Variables de entorno

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | La del recurso Postgres del paso 2 |
| `NEXTAUTH_SECRET` | Random, ej. `openssl rand -base64 32` (distinto al del panel interno) |
| `NEXTAUTH_URL` | El dominio público de esta app (ej. `https://jefe.tudominio.com`) |
| `SYNC_TOKEN` | Un secreto random elegido por vos (ej. `openssl rand -base64 32`) — el panel interno tiene que mandar este mismo valor en `BOSS_PANEL_SYNC_TOKEN` para poder sincronizar |

## 5. Conectar el panel interno

En el panel interno (Coolify → esa otra app → variables de entorno), agregá:
- `BOSS_PANEL_URL` = la URL pública de esta app (sin barra al final, ej. `https://jefe.tudominio.com`)
- `BOSS_PANEL_SYNC_TOKEN` = el mismo valor que pusiste acá en `SYNC_TOKEN`

Sin estas dos variables configuradas del lado del panel interno, la sincronización simplemente no hace nada (no rompe el panel interno, solo no manda datos acá). Esto cubre la sincronización de una sola vía (proyectos, tareas, estados, documentos, historial).

## 6. Habilitar la edición de dos vías (mover proyectos, editar info desde acá)

Para que el jefe pueda mover proyectos de estado o editar la info del proyecto desde esta app, y que eso quede real también en el panel interno, hace falta un token personal del panel interno:

1. En el panel interno, con sesión de un Líder: `Configuración → Token IA` → generar un token personal (ya existe esa pantalla, se usó originalmente para la IA).
2. En esta app (Coolify → variables de entorno), agregá:
   - `MAIN_PANEL_URL` = la URL pública del panel interno (ej. `https://panel.tudominio.com`)
   - `MAIN_PANEL_API_TOKEN` = el token generado en el paso 1
3. Redeploy de esta app para que tome las variables nuevas.

Sin estas dos variables, mover un proyecto o editar su info desde acá muestra un error claro ("Falta configurar...") y no aplica el cambio ni acá ni en el panel interno — no hay riesgo de que quede una edición fantasma.

## 7. Primer usuario y primera carga de datos

1. Deploy de ambas apps.
2. Entrá al dominio público de esta app → caés en `/register` → creás el primer admin (rol Líder).
3. Desde el panel interno, con sesión de un Líder, llamá una vez a `POST /api/admin/backfill-boss-sync` (por ejemplo desde la consola del navegador logueado, o con `curl` pasando la cookie de sesión) para que los proyectos y tareas que ya existían aparezcan acá. De ahí en más, todo lo nuevo llega solo.

## Notas

- Esta app no tiene IA, notificaciones, Discord, comentarios ni checklist — es a propósito, ver el plan original.
- Los sprints y la asignación de tareas a sprints viven **solo acá** — el panel interno nunca se entera de que existen.
- Igual que el panel interno, el `prisma db push` del arranque corre con `--accept-data-loss` porque el arranque es no interactivo (ver la nota equivalente en el `DEPLOY.md` del panel interno para el detalle de qué implica).
