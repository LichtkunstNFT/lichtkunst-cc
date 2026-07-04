// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import wikiLinkPlugin from 'remark-wiki-link';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://lichtkunst.cc',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()]
  },
  markdown: {
    remarkPlugins: [
      [
        wikiLinkPlugin,
        {
          aliasDivider: '|',
          pageResolver: (name) => [name.trim()],
          hrefTemplate: (permalink) => {
            // Wikilinks default zu /werke/.
            // Cross-Section (z.B. Blog → Werk) per Markdown-Link [Text](/blog/slug).
            return `/werke/${permalink}`;
          },
          wikiLinkClassName: 'internal-link',
          newClassName: 'internal-link-broken',
        },
      ],
    ],
  },
});
