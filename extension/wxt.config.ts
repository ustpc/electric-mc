import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import pkg from './package.json' with { type: 'json' };

// Electric MC test extension. See doc/Technical Stack and Architecture.md.
// STORE=1 builds the Chrome Web Store package: its name and description
// are the listing's. Without it the build is labeled as a test build.
const STORE = !!process.env.STORE;

export default defineConfig({
  // Builds go to build/chrome-mv3 (WXT's default is .output/).
  outDir: 'build',
  manifest: {
    // Semantic versioning; the version lives in package.json.
    name: STORE ? 'Electric MC' : `Electric MC (test build v${pkg.version})`,
    description: STORE
      ? 'Makes ScholarOne Manuscripts easier for editors: readable tab titles, highlighted revisions, earlier-version AEs, and easier login.'
      : 'Parses Manuscript Central pages, rewrites page titles, and logs what it finds so the parsers can be validated.',
    // Test builds may also write a live log file through tools/log-host.
    permissions: ['storage', 'sidePanel', 'downloads', 'tabs', 'contextMenus', ...(STORE ? [] : ['nativeMessaging'])],
    host_permissions: ['https://*.manuscriptcentral.com/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: {
      default_title: `Electric MC v${pkg.version}`,
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    },
    side_panel: { default_path: 'sidepanel.html' },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
