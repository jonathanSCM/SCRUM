# Plan de edición del Scrum (post-reunión con Mariana)

Fuentes: transcripción de la reunión + notas de Jonathan + revisión del repo
(Next 15, Prisma/SQLite, NextAuth, roles `LEAD` / `MEMBER`).

## 1. Dónde estamos hoy (según el código)

Ya existe, y en la reunión se habló como si no existiera:

| Pedido en la reunión | Estado real |
|---|---|
| "Chat dentro de cada card" | **Ya está**: comentarios por ticket (`Comment`, pestaña Comentarios en `IssueDrawer`). Falta @menciones y notificación. |
| "Log de quién movió una tarea" | **Ya se guarda** (`HistoryEntry` + pestaña Actividad por proyecto y por ticket). Solo falta mostrarlo mejor. |
| Sprints por proyecto | **Ya es así** (`Sprint.projectId`). Decisión de la reunión: seguir así en el MVP. |
| Épica → historia | Existe `epicId` (un solo nivel). **No** existe historia → tarea. |
| Tickets nacen en backlog | Verificar `createIssueSchema`/`CreateIssueModal`: que `sprintId` sea vacío por defecto. |
| Documentos / brief del proyecto | `Document` está sin uso; hoy solo hay adjuntos y descripción. |

No existe todavía: ceremonias, daily, notas públicas, Definition of Ready, exportar, restricción para sacar tareas de un sprint activo, jerarquía completa épica > historia > tarea, checklist en tarjeta.

## 2. Qué vamos a añadir (priorizado)

### Fase 1 — Reglas del sprint (para la reunión de mañana, ~1 día)
Pequeño, de alto valor y casi sin cambios de esquema.

1. **Proteger sprints activos**: sacar un ticket de un sprint ACTIVE hacia el backlog (por drag, edición individual o `bulk`) solo lo puede hacer un `LEAD`; el resto recibe error claro. Queda en `HistoryEntry`. Tocar: `moveIssue` / `bulkUpdateIssues` / `updateIssue` en `src/lib/issues.ts` + test en `scrum.test.ts`.
2. **Tickets nacen en backlog** y se asignan al sprint en el planning (confirmar el default).
3. **Exportar tareas a CSV** (por proyecto, con filtros: sprint/estado/asignado): `GET /api/projects/[id]/export` + botón en Backlog.
4. **Mostrar en la tarjeta quién lo movió y cuándo** (ya hay datos): línea "Movido por X" en Actividad.

### Fase 2 — Definition of Ready + pestaña Planning
1. Nuevo campo aditivo en `Task`: `readyChecklist` (JSON) y `ready` (bool). DoR configurable por proyecto en Ajustes (lista de ítems: acceso a BD, contacto del cliente, brief, diseño, criterios de aceptación…).
2. **No se puede iniciar un sprint** si algún ticket no cumple el DoR: ampliar `validateStart` con la lista de tickets incompletos y mostrar el aviso en `SprintModals`. Un LEAD puede forzar con confirmación (queda en el log).
3. Nueva pestaña **Planning** en `ProjectTabs`: backlog priorizado a un lado, sprint al otro, capacidad (puntos), objetivo, y badge "Ready / Falta info" por ticket.
4. Vista **Planning global** (opcional, post-MVP): la capacidad del equipo es una sola entre proyectos, como planteó Mariana. Empezamos por proyecto y evaluamos después.

### Fase 3 — Notas públicas y chat del equipo
1. Modelo `Note` (título, markdown, proyecto, autor, tipo: `BRIEF | REUNION | GENERAL`, `pinned`) + pestaña **Notas** por proyecto, visible para todo el equipo.
2. Desde una nota de reunión: **"Convertir en ticket"** por viñeta (flujo de Mariana: sacar los puntos de la reunión y cargarlos como tareas).
3. El brief que hoy llega como documento se escribe como nota/épica y se enlaza a los tickets.
4. **Chat/canal por proyecto** (`ProjectMessage`) para las conversaciones del equipo ("esto puede ser nuestro Teams") y @menciones en comentarios reutilizando `discordUserId` / `discord.ts`.

### Fase 4 — Ceremonias
Pestaña **Ceremonias** por proyecto, ligada al sprint:
1. **Daily**: modelo `StandupEntry` (sprint, usuario, fecha, ayer / hoy / bloqueos / "en qué me ayudas"). Vista del día con todos juntos. Recordatorio por Discord.
2. **Planning**: acta + objetivo (`goal` ya existe) + DoR revisado.
3. **Review**: al completar el sprint, resumen de lo entregado (ya hay reporte del sprint) + notas del PO.
4. **Retro**: tres columnas (qué funcionó / qué mejorar / acuerdos); los acuerdos pasan a ticket.
5. Sección "Ayuda / contactos" (quién sabe de qué por proyecto) en Ajustes del proyecto.

### Fase 5 — Estructura y comodidad tipo Trello
1. Jerarquía **épica > historia > tarea** (`parentId` aditivo; `epicId` se mantiene) con selector en el ticket y progreso anidado.
2. **Checklist** dentro de la tarjeta y vista simple de vencimientos (calendario).
3. Vista **"Qué le toca a quién"**: ampliar *Mi trabajo* con filtro por persona/producto para el daily.
4. Roles: etiqueta de Product Owner / Scrum Master por proyecto (hoy solo `LEAD`/`MEMBER`). Decidir si hace falta.
5. Pasada de **diseño** (Mariana lo pidió): densidad, jerarquía visual, pestañas.

## 3. Cómo trabajar

- **Dogfooding**: este mismo Scrum gestiona su propio desarrollo (proyecto "SCRUM"), sprints de 1 semana mientras es MVP.
- Cada fase = 1 sprint corto: planning el lunes (con DoR), daily de 10–15 min (o asíncrono en la plataforma), review el viernes con Mariana (PO), retro de 15 min.
- Revisión con Mariana **mañana** con la Fase 1 hecha y la Fase 2 en demo parcial; luego su pasada de diseño.
- Una sola reunión de pre-planning para todos los proyectos (equipo chico), no una por proyecto.
- Rama por fase, PRs pequeños, `npm test` + `npm run lint` antes de cada merge.

## 4. Restricciones técnicas

- **Esquema solo aditivo**: producción corre `prisma db push --accept-data-loss` en cada arranque (ver `schema.prisma`). Nada de borrar/renombrar columnas; columnas nuevas nullable o con default.
- Reglas en `src/lib/scrum/*` (puras, con tests); rutas API delgadas.
- Todo permiso se valida en el servidor (`apiUser({ lead: true })`), no solo ocultando botones.

## 5. Decisiones tomadas (post-plan)

- **Definition of Ready** = lista de información que tiene que estar disponible antes de empezar un sprint (p. ej. estructura de datos del cliente, accesos, brief). Se define por proyecto; sin ella no se inicia el sprint.
- **No hace falta decidir roles por proyecto**: se usa el rol `LEAD` actual para las acciones restringidas.
- **Duración del sprint configurable** (ya existe: 1, 2… semanas o personalizada al iniciar).
- **Daily**: opcional y asíncrono dentro de la plataforma.
- **Notificaciones**: Discord y Telegram; funciona el que esté configurado en el proyecto.
- **Exportar**: a Excel (.xlsx), con "Mis tareas" por proyecto. Sin PDF por ahora.
- Lo de la landing y la entrega de I-PASS queda fuera del plan.

## 6. Estado

- [x] Fase 1: sprint activo protegido (solo LEAD saca tickets), exportar a Excel y "Mis tareas". Los tickets ya nacen en el backlog salvo que se cree desde el tablero (sprint activo) o desde un sprint.
- [ ] Fase 2: Definition of Ready + Planning
- [ ] Notificaciones por Telegram
- [ ] Fases 3–5

## 7. Preguntas abiertas (resueltas arriba salvo)

1. ¿Qué ítems forman la Definition of Ready? (propuesta: brief claro, criterios de aceptación, accesos/datos, contacto del cliente, estimación).
2. ¿Quién es LEAD/PO por proyecto? ¿Puede un LEAD forzar un sprint sin DoR completo?
3. ¿Sprints de 1 o 2 semanas? (Mariana habló de 2).
4. ¿El daily es síncrono con registro opcional, o 100 % asíncrono en la plataforma?
5. ¿Notificaciones por Discord, Telegram o ambos? (la reunión lo dejó abierto).
6. ¿Exportar solo CSV o también PDF del reporte de sprint?

## 8. Fuera del Scrum (anotado de la reunión)

- Panel de administración de la landing (César): agregar proyectos requiere redeploy; máximo 8 proyectos visibles.
- Entrega formal de I-PASS/Impacta: manuales, código del panel, APK y documento de credenciales (César, vía Drive).
- Reunión presencial el viernes.
- Cargar al Scrum los proyectos faltantes (Impacta, I-PASS…).
