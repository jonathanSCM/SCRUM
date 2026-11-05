// Instrucciones que la persona le pega a su asistente (Claude) junto con el token.
export function buildAiAccessPrompt(baseUrl: string, token: string, userName: string): string {
  return `Tenés acceso a la API de SCRUM ProShop para leer y cargar proyectos en nombre de ${userName}. Todo lo que hagas queda registrado a nombre de ${userName}.

URL base: ${baseUrl}
Token (header en TODAS las llamadas): Authorization: Bearer ${token}
En POST y PATCH mandá también: Content-Type: application/json
Todas las respuestas son JSON. Si una llamada devuelve 401, el token se revocó o se regeneró: avisame y no sigas reintentando. Un 403 significa que esa acción no está permitida para este token: no insistas.

JERARQUÍA: una épica agrupa historias; una historia agrupa tareas y bugs. Los tickets nuevos nacen en el backlog (no en un sprint).

LEER
- GET ${baseUrl}/api/ai/projects            → lista de proyectos (id, clave, nombre, estado, cantidad de tickets)
- GET ${baseUrl}/api/ai/projects/{projectId} → detalle: descripción, sprints, épicas, historias y tickets con estado/responsable/jerarquía, Definition of Ready y estados disponibles
- GET ${baseUrl}/api/ai/users               → personas del equipo (id, nombre, email) para asignar responsables

CARGAR UN PROYECTO COMPLETO DE UNA VEZ (lo más cómodo)
POST ${baseUrl}/api/ai/import
{
  "project": { "name": "Nombre", "description": "…", "stack": ["Next.js"], "deployUrl": "https://…", "readyItems": ["Estructura de datos del cliente", "Accesos"] },
  "epics": [
    { "title": "Épica", "description": "…",
      "stories": [
        { "title": "Historia", "description": "…", "priority": "ALTA", "storyPoints": 5, "assignee": "nombre o email",
          "tasks": [ { "title": "Tarea", "type": "TASK", "storyPoints": 2, "checklist": ["paso 1", "paso 2"] } ] }
      ] }
  ],
  "tasks": [ { "title": "Tarea suelta, sin épica", "type": "BUG" } ],
  "notes": [ { "title": "Brief del cliente", "body": "…", "kind": "BRIEF" } ]
}
- Para un proyecto que ya existe usá "project": { "id": "…" } (o el mismo nombre). Es idempotente: lo que ya existe con el mismo tipo y título se omite, así que podés repetir la llamada sin duplicar.
- priority: URGENTE | ALTA | MEDIA | BAJA. type: TASK | BUG. kind de nota: BRIEF | REUNION | PLANNING | REVIEW | GENERAL.
- Máximo 300 tickets por llamada. La respuesta lista lo creado, lo omitido y avisos (por ejemplo, un responsable que no se encontró).

CAMBIOS PUNTUALES
- POST  ${baseUrl}/api/projects                       { "name": "…", "description": "…" }   crear proyecto
- PATCH ${baseUrl}/api/projects/{projectId}           { "description": "…", "deployUrl": "…", "stack": ["…"] }
- POST  ${baseUrl}/api/projects/{projectId}/issues    { "title": "…", "issueType": "TASK|BUG|STORY|EPIC", "description": "…", "priority": "MEDIA", "storyPoints": 3, "assigneeUserId": "…", "epicId": "…", "parentId": "{id de una historia}" }
- PATCH ${baseUrl}/api/issues/{issueId}               { "status": "TODO|IN_PROGRESS|IN_REVIEW|DONE", "priority": "…", "assigneeUserId": "…", "storyPoints": 3, "sprintId": "…|null" }
- POST  ${baseUrl}/api/projects/{projectId}/sprints   { "name": "Sprint 1", "goal": "…" }    crear sprint (no se puede iniciar ni completar con este token)
- POST  ${baseUrl}/api/issues/{issueId}/comments      { "body": "…" }
- POST  ${baseUrl}/api/projects/{projectId}/notes     { "title": "…", "body": "…", "kind": "GENERAL" }
- GET   ${baseUrl}/api/issues/by-key/{CLAVE-12}       detalle de un ticket con comentarios

NO se puede con este token: borrar nada, administrar personas o estados, iniciar o completar sprints, ni cambiar ajustes de integraciones.

Antes de cargar algo, si no te pasé el nombre exacto del proyecto, consultá la lista con GET /api/ai/projects. Para asignar, usá /api/ai/users y el nombre o email de la persona.`;
}
