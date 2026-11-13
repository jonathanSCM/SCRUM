# Ficha para la Chrome Web Store — SCRUM ProShop · Asistente de reuniones de Meet

Todo lo que pide el panel de desarrollador. Cuenta de desarrollador: pago único de US$5.

## Datos básicos
- **Nombre**: SCRUM ProShop — Asistente de reuniones de Meet
- **Categoría**: Productividad · **Idioma**: Español
- **Resumen corto (máx. 132)**: Guarda en el calendario de SCRUM ProShop los subtítulos y el audio de tus reuniones de Google Meet, con subtítulos en vivo.
- **URL de la política de privacidad**: https://scrum.proshop.lat/privacy (incluye la sección de la extensión)
- **URL oficial**: https://scrum.proshop.lat (el dominio hay que verificarlo en Google Search Console con la misma cuenta del desarrollador; si no, se deja vacío)
- **URL de asistencia**: https://scrum.proshop.lat/support
- **Correo de contacto**: proshop.soporte@gmail.com

## Propósito único
Guardar en la cuenta de SCRUM ProShop del usuario los subtítulos y, de forma opcional, el audio de las reuniones de Google Meet que el usuario decide grabar, para tener su transcripción en el calendario del equipo.

## Justificación de permisos
| Permiso | Justificación |
|---|---|
| `tabCapture` | Capturar el audio de la pestaña de la reunión, solo cuando el usuario pulsa «Grabar esta reunión». |
| `offscreen` | Mantener la grabación de audio (necesita APIs que el service worker no tiene). |
| `activeTab` | Chrome exige que el usuario invoque la extensión para capturar el audio de la pestaña. |
| `sidePanel` | Mostrar en un panel lateral los subtítulos en vivo y el estado de la grabación. |
| `desktopCapture` (opcional) | Plan B para capturar el audio si Chrome no permite la captura automática: la persona elige la pestaña de Meet. |
| `storage` | Guardar la sesión de SCRUM, el equipo elegido y el estado de la grabación. |
| Host `https://meet.google.com/*` | Leer los subtítulos de la reunión y detectar cuándo termina. |
| Host `https://scrum.proshop.lat/*` | Conectar con la cuenta y enviar los subtítulos y el audio. |

## Prácticas de privacidad (formulario)
- **¿Recopila datos de usuario?** Sí: contenido de comunicaciones (subtítulos y audio de la reunión que el usuario decide grabar) e información de autenticación (token de la extensión).
- **No** vende datos, **no** los usa para publicidad ni para decidir créditos, **no** los transfiere salvo para operar la función (SCRUM ProShop y su proveedor de transcripción, OpenAI).
- **Código remoto**: no usa.
- **Divulgación y consentimiento**: la primera vez, antes de pedir sesión o micrófono, el panel muestra qué se graba, a dónde va, qué no hace y cómo controlarlo, y exige marcar una casilla («debo avisar a los participantes»).
- Marcar las tres certificaciones de «Uso limitado».

## Imágenes
- Ícono 128×128 incluido en `icons/`. Al menos 1 captura de 1280×800 (el panel con subtítulos en vivo, el ícono con «Grabar», la reunión del calendario con su transcripción). Imagen promocional 440×280 (opcional).

## Antes de enviarla
1. Probarla con reuniones reales: subtítulos, audio, silencio del micrófono, detener y enviar, ventana separada.
2. Subir a la tienda el ZIP de esta carpeta (sin `README.md` ni `STORE-LISTING.md`) — se genera con `scripts/pack-extension.sh`.
3. La revisión de Google tarda de unos días a un par de semanas; `tabCapture` y los permisos sobre `meet.google.com` pueden pedir una explicación (usar la justificación de arriba).
