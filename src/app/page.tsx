import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} — Proyectos, chat y reuniones de tu equipo en un solo lugar` },
  description: "Backlog, sprints y tablero Scrum; chat con canales; calendario de reuniones con zonas horarias y transcripciones de Google Meet. Para equipos de Latinoamérica.",
  openGraph: { title: SITE.name, description: "Proyectos, chat y reuniones de tu equipo en un solo lugar.", url: SITE.url, siteName: SITE.name, locale: "es_419", type: "website" },
};

const FEATURES = [
  { title: "Tablero, backlog y sprints", text: "Planifica con historias, tareas y bugs, arrastra tarjetas entre estados y sigue el avance de cada sprint. Todos ven los cambios al instante.", tone: "text-rust" },
  { title: "Chat del equipo", text: "Canales por proyecto, canales privados y mensajes directos. Menciona tickets, personas y archivos de la Biblioteca, y avisa al equipo con un botón.", tone: "text-moss-ink" },
  { title: "Calendario de reuniones", text: "Agenda desde el chat o el calendario. Cada persona ve la hora en su zona: si el equipo está en Perú y Bolivia, nadie hace cuentas.", tone: "text-blue" },
  { title: "Transcripciones de Meet", text: "La extensión de Chrome guarda los subtítulos y el audio de tus reuniones y las transcribe. Todo queda en la reunión del calendario.", tone: "text-warn" },
  { title: "Biblioteca de archivos", text: "Tarjetas con varios archivos y enlaces: contratos, entregables, resoluciones. Se mencionan en el chat con un clic.", tone: "text-rust" },
  { title: "Avisos donde estés", text: "Bandeja, navegador y tu teléfono. Con la app instalada, un número en el icono te dice cuántos avisos tienes.", tone: "text-moss-ink" },
];

function Mock() {
  const days = ["L", "M", "X", "J", "V"];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="rounded-2xl border border-line-strong bg-card p-4 shadow-hard">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-sm font-extrabold text-ink">Noviembre 2026</p>
          <span className="rounded-full bg-chip-tint px-2.5 py-0.5 text-[11px] font-bold text-rust">Hora de Lima</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 text-center text-[11px] text-ink-faint">
          {days.map((d) => <span key={d}>{d}</span>)}
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`rounded-md py-1.5 ${i === 6 ? "bg-rust font-bold text-white" : "bg-card-2 text-ink-soft"}`}>{16 + i}</span>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border-l-4 border-rust bg-card-2 p-2.5">
            <p className="text-xs font-bold text-ink">Planificación del sprint</p>
            <p className="text-[11px] text-ink-soft">10:00 Perú · 11:00 Bolivia · agendó Ana</p>
          </div>
          <div className="rounded-lg border-l-4 border-moss bg-card-2 p-2.5">
            <p className="text-xs font-bold text-ink">Revisión con el cliente</p>
            <p className="text-[11px] text-ink-soft">15:30 Perú · 16:30 Bolivia · agendó Luis</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -right-2 w-60 rounded-xl border border-line-strong bg-surface p-3 shadow-hard sm:-right-8">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-moss-ink">Transcripción</p>
        <p className="text-[11px] leading-snug text-ink-soft"><b className="text-ink">Ana:</b> Quedamos en cerrar el módulo de pagos esta semana.</p>
        <p className="mt-1 text-[11px] leading-snug text-ink-soft"><b className="text-ink">Luis:</b> Yo me encargo de las pruebas.</p>
      </div>
    </div>
  );
}

export default async function Landing() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/home");
  // La primera vez, antes de que exista alguna cuenta, se va directo a crearla.
  if ((await prisma.user.count()) === 0) redirect("/register");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-block rounded-full border border-line-strong bg-card px-3 py-1 text-xs font-semibold text-ink-soft">Para equipos que trabajan en varios países</p>
            <h1 className="mt-4 font-display text-4xl font-black leading-[1.05] tracking-tight text-ink sm:text-5xl">Proyectos, chat y reuniones de tu equipo, en un solo lugar.</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">Organiza el trabajo con Scrum, conversa en canales, agenda reuniones con la hora correcta para cada persona y guarda lo que se dijo en ellas.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/login" className="btn-primary">Entrar</Link>
              <a href={`mailto:${SITE.contactEmail}?subject=${encodeURIComponent("Quiero usar SCRUM ProShop")}`} className="btn-ghost">Pedir acceso</a>
            </div>
            <p className="mt-3 text-xs text-ink-faint">El acceso es por invitación de tu equipo. Instálala como app en tu teléfono o computador.</p>
          </div>
          <Mock />
        </section>

        <section id="funciones" className="scroll-mt-20 border-y border-line bg-card-2/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">Todo lo que tu equipo necesita para avanzar</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl border border-line bg-card p-5">
                  <h3 className={`font-display text-lg font-extrabold ${f.tone}`}>{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="reuniones" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">Reuniones sin cuentas de horarios ni notas a mano</h2>
              <p className="mt-3 text-ink-soft">Cuando alguien agenda una reunión desde el chat, aparece en el calendario con quién la agendó y a qué hora es para cada persona.</p>
            </div>
            <ol className="space-y-4">
              {[
                ["Elige tu país", "Cada persona indica dónde está. Las horas se muestran en su zona, también con horario de verano."],
                ["Agenda una reunión", "Escribe /reunion en el chat o usa el botón Avisar. Queda en el calendario y el equipo recibe el aviso."],
                ["Graba con la extensión", "En Google Meet, un clic en «Grabar esta reunión». Nunca graba sola y avisa mientras graba."],
                ["Lee la transcripción", "El audio se transcribe y la reunión del calendario guarda el texto, con búsqueda."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rust text-sm font-extrabold text-white">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-ink">{t}</p>
                    <p className="text-sm text-ink-soft">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-8 rounded-xl border border-line bg-card-2/60 p-4 text-sm text-ink-soft">
            <b className="text-ink">Tu privacidad primero.</b> Quien graba avisa a los participantes. El audio se borra al terminar de transcribirse y las transcripciones solo las ven quienes estuvieron invitados. Más en la <Link href="/privacy" className="font-semibold text-rust hover:underline">política de privacidad</Link>.
          </p>
        </section>

        <section className="border-t border-line bg-rust/5">
          <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">Empieza hoy con tu equipo</h2>
            <p className="mx-auto mt-2 max-w-xl text-ink-soft">Entra con tu cuenta o abre el enlace de tu invitación. Si todavía no tienes acceso, escríbenos.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/login" className="btn-primary">Entrar</Link>
              <a href={`mailto:${SITE.contactEmail}?subject=${encodeURIComponent("Quiero usar SCRUM ProShop")}`} className="btn-ghost">Pedir acceso</a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
