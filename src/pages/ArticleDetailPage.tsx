import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Seo from "@/components/Seo";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, MessageCircle } from "lucide-react";
import ArticleBlockRenderer from "@/components/article/ArticleBlockRenderer";

// /articles/:slug detail. Fetches the published article by slug and
// renders its structured JSONB body via ArticleBlockRenderer.

const SEGMENT_LABEL: Record<string, string> = {
  pregnancy: "Pregnancy",
  parenting: "Parenting",
};

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ["article", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("articles")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) return <ArticleDetailSkeleton />;

  if (isError || !article) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-5">
        <Seo title="Article not found | BundledMum" description="This article could not be found." noindex />
        <div className="text-center">
          <p className="text-5xl mb-4">📄</p>
          <h1 className="pf text-2xl font-light mb-2">Article not found</h1>
          <p className="text-text-med text-sm mb-6 max-w-[340px] mx-auto">
            The article you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
          </p>
          <Link to="/articles" className="inline-flex items-center gap-1.5 text-forest font-semibold text-sm hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to articles
          </Link>
        </div>
      </div>
    );
  }

  const shareUrl = `https://bundledmum.com/articles/${article.slug}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(`I found this helpful from BundledMum: ${article.title} ${shareUrl}`)}`;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Seo
        title={article.meta_title || article.title}
        description={article.meta_description || article.excerpt || ""}
        type="article"
        image={article.hero_image_url || undefined}
      />

      {/* Hero */}
      <section className="bg-warm-cream pt-24 md:pt-28 pb-10 md:pb-14 px-5">
        <div className="max-w-3xl mx-auto">
          <Link to="/articles" className="inline-flex items-center gap-1.5 text-text-med text-xs uppercase tracking-[0.16em] hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-3.5 h-3.5" /> All articles
          </Link>
          <div>
            <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.14em] text-forest bg-forest-light rounded-pill px-2.5 py-1 mb-4">
              {SEGMENT_LABEL[article.segment] || article.segment}
            </span>
          </div>
          <h1 className="pf text-[34px] md:text-5xl font-light leading-[1.08] text-foreground tracking-tight mb-4 break-words">
            {article.title}
          </h1>
          {article.excerpt && (
            <p className="text-text-med text-base md:text-lg leading-relaxed mb-4">{article.excerpt}</p>
          )}
          {article.read_time_minutes != null && (
            <span className="inline-flex items-center gap-1.5 text-xs text-text-light">
              <Clock className="w-3.5 h-3.5" /> {article.read_time_minutes} min read
            </span>
          )}
        </div>
      </section>

      {/* Hero image — gradient fallback behind, broken image reveals it */}
      {article.hero_image_url && (
        <div className="max-w-3xl mx-auto px-5">
          <div className="aspect-[16/9] rounded-2xl overflow-hidden bg-gradient-to-br from-forest-light to-coral-blush mt-6 md:mt-8">
            <img
              src={article.hero_image_url}
              alt={article.hero_image_alt || article.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        </div>
      )}

      {/* Body */}
      <article className="max-w-3xl mx-auto px-5 mt-10 md:mt-14">
        <ArticleBlockRenderer body={article.body} />

        <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link to="/articles" className="inline-flex items-center gap-1.5 text-forest font-semibold text-sm hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to articles
          </Link>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-[#25D366] text-[#25D366] px-4 py-2.5 text-sm font-semibold hover:bg-[#25D366]/5 transition-colors min-h-[44px]"
          >
            <MessageCircle className="w-4 h-4" /> Share on WhatsApp
          </a>
        </div>
      </article>
    </div>
  );
}

function ArticleDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <section className="bg-warm-cream pt-24 md:pt-28 pb-10 px-5">
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
      </section>
      <div className="max-w-3xl mx-auto px-5 mt-8 space-y-4">
        <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
        <Skeleton className="h-5 w-full" />
      </div>
    </div>
  );
}
