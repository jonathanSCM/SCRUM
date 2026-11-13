import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/SiteShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: `Condiciones de uso de ${SITE.name} y de su extensión de Chrome para reuniones de Google Meet.`,
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Términos de uso"
      intro={`Estas condiciones regulan el uso de ${SITE.name} y de su extensión de Chrome. Al crear una cuenta o usar el servicio las aceptas. Si no estás de acuerdo, no lo uses.`}
      sections={[
        {
          id: "servicio",
          title: "El servicio",
          body: <p>{SITE.name} es una herramienta para que equipos gestionen proyectos con el método Scrum (backlog, sprints, tablero), se comuniquen por chat, agenden reuniones en un calendario compartido y, si lo deciden, guarden y transcriban sus reuniones de Google Meet. Podemos mejorar, cambiar o retirar funciones; avisaremos si el cambio es importante.</p>,
        },
        {
          id: "cuentas",
          title: "Cuentas y equipos",
          body: (
            <>
              <p>Debes dar datos verdaderos y mantener tu contraseña en secreto; eres responsable de lo que se haga con tu cuenta. Cada cuenta es personal.</p>
              <p>Los equipos tienen dueños y administradores («líderes») que invitan o quitan personas, y que pueden ver el contenido del equipo. Quien crea un equipo es responsable de su uso y de las personas que invita.</p>
            </>
          ),
        },
        {
          id: "uso",
          title: "Uso aceptable",
          body: (
            <>
              <p>No puedes usar el servicio para:</p>
              <ul>
                <li>violar leyes o derechos de terceros, incluidos los de privacidad y propiedad intelectual;</li>
                <li>subir contenido ilegal, malicioso o que acose a otras personas;</li>
                <li>intentar acceder a datos de otros equipos, saltarte los controles de acceso o sobrecargar el servicio;</li>
                <li>usar los tokens, la API o la extensión de formas distintas a las previstas, o revenderlos.</li>
              </ul>
              <p>Podemos suspender cuentas que incumplan estas reglas.</p>
            </>
          ),
        },
        {
          id: "contenido",
          title: "Tu contenido",
          body: <p>El contenido que subes sigue siendo tuyo o de tu equipo. Nos autorizas a guardarlo, procesarlo y mostrarlo a las personas que tú o tu equipo elijan, únicamente para prestar el servicio. Eres responsable de contar con los derechos para subirlo.</p>,
        },
        {
          id: "grabaciones",
          title: "Reuniones, grabación y transcripción",
          body: (
            <>
              <p>La extensión solo graba cuando tú lo pides. <strong>Antes de grabar debes avisar a los participantes y contar con su consentimiento cuando la ley de tu país o la de ellos lo exija.</strong> Tú, o tu organización, eres el responsable de esa obligación; {SITE.name} es solo la herramienta.</p>
              <p>La transcripción se hace con un proveedor externo de IA y puede tener errores: no la uses como única fuente para decisiones importantes sin revisarla. Más detalles en la <Link href="/privacy">política de privacidad</Link>.</p>
            </>
          ),
        },
        {
          id: "disponibilidad",
          title: "Disponibilidad y copias de seguridad",
          body: <p>Hacemos lo posible por mantener el servicio disponible y respaldado, pero se ofrece «tal cual», sin garantía de funcionamiento ininterrumpido. Puede haber mantenimientos o fallos. Te recomendamos exportar periódicamente lo que sea crítico.</p>,
        },
        {
          id: "propiedad",
          title: "Propiedad intelectual",
          body: <p>El software, el diseño y la marca del servicio son de {SITE.company} o de sus licenciantes. Te damos un derecho personal, limitado, revocable e intransferible para usarlos según estos términos.</p>,
        },
        {
          id: "terminacion",
          title: "Terminación",
          body: <p>Puedes dejar de usar el servicio y pedir la eliminación de tu cuenta cuando quieras. Podemos suspender o cerrar una cuenta que incumpla estos términos o ponga en riesgo el servicio o a otras personas.</p>,
        },
        {
          id: "responsabilidad",
          title: "Limitación de responsabilidad",
          body: <p>En la medida que permita la ley, {SITE.company} no responde por daños indirectos, pérdida de datos o de ingresos derivados del uso del servicio, ni por el contenido que suban los usuarios ni por lo que decidan grabar. Nada en estos términos limita derechos que la ley no permita limitar.</p>,
        },
        {
          id: "cambios",
          title: "Cambios y contacto",
          body: <p>Podemos actualizar estos términos; la versión vigente es la publicada aquí con su fecha. Si el cambio es importante, te avisaremos dentro del servicio. Dudas: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>,
        },
      ]}
    />
  );
}
