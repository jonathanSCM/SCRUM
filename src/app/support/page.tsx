import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/SiteShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Soporte",
  description: `Ayuda para ${SITE.name} y su extensión de Chrome para reuniones de Google Meet: cómo conectarla y qué hacer si algo no funciona.`,
};

export default function SupportPage() {
  return (
    <LegalPage
      title="Soporte"
      intro={`¿Algo no funciona o tienes una duda sobre ${SITE.name} o su extensión de Chrome? Aquí están las respuestas más comunes y cómo escribirnos.`}
      sections={[
        {
          id: "contacto",
          title: "Escríbenos",
          body: (
            <>
              <p>Escribe a <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> y cuéntanos qué pasó. Ayuda mucho que incluyas tu correo de cuenta, el navegador que usas y, si puedes, una captura de pantalla.</p>
              <p>También puedes pedirnos acceso, o que eliminemos una grabación o tu cuenta, por ese mismo correo.</p>
            </>
          ),
        },
        {
          id: "conectar",
          title: "Cómo conectar la extensión",
          body: (
            <>
              <ol className="[&>li]:list-decimal">
                <li>Instala la extensión desde la Chrome Web Store.</li>
                <li>Inicia sesión en SCRUM ProShop y abre <Link href="/extension-authorize">/extension-authorize</Link>.</li>
                <li>Pulsa «Conectar la extensión». La extensión guarda su token sola; puedes cerrar la pestaña.</li>
                <li>Abre una reunión de Google Meet, pulsa el ícono de la extensión y luego «Grabar esta reunión».</li>
              </ol>
              <p>Si cambias de cuenta o algo falla, vuelve a pulsar «Conectar la extensión»: el token anterior se reemplaza. Para desconectarla, usa «Desconectar la extensión de mi cuenta» en esa misma página.</p>
            </>
          ),
        },
        {
          id: "problemas",
          title: "Problemas frecuentes",
          body: (
            <>
              <p><strong>No sale el botón de grabar.</strong> Recarga la pestaña de Meet y abre la extensión con un clic en su ícono. Si la extensión muestra «Iniciar sesión», conéctala como se explica arriba.</p>
              <p><strong>No aparecen subtítulos.</strong> La extensión activa los subtítulos de Meet sola. Si Meet los tiene desactivados por la cuenta de tu organización, actívalos tú desde Meet (botón «CC»). En los Ajustes del panel puedes elegir el idioma.</p>
              <p><strong>No se graba el audio.</strong> Chrome pide dos permisos: el micrófono (una vez) y la captura de la pestaña de Meet. Abre la extensión con un clic en su ícono y acepta. Si prefieres no grabar audio, apaga «Grabar audio» en Ajustes y se guardan solo los subtítulos.</p>
              <p><strong>La transcripción del audio dice «en cola».</strong> El equipo todavía no tiene la clave de OpenAI configurada. Un líder puede pegarla en Ajustes → Integraciones; el audio espera y se transcribe solo.</p>
              <p><strong>No veo la reunión en el calendario.</strong> Si no elegiste una reunión antes de grabar y la sala de Meet no coincide con ninguna agendada, se crea una reunión suelta que solo ven quien grabó y los líderes del equipo.</p>
              <p><strong>La hora de la reunión se ve distinta.</strong> Cada persona ve la hora en su zona. Elige tu país en <Link href="/settings/profile">Editar perfil</Link>.</p>
            </>
          ),
        },
        {
          id: "privacidad",
          title: "Privacidad y consentimiento",
          body: (
            <p>Consulta cómo tratamos tus datos en la <Link href="/privacy">política de privacidad</Link> y las condiciones en los <Link href="/terms">términos de uso</Link>. Recuerda que quien graba una reunión debe avisar a los participantes y contar con su consentimiento cuando la ley lo exija.</p>
          ),
        },
      ]}
    />
  );
}
