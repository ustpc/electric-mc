import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// Electric MC test extension. See doc/Technical Stack and Architecture.md.
export default defineConfig({
  manifest: {
    name: 'Electric MC (test build)',
    description:
      'Parses Manuscript Central pages, rewrites page titles, and logs what it finds so the parsers can be validated.',
    permissions: ['storage', 'sidePanel', 'downloads', 'tabs', 'contextMenus'],
    host_permissions: ['https://*.manuscriptcentral.com/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: {
      default_title: 'Electric MC',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    },
    side_panel: { default_path: 'sidepanel.html' },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
