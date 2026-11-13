import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/SiteShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Qué datos recopila ${SITE.name}, para qué los usa, con quién los comparte y qué derechos tienes. Incluye la extensión de Chrome para reuniones de Google Meet.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      intro={`Esta política explica qué datos trata ${SITE.name} (el servicio) y la extensión de Chrome «SCRUM ProShop — Asistente de reuniones de Meet», para qué se usan y qué puedes hacer con ellos. El responsable es ${SITE.company}.`}
      sections={[
        {
          id: "datos",
          title: "Qué datos recopilamos",
          body: (
            <>
              <p><strong>Cuenta y perfil.</strong> Nombre, correo electrónico, contraseña (guardada solo como huella cifrada, nunca en claro), foto y banner opcionales, color del chat, frase del perfil, país o región y zona horaria.</p>
              <p><strong>Contenido de tu equipo.</strong> Proyectos, tickets, sprints, notas, comentarios, archivos adjuntos, mensajes del chat (canales, canales privados y mensajes directos), tarjetas de la Biblioteca y reuniones del calendario. Lo crean tú y tu equipo; nosotros lo guardamos para que el servicio funcione.</p>
              <p><strong>Avisos.</strong> Preferencias de notificaciones, suscripción de tu navegador a los avisos push y, si la activas, el tema secreto de la app ntfy de tu teléfono.</p>
              <p><strong>Reuniones grabadas con la extensión.</strong> Si decides grabar una reunión de Google Meet: los subtítulos con el nombre de quien habla, el audio de la pestaña y de tu micrófono (solo mientras no estás silenciado), el enlace de la reunión, la hora y la transcripción que resulta.</p>
              <p><strong>Datos técnicos.</strong> Registros mínimos de funcionamiento y seguridad (por ejemplo, intentos de acceso y errores). No usamos cookies de publicidad ni de seguimiento; solo las necesarias para mantener tu sesión.</p>
            </>
          ),
        },
        {
          id: "uso",
          title: "Para qué los usamos",
          body: (
            <>
              <ul>
                <li>Prestar el servicio: mostrar tus proyectos, el chat, el calendario y las transcripciones a quien corresponde.</li>
                <li>Enviarte avisos que tú o tu equipo activan (bandeja, navegador, teléfono, Slack, Discord o Telegram si el equipo los conectó).</li>
                <li>Convertir las horas de las reuniones a tu zona horaria.</li>
                <li>Transcribir el audio de las reuniones que tú decides grabar.</li>
                <li>Mantener la seguridad, evitar abusos y corregir fallos.</li>
              </ul>
              <p>No vendemos tus datos, no los usamos para publicidad y no los usamos para decidir sobre créditos ni empleo.</p>
            </>
          ),
        },
        {
          id: "extension",
          title: "La extensión de Chrome para Google Meet",
          body: (
            <>
              <p>La extensión <strong>nunca empieza a grabar sola</strong>: solo cuando tú pulsas «Grabar esta reunión», y muestra un indicador mientras graba. Funciona en tu navegador, como un participante más; no hay bots.</p>
              <ul>
                <li><strong>Qué lee:</strong> los subtítulos de la pestaña de Meet que tienes abierta y, si lo permites, el audio de esa pestaña y tu micrófono.</li>
                <li><strong>A dónde va:</strong> solo a tu cuenta de {SITE.name} (el equipo que elijas), usando un token propio que se guarda en tu navegador. No lo enviamos a terceros distintos de los del apartado «Con quién los compartimos».</li>
                <li><strong>Permisos:</strong> <code>tabCapture</code> y <code>offscreen</code> (grabar el audio de la reunión), <code>activeTab</code>, <code>sidePanel</code> (el panel con los subtítulos en vivo), <code>storage</code> (recordar tu sesión) y acceso a <code>meet.google.com</code> y a este servicio.</li>
                <li><strong>Lo que no hace:</strong> no vende ni comparte los datos con fines de publicidad, no los usa para perfiles ni para fines ajenos a la función de la extensión, y no ejecuta código remoto.</li>
              </ul>
              <p>El uso de la información recibida de las APIs de Google se ajusta a la política de datos de usuario de los servicios de Google, incluidos los requisitos de uso limitado.</p>
            </>
          ),
        },
        {
          id: "consentimiento",
          title: "Grabaciones y consentimiento",
          body: (
            <>
              <p>Grabar o transcribir a otras personas puede requerir su aviso y consentimiento según las leyes de tu país. <strong>Quien graba es responsable de avisar a los participantes</strong> y de contar con su consentimiento cuando la ley lo exija. La extensión te lo recuerda la primera vez y exige confirmarlo.</p>
              <p>Si participaste en una reunión grabada y no estás de acuerdo, pide al equipo que la grabó que la elimine, o escríbenos a <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
            </>
          ),
        },
        {
          id: "terceros",
          title: "Con quién los compartimos",
          body: (
            <>
              <p>Solo con los proveedores necesarios para operar cada función, y solo los datos que esa función requiere:</p>
              <ul>
                <li><strong>OpenAI</strong>, para transcribir el audio de las reuniones que graban los usuarios. Se le envía el audio de la reunión; según sus condiciones para uso por API, no lo usa para entrenar sus modelos. Nosotros guardamos una copia del audio en nuestros servidores (ver «Cuánto tiempo los guardamos»).</li>
                <li><strong>Google Gemini</strong>, solo si tu equipo activó los resúmenes con IA de los sprints: recibe el texto de los tickets del sprint.</li>
                <li><strong>Proveedor de alojamiento y base de datos</strong> donde corre el servicio.</li>
                <li><strong>ntfy, Slack, Discord y Telegram</strong>, solo si tú o tu equipo los conectaron: reciben el texto de los avisos.</li>
              </ul>
              <p>No compartimos tus datos con nadie más, salvo que una autoridad competente nos lo exija legalmente.</p>
            </>
          ),
        },
        {
          id: "visibilidad",
          title: "Quién ve tus datos dentro del servicio",
          body: (
            <>
              <p>Cada equipo está aislado: las personas de otro equipo no ven nada del tuyo. Dentro del equipo:</p>
              <ul>
                <li>Los <strong>canales privados</strong> y los <strong>mensajes directos</strong> los ven solo sus miembros. Los <strong>borradores privados</strong> de tickets los ve solo quien los creó.</li>
                <li>Las <strong>transcripciones y el audio</strong> de una reunión los ven quienes fueron invitados a ella, quien la agendó, quien la grabó y los líderes del equipo.</li>
                <li>Los mensajes y archivos <strong>no están cifrados de extremo a extremo</strong>: quien administra la base de datos del servicio podría técnicamente accederlos.</li>
              </ul>
            </>
          ),
        },
        {
          id: "retencion",
          title: "Cuánto tiempo los guardamos",
          body: (
            <>
              <p>El contenido de tu equipo se conserva mientras exista tu cuenta o el equipo. El <strong>audio de las reuniones se conserva</strong> para que las personas con acceso puedan escucharlo y descargarlo desde la reunión. Tanto el audio como la transcripción y los subtítulos se conservan hasta que la persona que los grabó o un líder del equipo los borre; puedes borrar solo el audio y conservar la transcripción. Si el administrador del servicio configura un plazo de retención, el audio se elimina automáticamente pasado ese plazo. Al eliminar un proyecto, un canal o una reunión, se elimina su contenido asociado. Las copias de seguridad se renuevan periódicamente.</p>
            </>
          ),
        },
        {
          id: "derechos",
          title: "Tus derechos",
          body: (
            <>
              <p>Puedes acceder a tus datos, corregirlos (desde tu perfil), exportarlos (los líderes pueden exportar sus proyectos), pedir que se eliminen, oponerte a ciertos usos y retirar tu consentimiento. Para eliminar tu cuenta o ejercer cualquier derecho escríbenos a <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>; respondemos lo antes posible.</p>
              <p>Puedes revocar la extensión en cualquier momento desactivándola o quitándola de Chrome, y cerrar su sesión desde el panel de la extensión.</p>
            </>
          ),
        },
        {
          id: "seguridad",
          title: "Seguridad",
          body: <p>Usamos conexiones cifradas (HTTPS), contraseñas protegidas con huella cifrada, tokens que se pueden revocar, aislamiento entre equipos y controles de acceso en cada petición. Ningún sistema es infalible: si detectamos una brecha que afecte tus datos, te avisaremos.</p>,
        },
        {
          id: "menores",
          title: "Menores de edad",
          body: <p>El servicio está pensado para equipos de trabajo y no está dirigido a menores de 18 años.</p>,
        },
        {
          id: "cambios",
          title: "Cambios y contacto",
          body: (
            <p>Si cambiamos esta política, publicaremos la nueva versión aquí con su fecha y, si el cambio es importante, te avisaremos dentro del servicio. Dudas o solicitudes: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
          ),
        },
      ]}
    />
  );
}
