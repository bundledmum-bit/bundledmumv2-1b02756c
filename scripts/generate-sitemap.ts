// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://bundledmum.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
  lastmod?: string;
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
  // Articles index — always present; individual published articles are
  // appended below from the DB when build-time Supabase creds exist.
  { path: "/articles", changefreq: "weekly", priority: "0.7" },
  { path: "/track-order", changefreq: "yearly", priority: "0.4" },
  { path: "/returns", changefreq: "yearly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/cookies", changefreq: "yearly", priority: "0.3" },
];

// Resolve Supabase creds from the build env, falling back to a parse of
// the local .env file (Vite injects import.meta.env, but this plain Node
// script does not auto-load .env).
function readEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const dotenv = readFileSync(resolve(".env"), "utf8");
    const m = dotenv.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* no .env on disk */
  }
  return undefined;
}

// Append published article URLs from the DB. Non-fatal: any failure
// (no creds, network error, missing table) logs a warning and leaves the
// /articles index entry in place so the build never breaks.
async function appendArticles(list: SitemapEntry[]): Promise<void> {
  const url = readEnv("VITE_SUPABASE_URL");
  const key = readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) {
    console.warn("[sitemap] Supabase creds not available at build — skipping per-article URLs.");
    return;
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/articles?select=slug,updated_at&is_published=eq.true`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) {
      console.warn(`[sitemap] articles fetch returned ${res.status} — skipping per-article URLs.`);
      return;
    }
    const rows = (await res.json()) as Array<{ slug: string; updated_at?: string | null }>;
    rows.forEach((a) => {
      if (!a?.slug) return;
      list.push({
        path: `/articles/${a.slug}`,
        changefreq: "monthly",
        priority: "0.6",
        lastmod: a.updated_at ? new Date(a.updated_at).toISOString().slice(0, 10) : undefined,
      });
    });
    console.log(`[sitemap] added ${rows.length} article URL(s).`);
  } catch (e) {
    console.warn("[sitemap] articles fetch failed — skipping per-article URLs:", (e as Error).message);
  }
}

function generateSitemap(list: SitemapEntry[]) {
  const urls = list.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
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

async function main() {
  await appendArticles(entries);
  writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
  console.log(`sitemap.xml written (${entries.length} entries)`);
}

main();
