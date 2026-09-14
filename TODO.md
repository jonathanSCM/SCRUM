# Ideas para más adelante

Ya construidos (rondas 2026-09-13 y 2026-09-14): buscador Cmd+K (+ atajo `/`),
filtros de tareas + "Mi semana", resumen de sprint más rico, acciones en lote,
atajo `n` para nueva tarea, página de Inicio con KPIs, y recuperar contraseña
por email.

Ideas que quedaron sin construir de la lista de "sistema completo":
- Invitación por email al crear una cuenta nueva (hoy se muestra la
  contraseña temporal una sola vez en pantalla).
- Exportar reporte (PDF/CSV) de un sprint o de todos los proyectos.
- Línea de tiempo / roadmap con varios sprints juntos.
- Backlog dedicado (tareas sin sprint, para armar el próximo).
- Actividad reciente cruzada (equivalente de "Mi semana" pero para Historial).
- Búsqueda más profunda (hoy el buscador no mira descripciones).
- Notificaciones vía Telegram.

**Importante para producción**: hay que agregar `MAIL_FROM` a las variables
de entorno de Coolify para esta app (`RESEND_API_KEY` ya está configurada) --
sin `MAIL_FROM` el correo de recuperación de contraseña usa un remitente
genérico de Resend en vez de "SCRUM ProShop".
