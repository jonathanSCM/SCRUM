import Link from "next/link";
import { SITE } from "@/lib/site";

// Marco de las páginas públicas (landing, términos y privacidad): barra superior y pie con los enlaces legales.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-md border border-line object-cover" />
          <span className="font-display text-lg font-extrabold tracking-tight text-ink">{SITE.name}</span>
        </Link>
        <nav className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link href="/#funciones" className="hidden px-2 text-sm text-ink-soft hover:text-ink sm:inline">Funciones</Link>
          <Link href="/#reuniones" className="hidden px-2 text-sm text-ink-soft hover:text-ink sm:inline">Reuniones</Link>
          <Link href="/login" className="btn-primary btn-sm">Entrar</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-card-2/40">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-ink-soft sm:px-6">
        <span className="font-semibold text-ink">{SITE.name}</span>
        <span className="text-ink-faint">© {new Date().getFullYear()} {SITE.company}</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-ink">Privacidad</Link>
          <Link href="/terms" className="hover:text-ink">Términos</Link>
          <Link href="/support" className="hover:text-ink">Soporte</Link>
          <a href={`mailto:${SITE.contactEmail}`} className="hover:text-ink">{SITE.contactEmail}</a>
        </span>
      </div>
    </footer>
  );
}

// Página de texto legal con índice lateral.
export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: Array<{ id: string; title: string; body: React.ReactNode }> }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-rust">Legal</p>
        <h1 className="mt-1 font-display text-4xl font-black tracking-tight text-ink">{title}</h1>
        <p className="mt-2 max-w-3xl text-ink-soft">{intro}</p>
        <p className="mt-1 text-xs text-ink-faint">Última actualización: {SITE.updated}</p>
        <div className="mt-8 grid gap-10 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="Contenido" className="hidden lg:block">
            <ul className="sticky top-24 space-y-1.5 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-ink-soft hover:text-ink">{i + 1}. {s.title}</a>
                </li>
              ))}
            </ul>
          </nav>
          <article className="min-w-0 max-w-3xl space-y-9">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="font-display text-xl font-extrabold text-ink">{i + 1}. {s.title}</h2>
                <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-ink-soft [&_a]:font-semibold [&_a]:text-rust [&_a:hover]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{s.body}</div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
