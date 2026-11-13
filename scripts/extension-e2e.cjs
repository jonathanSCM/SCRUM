// Prueba de punta a punta de la extensión de Meet: la carga en Chromium (headless nuevo) apuntando a un servidor local,
// la conecta desde /extension-authorize, lista reuniones, graba subtítulos de una página de "Meet" simulada y verifica
// que quedaron en la reunión del calendario. Uso: BASE=http://localhost:3056 EMAIL=… PASSWORD=… node scripts/extension-e2e.cjs
// (el servidor debe estar corriendo con la base de las pruebas de aislamiento).
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE || "http://localhost:3056";
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD || "password-de-prueba-123";
const SHOTS = process.env.SHOTS || os.tmpdir();
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok   " : "  FALLA"} ${name}${!ok && detail ? "  -> " + detail : ""}`);
  if (!ok) failures++;
};

function copyExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ext-"));
  const src = path.join(__dirname, "..", "extensions", "meet");
  for (const f of fs.readdirSync(src, { recursive: true })) {
    const from = path.join(src, f);
    if (fs.statSync(from).isDirectory()) { fs.mkdirSync(path.join(dir, f), { recursive: true }); continue; }
    let buf = fs.readFileSync(from);
    if (/\.(js|html|json|css)$/.test(f)) buf = Buffer.from(buf.toString("utf8").replaceAll("https://scrum.proshop.lat", BASE));
    fs.writeFileSync(path.join(dir, f), buf);
  }
  return dir;
}

(async () => {
  const prisma = new PrismaClient();
  const ext = copyExtension();
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "prof-")), {
    headless: false,
    viewport: { width: 1200, height: 800 },
    args: ["--headless=new", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    let sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 20000 }));
    const extId = new URL(sw.url()).host;
    check("la extensión carga en Chrome (service worker activo)", !!extId, sw.url());
    const storage = () => sw.evaluate(() => chrome.storage.local.get(null));

    // 1) Iniciar sesión en Scrum y conectar la extensión
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("input[type=email]", EMAIL);
    await page.fill("input[type=password]", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL("**/home", { timeout: 90000 });
    check("el inicio de sesión lleva a Scrum", page.url().endsWith("/home"));
    await page.goto(`${BASE}/extension-authorize`, { timeout: 90000 });
    await page.getByRole("button", { name: "Conectar la extensión", exact: true }).click();
    let st = {};
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !st.token) {
      await page.waitForTimeout(500);
      st = await storage();
    }
    console.log(`  (el token tardó ${Date.now() - t0} ms en llegar a la extensión)`);
    check("al conectar, la extensión guarda su token y el nombre", /^scrum_/.test(st.token ?? "") && !!st.userName && st.apiBase === BASE, JSON.stringify({ ...st, token: st.token ? "…" : null }));

    // 2) Una sala de "Meet" simulada con subtítulos como los de Meet
    await ctx.route("https://meet.google.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="es"><body><h1>Sala falsa</h1>
          <button aria-label="Desactivar subtítulos" data-is-muted="false">cc</button>
          <div role="region" aria-label="Subtítulos" tabindex="0"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="/>
            <div class="nMcdL"><div class="NWpY1d">Ana</div><div class="ygicle">Hola a todos, empecemos con la planificación del sprint.</div></div>
            <div class="nMcdL"><div class="NWpY1d">Luis</div><div class="ygicle">Yo me encargo de las pruebas de esta semana, está bien.</div></div>
          </div></body></html>`,
      })
    );
    const meet = await ctx.newPage();
    await meet.goto("https://meet.google.com/abc-defg-hij");
    await meet.waitForTimeout(2500);
    const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://meet.google.com/*" }))[0].id);

    // 3) El panel (modo ventana separada: ?tab=ID): consentimiento, cuenta, equipo y reuniones del calendario
    const meetingRow = await prisma.meeting.findFirst({ where: { title: "Reunión con extensión" }, orderBy: { createdAt: "desc" } });
    await sw.evaluate(() => chrome.storage.local.set({ recordAudio: false })); // solo subtítulos: sin micrófono ni captura de pestaña
    const panel = await ctx.newPage();
    await panel.goto(`chrome-extension://${extId}/sidepanel.html?tab=${tabId}`);
    await panel.waitForTimeout(1500);
    check("la primera vez pide el consentimiento", await panel.locator("#consentBox").isVisible());
    await panel.screenshot({ path: path.join(SHOTS, "ext-e2e-consent.png") });
    await panel.locator("#consentCheck").check();
    await panel.locator("#consentAccept").click();
    await panel.waitForTimeout(2500);
    check("con la sesión conectada muestra 'Conectado' y el botón de grabar", await panel.locator("#recordBtn").isVisible(), await panel.locator("body").innerText().then((t) => t.slice(0, 200)));
    await panel.locator("#meetPick, #meetPickBtn, [id*='meetPick']").first().click().catch(() => {});
    await panel.waitForTimeout(2000);
    const body = await panel.locator("body").innerText();
    check("lista las reuniones del calendario del equipo", body.includes("Reunión con extensión") || body.includes("Charla") || body.includes("retro"), body.slice(0, 300));
    await panel.screenshot({ path: path.join(SHOTS, "ext-e2e-meetings.png") });

    // 4) Tema claro/oscuro con el botón
    const theme = () => panel.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await panel.keyboard.press("Escape");
    const before = await panel.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await panel.locator("#themeBtn").click();
    const t1 = await theme();
    const after = await panel.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check("el botón de tema cambia el tema (y los colores)", !!t1 && before !== after, `${t1} ${before} -> ${after}`);
    await panel.screenshot({ path: path.join(SHOTS, "ext-e2e-tema-1.png") });
    await panel.reload();
    check("el tema elegido se recuerda al recargar", (await theme()) === t1);
    await panel.locator("#themeBtn").click();
    check("y se puede volver al otro", (await theme()) !== t1);
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    check("la ventana emergente comparte el mismo tema", (await popup.evaluate(() => document.documentElement.getAttribute("data-theme"))) === (await theme()));
    await popup.close();

    // 5) Grabar (solo subtítulos) y detener: debe llegar a la reunión del calendario
    await panel.locator("#recordBtn").click().catch(() => {});
    await panel.waitForTimeout(6000);
    await panel.screenshot({ path: path.join(SHOTS, "ext-e2e-grabando.png") });
    const stopBtn = panel.locator("#stopBtn, button:has-text('Detener')").first();
    await stopBtn.click().catch(() => {});
    await panel.waitForTimeout(6000);
    const rec = await prisma.meetingRecording.findFirst({ where: { meetUrl: { contains: "abc-defg-hij" } }, orderBy: { createdAt: "desc" } });
    check("los subtítulos llegaron a Scrum con quién habla", !!rec && /Ana/.test(rec.captions) && /Luis/.test(rec.captions) && rec.finalized, JSON.stringify(rec && { c: rec.captions.slice(0, 120), f: rec.finalized, m: rec.meetingId }));
    check("quedaron ligados a una reunión del calendario", !!rec?.meetingId);
    void meetingRow;
  } finally {
    await ctx.close();
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} fallas` : "\nTodo bien");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
