import { Link } from "react-router-dom";
import { PageRow } from "@/hooks/usePage";

/**
 * Renders a page row from the `pages` table using the shared storefront
 * hero + prose body layout. Used by DynamicPage and by the static pages
 * (Privacy/Terms/Cookies/Returns/About) when DB content is available.
 */
export default function DbPageContent({ page }: { page: PageRow }) {
  return (
    <div className="min-h-screen pt-[68px]">
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-5 md:px-10 py-10 md:py-16">
        <div className="max-w-[780px] mx-auto text-center">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground">{page.title}</h1>
          {page.hero_text && (
            <p className="text-primary-foreground/70 text-sm mt-2">{page.hero_text}</p>
          )}
        </div>
      </div>
      <div className="max-w-[780px] mx-auto px-5 md:px-10 py-10 md:py-16 font-body">
        <div
          className="prose prose-slate max-w-none prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-8 prose-h2:mb-4 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900"
          dangerouslySetInnerHTML={{ __html: page.content || "" }}
        />
        <div className="mt-8 text-center">
          <Link to="/" className="text-forest font-semibold underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
