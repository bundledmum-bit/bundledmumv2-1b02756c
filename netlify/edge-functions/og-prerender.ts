import type { Config, Context } from "https://edge.netlify.com";

// Social crawlers don't run JS, so the client-side react-helmet OG tags
// never reach them — they'd see the generic index.html. This edge
// function intercepts /articles/:slug requests from known bots and
// returns a server-rendered HTML stub (built by the Supabase
// og-prerender function) with the article's real OG tags. Every other
// request — humans, and any failure — falls through to the SPA via
// context.next(), so the site can never break because of this.

const BOT_AGENTS = [
  "whatsapp",
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "linkedinbot",
  "slackbot-linkexpanding",
  "telegrambot",
  "discordbot",
  "bingbot",
  "applebot",
  "pinterestbot",
  "googlebot",
];

// Matches /articles/:slug only — NOT /articles or /articles/ (trailing
// slash). Slug must start and end with [a-z0-9].
const ARTICLE_PATTERN = /^\/articles\/([a-z0-9][a-z0-9-]*[a-z0-9])$/;

const OG_PRERENDER_URL =
  "https://rbtyprmkolqfylcbmgrk.supabase.co/functions/v1/og-prerender";

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();

  const match = url.pathname.match(ARTICLE_PATTERN);
  if (!match) return context.next();

  const isBot = BOT_AGENTS.some((bot) => ua.includes(bot));
  if (!isBot) return context.next();

  const slug = match[1];

  try {
    const response = await fetch(`${OG_PRERENDER_URL}?slug=${encodeURIComponent(slug)}`);
    if (!response.ok) return context.next();

    const html = await response.text();
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-OG-Prerender": "1",
      },
    });
  } catch {
    return context.next();
  }
};

export const config: Config = {
  path: "/articles/*",
};
