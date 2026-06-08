import { Link } from "react-router-dom";
import { Clock } from "lucide-react";

// Card shown in the /articles index grid. Whole card is a Link to the
// detail page. The hero image sits on top of a gradient fallback, so a
// missing/broken image (Stage 1: image URLs may 404) reveals the
// gradient instead of an empty box.

export interface ArticleCardData {
  slug: string;
  segment: string;
  title: string;
  excerpt: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  read_time_minutes: number | null;
}

const SEGMENT_LABEL: Record<string, string> = {
  pregnancy: "Pregnancy",
  parenting: "Parenting",
};

export default function ArticleCard({ article }: { article: ArticleCardData }) {
  return (
    <Link
      to={`/articles/${article.slug}`}
      className="group block bg-card rounded-2xl overflow-hidden border border-border shadow-card transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <div className="aspect-[4/3] bg-gradient-to-br from-forest-light to-coral-blush overflow-hidden">
        {article.hero_image_url && (
          <img
            src={article.hero_image_url}
            alt={article.hero_image_alt || article.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
      </div>
      <div className="p-5">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.14em] text-forest bg-forest-light rounded-pill px-2.5 py-1 mb-3">
          {SEGMENT_LABEL[article.segment] || article.segment}
        </span>
        <h3 className="text-lg font-semibold text-foreground leading-snug line-clamp-2 mb-1.5">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-sm text-text-med leading-relaxed line-clamp-2 mb-3">{article.excerpt}</p>
        )}
        {article.read_time_minutes != null && (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-light">
            <Clock className="w-3.5 h-3.5" /> {article.read_time_minutes} min read
          </span>
        )}
      </div>
    </Link>
  );
}
