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

async function listComments(url, env) {
  const slug = url.searchParams.get("slug") || "";
  if (!SLUG_RE.test(slug)) return json({ comments: [] });
  const { results } = await env.DB.prepare(
    "SELECT id, name, body, created_at FROM comments " +
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
  if (email && (email.length > 120 || !EMAIL_RE.test(email)))
    return json({ ok: false, error: "E-Mail-Adresse sieht ungültig aus." }, 400);

  const created_at = Date.now();
  const res = await env.DB.prepare(
    "INSERT INTO comments (slug, name, email, body, created_at, approved) " +
      "VALUES (?, ?, ?, ?, ?, 1)"
  )
    .bind(slug, name, email || null, body, created_at)
    .run();

  return json({
    ok: true,
    comment: { id: res.meta.last_row_id, name, body, created_at },
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
    // Alles andere: statische Seite ausliefern.
    return env.ASSETS.fetch(request);
  },
};
