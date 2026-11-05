-- Comprobaciones tras el primer arranque con multi-equipo (PostgreSQL).
--   psql "$DATABASE_URL" -f scripts/verify-workspaces.sql
-- Todo lo marcado "debe ser 0" tiene que dar 0. Después, abrí la app y entrá con tu cuenta.

\echo '== Equipos'
select name, slug from "Workspace";

\echo '== Personas y su rol en cada equipo (debe haber al menos un OWNER por equipo)'
select w.name as equipo, u.email, m.role
from "Membership" m join "User" u on u.id = m."userId" join "Workspace" w on w.id = m."workspaceId"
order by w.name, m.role, u.email;

\echo '== Cuentas sin ningún equipo (debe ser 0)'
select count(*) from "User" u where not exists (select 1 from "Membership" m where m."userId" = u.id);

\echo '== Equipos sin dueño (debe ser 0)'
select count(*) from "Workspace" w where not exists (select 1 from "Membership" m where m."workspaceId" = w.id and m.role = 'OWNER');

\echo '== Filas sin equipo asignado (todas deben ser 0)'
select 'Project' as tabla, count(*) from "Project" where "workspaceId" is null
union all select 'StatusOption', count(*) from "StatusOption" where "workspaceId" is null
union all select 'ChatMessage', count(*) from "ChatMessage" where "workspaceId" is null
union all select 'ChatFile', count(*) from "ChatFile" where "workspaceId" is null
union all select 'ChatDeletion', count(*) from "ChatDeletion" where "workspaceId" is null
union all select 'ApiToken', count(*) from "ApiToken" where "workspaceId" is null;

\echo '== Claves de proyecto repetidas dentro de un equipo (debe ser 0)'
select count(*) from (select "workspaceId", key from "Project" group by 1, 2 having count(*) > 1) x;
