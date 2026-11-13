# SCRUM ProShop — Asistente de reuniones de Meet (extensión de Chrome)

Graba **los subtítulos y el audio** de tus reuniones de Google Meet y los guarda en el **calendario de SCRUM ProShop**, con un panel lateral que
muestra los subtítulos en vivo. Corre en tu navegador como un participante más: no hay bot, nadie tiene que admitirlo.

> Esta extensión es una adaptación de la del CRM de ProShop. Aquí manda las reuniones a SCRUM: el audio se transcribe con OpenAI
> (la clave la pone un líder del equipo en *Ajustes → Integraciones*) y se conserva en la reunión para escucharlo y descargarlo.

## Instalar y conectar

1. Descarga el `.zip` desde `https://scrum.proshop.lat/extension-authorize` (o usa esta carpeta) y descomprímelo.
2. En `chrome://extensions` activa **Modo de desarrollador** → **Cargar descomprimida** → elige la carpeta.
3. En `https://scrum.proshop.lat/extension-authorize` pulsa **Conectar la extensión** (la extensión guarda su token solo).
4. Abre una reunión de Meet, pulsa el ícono de la extensión y **Grabar esta reunión**.

## Cómo se une con el calendario

- Antes de grabar puedes **elegir a cuál reunión del calendario** pertenece. Si no eliges, se detecta sola por el código de la sala
  de Meet; si no hay ninguna, se crea una reunión suelta (la ven quien grabó y los líderes).
- La transcripción aparece dentro de la reunión, en el calendario.
- API que usa: `GET /api/extension/me`, `GET /api/extension/meetings/list`, `POST /api/extension/transcript`, `POST /api/extension/audio`
  (todas con `Authorization: Bearer <token de la extensión>`).

## Qué hace

- **Subtítulos**: los activa si no lo están (sin apagarlos por error), los lee con el nombre de quien habla y los manda al
  SCRUM al terminar. Si no logra activarlos, o no llega ninguno en ~90 s, **avisa** en el panel.
- **Audio**: voces de la reunión + tu micrófono, **solo mientras no estás silenciado en Meet**. Se corta en partes de
  10 minutos que se suben solas (con reintentos), así que una pestaña cerrada solo cuesta la parte en curso. El SCRUM lo
  transcribe con Whisper y lo suma a la reunión.
- **Reunión del SCRUM**: antes de grabar puedes elegir a cuál reunión agendada pertenece (lista de hoy y próximas, con buscador y
  pestaña «Todas»). Cada grabación queda como una sección aparte, con su fecha y hora, dentro de esa reunión; no se mezclan.
- **Grabar pantalla**: botón en el panel y en el ícono. Graba la pantalla, una ventana o una pestaña (con el audio de lo que suena y,
  si quieres, tu micrófono) y la guarda **en tu computador**, en la carpeta que elijas; no se sube al SCRUM.
- **Panel lateral**: subtítulos en vivo, estado del audio y del micrófono, avisos de error, **Pausar / Reanudar**
  (en pausa no se guarda ni audio ni subtítulos, y lo dicho durante la pausa no aparece al reanudar), **Detener y
  enviar** .
- **Ajustes** (en el panel): elegir **qué micrófono** se graba (con barra de nivel para comprobarlo; cambia en vivo si ya
  grabas, y si el elegido se desconecta usa el predeterminado), idioma de los subtítulos, esconder la franja de Meet y abrir
  la ventana sola al entrar a una reunión.
- **Botón con el logo del SCRUM** en la pantalla de la reunión (abajo a la izquierda): abre el panel cuando quieras, aunque no
  estés grabando. Chrome no permite abrir el panel sin un clic, por eso el botón; para que la **ventana separada** aparezca sola
  al entrar, activa «Abrir la ventana sola…» en el ícono o en los Ajustes.
- Muestra **a qué organización** se está enviando la reunión (y su nombre) arriba del panel.
- **Permiso del micrófono**: si falta, el panel muestra un aviso con el botón «Permitir micrófono» y Chrome pide el permiso
  solo («quiere usar tu micrófono»), sin tener que buscar ningún botón. El audio de la reunión empieza a grabarse igual
  mientras tanto, y tu voz se suma apenas la permites.
- La franja vacía de subtítulos de Meet se esconde aunque nadie esté hablando todavía.
- **Diagnóstico** (Ajustes del panel): registro de lo que hizo la extensión (audio, subtítulos, pantalla de Meet) con un botón
  para copiarlo; sirve para ver por qué algo no arrancó.
- Funciona al entrar a una reunión desde la pantalla de inicio de Meet, sin recargar la pestaña.
- **Varias grabaciones por reunión**: «Detener y enviar» cierra esa grabación y el panel deja **grabar otra** en la misma sala
  (primero el cliente, después el equipo). Cada una es una reunión separada en el SCRUM (requiere el SCRUM desplegado con la
  columna `extensionRecordingId`; con un SCRUM anterior se mezclan en una sola).
- Al terminar muestra un resumen (duración, líneas, partes de audio) y pregunta **¿a qué cliente fue esta reunión?** ahí mismo,
  en el panel, para vincularla a una ficha de Seguimiento.
- **Un solo paso inicial**: «Iniciar sesión y permitir el micrófono» pide el permiso de Chrome y abre el SCRUM.
- **Tu micrófono se corta al instante** cuando te silencias en Meet (silencio total, menos de ¼ de segundo); no baja el volumen.
- Si recargas la extensión con una pestaña de Meet abierta, el script viejo se apaga solo sin errores (recarga la pestaña).
- Es **prueba de fallos**: si falla el audio siguen los subtítulos, y al revés.

## Archivos

| Archivo | Qué hace |
|---|---|
| `manifest.json` | Permisos y piezas (MV3). Chrome 116 o más. |
| `background.js` | Coordinador: tabCapture, estado en vivo, ventana separada. |
| `offscreen.js` | Graba el audio en partes y las sube con reintentos. |
| `content.js` | Lee los subtítulos de la pestaña de Meet y detecta el fin de la reunión. |
| `captions-dom.js` | Activa los subtítulos de forma segura y esconde su franja. |
| `sidepanel.html/js` | El panel (se abre con el ícono): sesión, organización, nombre, «Grabar», subtítulos en vivo y ajustes. También como ventana separada. |
| `permissions.html/js` | Única página que pide el micrófono (una vez, en una pestaña normal: el panel lateral pierde el foco y descartaba el aviso). |
| `authorize-bridge.js` | Guarda tu sesión del SCRUM al conectarte. |

## Permisos (y por qué)

- `tabCapture` + `offscreen`: grabar el audio de la pestaña de la reunión (solo al pulsar «Grabar»).
- `activeTab`: Chrome exige que el usuario invoque la extensión para capturar una pestaña.
- `sidePanel`: el panel con los subtítulos en vivo.
- `storage`: recordar tu sesión del SCRUM, la organización elegida y el estado en vivo.
- Hosts: `meet.google.com` (leer los subtítulos) y el SCRUM (enviarlos y conectarte).

La publicación en la Chrome Web Store está preparada en `STORE-LISTING.md`.
