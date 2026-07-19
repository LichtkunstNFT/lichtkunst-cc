// Cloudflare Worker: serviert die statische Seite (ASSETS) und stellt
// unter /api/comments eine schlanke Kommentar-API auf Basis von D1 bereit.

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
    // Alles andere: statische Seite ausliefern.
    return env.ASSETS.fetch(request);
  },
};
