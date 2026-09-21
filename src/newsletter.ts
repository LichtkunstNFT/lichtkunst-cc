/**
 * Zentrale Anlaufstelle für die Newsletter-Anmeldung.
 *
 * Die Form-URL wurde bis 09/2026 an zwei Stellen doppelt gepflegt
 * (NewsletterForm.astro und Comments.astro). Beim Austausch des
 * EmailOctopus-Formulars muss nur noch diese Datei geändert werden.
 *
 * Achtung beim Wechsel auf ein neues EmailOctopus-Formular: der Einbettungs-
 * Code bringt auch einen neuen Honigtopf-Feldnamen (HONEYPOT_FIELD) mit, und
 * der Name des E-Mail-Feldes kann abweichen. Beide aus dem frischen Snippet
 * übernehmen, sonst laufen Anmeldungen ins Leere.
 */
export const NEWSLETTER_ENDPOINT =
  "https://eocampaign1.com/form/37a6e4fc-6001-11f1-b0c3-9b90a18e68d4";

/** Feldname des E-Mail-Eingabefelds im EmailOctopus-Formular. */
export const EMAIL_FIELD = "field_0";

/** Honigtopf von EmailOctopus — muss leer bleiben. */
export const HONEYPOT_FIELD = "hpc4b27b6e-eb38-11e9-be00-06b4694bee2a";

/** Eigener Honigtopf; wird nie an EmailOctopus gesendet. */
export const TRAP_FIELD = "website";

/** Mindestzeit (ms) zwischen Seitenaufbau und Absenden. */
export const MIN_FILL_MS = 3500;
