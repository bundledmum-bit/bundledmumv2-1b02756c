import { Link } from "react-router-dom";
import { PageRow } from "@/hooks/usePage";

/**
 * Renders a page row from the `pages` table using the shared storefront
 * hero + prose body layout. Used by DynamicPage and by the static pages
 * (Privacy/Terms/Cookies/Returns/About) when DB content is available.
 */
export default function DbPageContent({ page }: { page: PageRow }) {
  // Legal pages prefer last_updated_label over hero_text — when both are set
  // the date stamp wins. hero_text only surfaces when last_updated_label is
  // absent (legacy rows that pre-date the new column).
  const subtitle = page.last_updated_label || page.hero_text || "";
  return (
    <div className="min-h-screen pt-[68px]">
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-5 md:px-10 py-10 md:py-16">
        <div className="max-w-[780px] mx-auto text-center">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground">{page.title}</h1>
          {subtitle && (
            <p className="text-primary-foreground/70 text-sm mt-2">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="max-w-[780px] mx-auto px-5 md:px-10 py-10 md:py-16 prose prose-sm text-text-med font-body prose-headings:pf prose-headings:text-forest prose-headings:text-xl prose-headings:mb-3 prose-p:mb-4 prose-p:leading-relaxed prose-strong:text-forest prose-a:text-forest prose-a:underline max-w-none">
        <div dangerouslySetInnerHTML={{ __html: page.content || "" }} />
        <div className="mt-8 text-center not-prose">
          <Link to="/" className="text-forest font-semibold underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
