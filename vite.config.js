import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Production address for canonical links, social cards and the sitemap. Set VITE_SITE_URL
// once the game moves to its own domain.
const DEFAULT_SITE_URL = 'https://lethal-grid.amit26543789.workers.dev';

// Writes the absolute site address into index.html, and builds robots.txt and sitemap.xml.
// Cloudflare preview builds (any branch but main) are marked noindex so search engines only
// ever list the production site.
function seoPlugin(siteUrl) {
  const branch = process.env.WORKERS_CI_BRANCH;
  const isPreview = Boolean(branch) && branch !== 'main';
  return {
    name: 'lethal-grid-seo',
    // Runs before Vite parses the page, which can't read %SITE_URL% inside a link
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let out = html.replaceAll('%SITE_URL%', siteUrl).replace(/[ \t]*<!-- \/?web-only -->\n/g, '');
        if (isPreview) {
          out = out.replace('<head>', '<head>\n    <meta name="robots" content="noindex, nofollow" />');
        }
        return out;
      },
    },
    generateBundle() {
      const robots = isPreview
        ? 'User-agent: *\nDisallow: /\n'
        : `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
      const today = new Date().toISOString().slice(0, 10);
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `  <url><loc>${siteUrl}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>`,
        `  <url><loc>${siteUrl}/privacy</loc><lastmod>${today}</lastmod><priority>0.3</priority></url>`,
        '</urlset>',
        '',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
    },
  };
}

// Files in public/ that only make sense on our own site: Cloudflare headers, AdSense
// verification, the privacy page (the portal build shows its policy inline), and the PWA manifest
const WEB_ONLY_PUBLIC_FILES = ['_headers', 'ads.txt', 'privacy.html', 'manifest.webmanifest', 'og-image.jpg'];

// `vite build --mode portal` makes the zip for game portals (CrazyGames, itch.io, Poki,
// GameDistribution). The game runs from a subfolder inside the portal's iframe, so it drops the
// canonical link, social cards and manifest (marked web-only in index.html) and the files above.
function portalPlugin(outDir) {
  return {
    name: 'lethal-grid-portal',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/[ \t]*<!-- web-only -->[\s\S]*?<!-- \/web-only -->\n?/g, ''),
    },
    closeBundle() {
      for (const file of WEB_ONLY_PUBLIC_FILES) rmSync(resolve(outDir, file), { force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
  if (mode === 'portal') {
    const outDir = 'dist-portal';
    return {
      // Relative paths, so the build loads from any subfolder a portal hosts it under
      base: './',
      plugins: [react(), portalPlugin(outDir)],
      build: { outDir, sourcemap: false },
    };
  }
  return {
    plugins: [react(), seoPlugin(siteUrl)],
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
