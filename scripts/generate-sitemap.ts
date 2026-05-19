// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://bundledmum.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/bundles", changefreq: "weekly", priority: "0.9" },
  { path: "/bundles/baby-shower-gift-boxes", changefreq: "weekly", priority: "0.8" },
  { path: "/bundles/postpartum-recovery-kits", changefreq: "weekly", priority: "0.8" },
  { path: "/bundles/maternity-bundles", changefreq: "weekly", priority: "0.8" },
  { path: "/shop", changefreq: "weekly", priority: "0.9" },
  { path: "/shop/baby", changefreq: "weekly", priority: "0.8" },
  { path: "/shop/mum", changefreq: "weekly", priority: "0.8" },
  { path: "/subscribe", changefreq: "monthly", priority: "0.7" },
  { path: "/subscriptions", changefreq: "monthly", priority: "0.7" },
  { path: "/quiz", changefreq: "monthly", priority: "0.7" },
  { path: "/push-gifts", changefreq: "monthly", priority: "0.7" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "monthly", priority: "0.6" },
  { path: "/blog", changefreq: "weekly", priority: "0.6" },
  { path: "/track-order", changefreq: "yearly", priority: "0.4" },
  { path: "/returns", changefreq: "yearly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/cookies", changefreq: "yearly", priority: "0.3" },
];

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
