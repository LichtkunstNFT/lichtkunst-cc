import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const werke = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/werke" }),
  schema: z.object({
    titel: z.string(),
    datum: z.coerce.date(),
    bild: z.string().optional(),
    serie: z.string().optional(),
    beschreibung_kurz: z.string().optional(),
    getgems_url: z.string().url().optional(),
    tags: z.array(z.string()).optional(),
    ausblenden: z.boolean().default(false),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    titel: z.string(),
    untertitel: z.string().optional(),
    vorschau: z.string().optional(),
    // "aus-dunkel" lässt die Bildränder in den schwarzen Grund auslaufen (Eithema)
    bildstil: z.string().optional(),
    datum: z.coerce.date(),
    titelbild: z.string().optional(),
    tags: z.array(z.string()).optional(),
    ausblenden: z.boolean().default(false),
    galerie: z.array(z.string()).optional(),
    pinterest_url: z.string().url().optional(),
    // Temporär, solange Pinterest lichtkunst.cc sperrt: Pins zeigen auf dieses
    // Getgems-NFT statt auf die Website. Nach Entsperrung Feld wieder entfernen.
    pin_ziel: z.string().url().optional(),
  }),
});

const nftSammlungen = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/nft-sammlungen" }),
  schema: z.object({
    titel: z.string(),
    plattform: z.string().default("Getgems"),
    url: z.string().url(),
    vorschaubild: z.string().optional(),
    beschreibung_kurz: z.string().optional(),
    tags: z.array(z.string()).optional(),
    ausblenden: z.boolean().default(false),
  }),
});

export const collections = {
  werke,
  blog,
  "nft-sammlungen": nftSammlungen,
};
