// Verbindungen zwischen Werken und Journal-Beiträgen (seit 2026-10-02).
// Genutzt von components/Weiter.astro, pages/index.astro und pages/werke/index.astro.
// Neue Werke hier eintragen; fehlt ein Eintrag, greifen Serie und Schlagworte.

// Seiten zu „Gegen die Schwerkraft“ werden nicht automatisch empfohlen
// (laufende Abmahnung, Änderungen nur nach Freigabe).
export const GESPERRT = new Set(["2023-gegen-die-schwerkraft"]);

export const WERK_ZU_WERK: Record<string, string> = {
  "2026-cosmic-eggs": "2025-lichtei",
  "2025-lichtei": "2026-cosmic-eggs",
  "2024-teslablume": "2025-lichtei",
  "2014-erscheinung": "2019-blue-fluid",
};

// Mehrere Einträge = Reihenfolge der Vorliebe; verborgene Texte werden übersprungen.
export const JOURNAL_ZU_WERK: Record<string, string | string[]> = {
  "2026-cosmic-eggs": ["2026-10-03-die-lampe-die-man-nicht-sieht", "2026-06-09-die-eiform"],
  "2025-lichtei": "2026-06-09-die-eiform",
  "2019-black-planet": "2026-06-10-runde-welten",
  "2019-black-planet-2": "2026-06-10-runde-welten",
  "2019-blue-fluid": "2026-06-10-runde-welten",
  "2019-fremder-planet-1": "2026-06-10-runde-welten",
  "2014-erscheinung": "2026-06-05-farbe-ist-keine-wellenlaenge",
  "2024-teslablume": "2026-06-05-farbe-ist-keine-wellenlaenge",
};

export const WERK_ZU_JOURNAL: Record<string, string> = {
  "2026-10-03-die-lampe-die-man-nicht-sieht": "2026-cosmic-eggs",
  "2026-06-09-die-eiform": "2026-cosmic-eggs",
  "2026-06-10-runde-welten": "2019-black-planet",
  "2026-06-05-farbe-ist-keine-wellenlaenge": "2014-erscheinung",
};

// Liefert den ersten sichtbaren Journaltext aus JOURNAL_ZU_WERK.
export function journalFuer<T extends { id: string }>(werkId: string, journal: T[]): T | undefined {
  const z = JOURNAL_ZU_WERK[werkId];
  for (const id of Array.isArray(z) ? z : z ? [z] : []) {
    const t = journal.find((j) => j.id === id);
    if (t) return t;
  }
  return undefined;
}

// Werke, deren Text direkt in eine Newsletter-Anmeldung münden soll
// (Formular unmittelbar unter dem Text, vor „Weiter“). Wert = Zeile über dem Formular.
export const NEWSLETTER_NACH_TEXT: Record<string, string> = {
  "2026-cosmic-eggs": "Die nächsten Schritte der Suche schicke ich gelegentlich per Mail.",
};
