// Cloudflare Worker: serviert die statische Seite (ASSETS) und stellt
// unter /api/comments eine schlanke Kommentar-API auf Basis von D1 bereit,
// dazu /api/contact und die Leserspur (/api/leserspur, /api/statistik).

const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_FILL_MS = 3000; // schneller als 3s ausgefüllt = Bot

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// Schema-Nachrüstung ohne wrangler-Zugriff: die Spalte parent_id
// (Antwort-auf-Kommentar) wird beim ersten Request pro Isolate angelegt;
// existiert sie schon, schlägt das ALTER fehl und wird ignoriert.
let schemaGeprueft = false;
async function ensureSchema(env) {
  if (schemaGeprueft) return;
  try {
    await env.DB.exec("ALTER TABLE comments ADD COLUMN parent_id INTEGER");
  } catch {}
  schemaGeprueft = true;
}

async function listComments(url, env) {
  const slug = url.searchParams.get("slug") || "";
  if (!SLUG_RE.test(slug)) return json({ comments: [] });
  await ensureSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT id, name, body, created_at, parent_id FROM comments " +
      "WHERE slug = ? AND approved = 1 ORDER BY created_at ASC LIMIT 500"
  )
    .bind(slug)
    .all();
  return json({ comments: results || [] });
}

async function addComment(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Ungültige Anfrage." }, 400);
  }

  // Spamschutz 1: Honeypot — von Menschen unsichtbar, muss leer sein.
  if (data.website) return json({ ok: true, skipped: true });

  // Spamschutz 2: Zeitfalle — Formular zu schnell abgeschickt = Bot.
  const elapsed = Date.now() - Number(data.t || 0);
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS)
    return json({ ok: true, skipped: true });

  const slug = String(data.slug || "");
  const name = String(data.name || "").trim();
  const body = String(data.body || "").trim();
  const email = String(data.email || "").trim();

  if (!SLUG_RE.test(slug)) return json({ ok: false, error: "Unbekannter Beitrag." }, 400);
  if (name.length < 1 || name.length > 80)
    return json({ ok: false, error: "Bitte einen Namen (max. 80 Zeichen) angeben." }, 400);
  if (body.length < 2 || body.length > 5000)
    return json({ ok: false, error: "Kommentar fehlt oder ist zu lang." }, 400);
  // E-Mail ist Pflicht: kommentieren darf, wer eine Adresse hinterlässt.
  // Sie bleibt privat (wird nie über GET /api/comments ausgeliefert).
  if (!EMAIL_RE.test(email) || email.length > 120)
    return json({ ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);

  await ensureSchema(env);

  // Optional: Antwort auf einen bestehenden Kommentar desselben Beitrags.
  let parent_id = null;
  if (data.parent_id != null) {
    parent_id = Number(data.parent_id);
    if (!Number.isInteger(parent_id) || parent_id < 1)
      return json({ ok: false, error: "Ungültige Antwort-Referenz." }, 400);
    const parent = await env.DB.prepare(
      "SELECT id FROM comments WHERE id = ? AND slug = ? AND approved = 1"
    )
      .bind(parent_id, slug)
      .first();
    if (!parent)
      return json(
        { ok: false, error: "Der Kommentar, auf den du antwortest, existiert nicht mehr." },
        400
      );
  }

  const created_at = Date.now();
  const res = await env.DB.prepare(
    "INSERT INTO comments (slug, name, email, body, created_at, approved, parent_id) " +
      "VALUES (?, ?, ?, ?, ?, 1, ?)"
  )
    .bind(slug, name, email, body, created_at, parent_id)
    .run();

  return json({
    ok: true,
    comment: { id: res.meta.last_row_id, name, body, created_at, parent_id },
  });
}

async function addContact(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Ungültige Anfrage." }, 400);
  }

  // Spamschutz: Honeypot + Zeitfalle.
  if (data.website) return json({ ok: true, skipped: true });
  const elapsed = Date.now() - Number(data.t || 0);
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS)
    return json({ ok: true, skipped: true });

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const message = String(data.message || "").trim();

  if (name.length < 1 || name.length > 80)
    return json({ ok: false, error: "Bitte einen Namen (max. 80 Zeichen) angeben." }, 400);
  if (!EMAIL_RE.test(email) || email.length > 120)
    return json({ ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
  if (message.length < 5 || message.length > 5000)
    return json({ ok: false, error: "Bitte eine Nachricht (mind. 5 Zeichen) eingeben." }, 400);

  // 1) Immer in D1 sichern — so geht keine Anfrage verloren.
  await env.DB.prepare(
    "INSERT INTO contacts (name, email, message, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(name, email, message, Date.now())
    .run();

  // 2) E-Mail-Benachrichtigung — aktiv, sobald die send_email-Bindung (SEB) existiert.
  if (env.SEB) {
    try {
      const { EmailMessage } = await import("cloudflare:email");
      const raw = [
        "From: lichtkunst.cc Kontakt <istvan@lichtkunst.cc>",
        "To: istvanseidel@icloud.com",
        "Reply-To: " + email,
        "Subject: Neue Kontaktanfrage von lichtkunst.cc",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        "Name:   " + name,
        "E-Mail: " + email,
        "",
        message,
      ].join("\r\n");
      const msg = new EmailMessage("istvan@lichtkunst.cc", "istvanseidel@icloud.com", raw);
      await env.SEB.send(msg);
    } catch (e) {
      // Nicht fatal — die Anfrage liegt bereits in D1.
    }
  }

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Leserspur (Technik-Auftrag 9): datensparsamer Besucherzähler.
// POST /api/leserspur nimmt pro Seitenaufruf einen Datensatz an (Upsert per id;
// das Script schickt beim Tab-Wechsel mehrmals mit derselben id).
// GET  /api/statistik liefert die Rohdaten nur mit Schlüssel (Secret
// STATISTIK_SCHLUESSEL, im Cloudflare-Dashboard hinterlegt).
// Gespeichert werden weder IP noch User-Agent. Aufbewahrung 13 Monate.
// ---------------------------------------------------------------------------
const LS_MAX_BODY = 8192;
const LS_HOSTS = new Set(["lichtkunst.cc", "www.lichtkunst.cc"]);
const LS_BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor/i;
const LS_TAGE_AUFBEWAHRUNG = 400;
const LS_SPALTEN =
  "ts, tag, pfad, kanal, ref, ref_intern, geraet, sekunden, scroll, " +
  "abschnitt_max, abschnitt_ende, abschnitte, bilder, klicks, formular";

let lsSchemaGeprueft = false;
async function ensureLeserspur(env) {
  if (lsSchemaGeprueft) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS leserspur (" +
      "id TEXT PRIMARY KEY, ts INTEGER NOT NULL, tag TEXT NOT NULL, pfad TEXT NOT NULL, " +
      "kanal TEXT, ref TEXT, ref_intern TEXT, geraet TEXT, sekunden INTEGER, scroll INTEGER, " +
      "abschnitt_max INTEGER, abschnitt_ende INTEGER, abschnitte TEXT, bilder TEXT, klicks TEXT, formular TEXT)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS leserspur_ts ON leserspur(ts)").run();
  lsSchemaGeprueft = true;
}

const lsStr = (v, n) => String(v ?? "").slice(0, n);
const lsInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

function lsBereinigen(d) {
  if (!d || typeof d !== "object" || d.v !== 1) return null;
  if (!/^[a-z0-9-]{8,64}$/i.test(String(d.id || ""))) return null;
  const pfadRoh = lsStr(d.p, 160);
  if (!pfadRoh.startsWith("/")) return null;
  const jetzt = Date.now();
  return {
    id: lsStr(d.id, 64),
    ts: jetzt,
    tag: new Date(jetzt).toISOString().slice(0, 10),
    pfad: pfadRoh.replace(/\/+$/, "") || "/",
    kanal: lsStr(d.k, 30).toLowerCase().replace(/[^a-z0-9-]/g, ""),
    ref: lsStr(d.r, 80),
    ref_intern: lsStr(d.ri, 120),
    geraet: d.g === "m" ? "m" : "d",
    sekunden: lsInt(d.t, 0, 7200),
    scroll: lsInt(d.s, 0, 100),
    abschnitt_max: lsInt(d.m, 0, 50),
    abschnitt_ende: lsInt(d.x, 0, 50),
    abschnitte: (Array.isArray(d.a) ? d.a : []).slice(0, 40)
      .map((p) => [lsStr(Array.isArray(p) ? p[0] : "", 60), lsInt(Array.isArray(p) ? p[1] : 0, 0, 7200)]),
    bilder: Object.fromEntries(
      Object.entries(d.b && typeof d.b === "object" ? d.b : {}).slice(0, 24)
        .map(([k, v]) => [lsStr(k, 60), lsInt(v, 0, 7200)])
    ),
    klicks: (Array.isArray(d.c) ? d.c : []).slice(0, 40)
      .map((c) => [lsStr(Array.isArray(c) ? c[0] : "", 120), lsInt(Array.isArray(c) ? c[1] : -1, -1, 50)]),
    formular: (Array.isArray(d.f) ? d.f : []).slice(0, 20).map((f) => lsStr(f, 40)),
  };
}

function lsHerkunftErlaubt(request, url) {
  const quelle = request.headers.get("Origin") || request.headers.get("Referer");
  if (!quelle) return false;
  try {
    const h = new URL(quelle).hostname;
    return LS_HOSTS.has(h) || h === url.hostname;
  } catch {
    return false;
  }
}

async function leserspurSpeichern(request, env, url) {
  const fertig = () => new Response(null, { status: 204 });
  try {
    if (Number(request.headers.get("content-length") || 0) > LS_MAX_BODY)
      return new Response(null, { status: 413 });
    if (!lsHerkunftErlaubt(request, url)) return fertig();
    if (LS_BOT_RE.test(request.headers.get("User-Agent") || "")) return fertig();
    const text = await request.text();
    if (text.length > LS_MAX_BODY) return new Response(null, { status: 413 });
    let roh;
    try { roh = JSON.parse(text); } catch { return fertig(); }
    const z = lsBereinigen(roh);
    if (!z) return fertig();
    await ensureLeserspur(env);
    await env.DB.prepare(
      "INSERT INTO leserspur (id, " + LS_SPALTEN + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET sekunden = excluded.sekunden, scroll = excluded.scroll, " +
        "abschnitt_max = excluded.abschnitt_max, abschnitt_ende = excluded.abschnitt_ende, " +
        "abschnitte = excluded.abschnitte, bilder = excluded.bilder, klicks = excluded.klicks, " +
        "formular = excluded.formular WHERE leserspur.pfad = excluded.pfad"
    )
      .bind(z.id, z.ts, z.tag, z.pfad, z.kanal, z.ref, z.ref_intern, z.geraet, z.sekunden, z.scroll,
        z.abschnitt_max, z.abschnitt_ende, JSON.stringify(z.abschnitte), JSON.stringify(z.bilder),
        JSON.stringify(z.klicks), JSON.stringify(z.formular))
      .run();
    // Aufbewahrung: gelegentlich alte Zeilen löschen (Datenschutzerklärung: 13 Monate).
    if (Math.random() < 0.01) {
      await env.DB.prepare("DELETE FROM leserspur WHERE ts < ?")
        .bind(Date.now() - LS_TAGE_AUFBEWAHRUNG * 86400000).run();
    }
  } catch {}
  return fertig();
}

function lsGleich(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function lsJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

async function statistik(request, env, url) {
  const soll = env.STATISTIK_SCHLUESSEL;
  if (!soll) return json({ ok: false, error: "Der Schlüssel ist im Worker noch nicht eingerichtet." }, 503);
  const auth = request.headers.get("Authorization") || "";
  const ist = auth.startsWith("Bearer ") ? auth.slice(7).trim() : url.searchParams.get("key") || "";
  if (!ist || !lsGleich(ist, soll)) return json({ ok: false, error: "Der Schlüssel passt nicht." }, 401);
  const tage = lsInt(url.searchParams.get("tage") || 30, 1, 400);
  await ensureLeserspur(env);
  const { results } = await env.DB.prepare(
    "SELECT " + LS_SPALTEN + " FROM leserspur WHERE ts >= ? ORDER BY ts DESC LIMIT 50000"
  ).bind(Date.now() - tage * 86400000).all();
  const zeilen = (results || []).map((r) => ({
    ...r,
    abschnitte: lsJson(r.abschnitte, []),
    bilder: lsJson(r.bilder, {}),
    klicks: lsJson(r.klicks, []),
    formular: lsJson(r.formular, []),
  }));
  return new Response(JSON.stringify({ ok: true, tage, zeilen }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/comments") {
      if (request.method === "GET") return listComments(url, env);
      if (request.method === "POST") return addComment(request, env);
      return new Response("Method not allowed", { status: 405 });
    }
    if (url.pathname === "/api/contact") {
      if (request.method === "POST") return addContact(request, env);
      return new Response("Method not allowed", { status: 405 });
    }
    if (url.pathname === "/api/leserspur") {
      if (request.method === "POST") return leserspurSpeichern(request, env, url);
      return new Response("Method not allowed", { status: 405 });
    }
    if (url.pathname === "/api/statistik") {
      if (request.method === "GET") return statistik(request, env, url);
      return new Response("Method not allowed", { status: 405 });
    }
    // Alles andere: statische Seite ausliefern.
    return env.ASSETS.fetch(request);
  },
};
