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
        let out = html.replaceAll('%SITE_URL%', siteUrl);
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
  return {
    plugins: [react(), seoPlugin(siteUrl)],
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
