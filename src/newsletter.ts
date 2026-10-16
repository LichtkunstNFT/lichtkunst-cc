/**
 * Zentrale Anlaufstelle für die Newsletter-Anmeldung (Technik-Auftrag 8).
 *
 * Seit 10/2026 geht jede Anmeldung an den eigenen Worker (/api/newsletter),
 * nicht mehr direkt an ein EmailOctopus-Formular. Der Worker prüft
 * Cloudflare Turnstile serverseitig, begrenzt Anmeldungen je Anschluss,
 * protokolliert die Einwilligung in D1 und legt den Kontakt erst dann per
 * EmailOctopus-API an. EmailOctopus schickt die Double-Opt-in-Mail.
 *
 * Turnstile wird erst geladen, wenn jemand das Formular berührt, damit die
 * Seite beim Aufruf nicht langsamer wird.
 */
export const NEWSLETTER_ENDPOINT = "/api/newsletter";

/** Öffentlicher Site-Key des Turnstile-Widgets (Cloudflare-Dashboard → Turnstile). */
export const TURNSTILE_SITEKEY = "0x4AAAAAAFYuCAf1Kw-muHxy";

/** Honigtopf: absichtlich kein Name, den Browser automatisch ausfüllen. */
export const HONEYPOT_FIELD = "lk_kontrolle";

/** Text an der Checkbox — wird als Einwilligungstext mitprotokolliert. */
export const CONSENT_LABEL =
  "Ja, ich möchte den Newsletter mit Neuigkeiten zu Werken, Ausstellungen und Texten per E-Mail erhalten.";

/** Mindestzeit (ms) zwischen Seitenaufbau und Absenden. */
export const MIN_FILL_MS = 3500;

// ---------------------------------------------------------------- Turnstile
type Zustand = { id?: string; token: string | null; fehler: boolean; warten: ((t: string | null) => void)[] };
const zustaende = new WeakMap<HTMLElement, Zustand>();
let skript: Promise<any> | null = null;

function ladeSkript(): Promise<any> {
  if (skript) return skript;
  skript = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.turnstile) return resolve(w.turnstile);
    w.lkTurnstileBereit = () => resolve(w.turnstile);
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=lkTurnstileBereit";
    s.async = true;
    s.onerror = () => { skript = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return skript;
}

/** Turnstile für diesen Platzhalter laden und starten (mehrfach aufrufbar). */
export async function vorbereiten(platz: HTMLElement): Promise<void> {
  let z = zustaende.get(platz);
  if (z && (z.id || z.fehler)) return;
  if (!z) { z = { token: null, fehler: false, warten: [] }; zustaende.set(platz, z); }
  const zz = z;
  try {
    const ts = await ladeSkript();
    if (zz.id) return;
    zz.id = ts.render(platz, {
      sitekey: TURNSTILE_SITEKEY,
      appearance: "interaction-only",
      language: "de",
      callback: (t: string) => { zz.token = t; zz.warten.splice(0).forEach((f) => f(t)); },
      "expired-callback": () => { zz.token = null; ts.reset(zz.id); },
      "error-callback": () => { zz.fehler = true; zz.warten.splice(0).forEach((f) => f(null)); },
    });
  } catch {
    zz.fehler = true;
    zz.warten.splice(0).forEach((f) => f(null));
  }
}

/** Gültiges Token holen; wartet höchstens `ms` Millisekunden. */
export async function holeToken(platz: HTMLElement, ms = 20000): Promise<string | null> {
  await vorbereiten(platz);
  const z = zustaende.get(platz)!;
  if (z.token) return z.token;
  if (z.fehler) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    z.warten.push((t) => { clearTimeout(timer); resolve(t); });
  });
}

/** Ein Token gilt nur einmal: nach jedem Absenden zurücksetzen. */
export function tokenVerbraucht(platz: HTMLElement): void {
  const z = zustaende.get(platz);
  const ts = (window as any).turnstile;
  if (z && z.id && ts) { z.token = null; ts.reset(z.id); }
}

// ---------------------------------------------------------------- Anmeldung
export async function anmelden(daten: {
  email: string; quelle: "formular" | "kommentar"; einwilligung: string;
  t: number; token: string; honigtopf?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(NEWSLETTER_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: daten.email, zustimmung: true, einwilligung: daten.einwilligung,
        quelle: daten.quelle, t: daten.t, token: daten.token, [HONEYPOT_FIELD]: daten.honigtopf || "",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok) return { ok: true };
    return { ok: false, error: d.error || "Die Anmeldung hat nicht geklappt. Bitte später erneut versuchen." };
  } catch {
    return { ok: false, error: "Keine Verbindung. Bitte später erneut versuchen." };
  }
}
