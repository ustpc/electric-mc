import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// Electric MC test extension. See doc/Technical Stack and Architecture.md.
export default defineConfig({
  manifest: {
    name: 'Electric MC (test build)',
    description:
      'Parses Manuscript Central pages, rewrites page titles, and logs what it finds so the parsers can be validated.',
    permissions: ['storage', 'sidePanel', 'downloads', 'tabs'],
    host_permissions: ['https://*.manuscriptcentral.com/*'],
    action: { default_title: 'Electric MC' },
    side_panel: { default_path: 'sidepanel.html' },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
