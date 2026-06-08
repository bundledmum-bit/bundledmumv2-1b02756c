import { useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Seo from "@/components/Seo";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, MessageCircle } from "lucide-react";
import ArticleBlockRenderer from "@/components/article/ArticleBlockRenderer";
import ArticleCard, { type ArticleCardData } from "@/components/article/ArticleCard";
import type { ProductWithBrands } from "@/components/article/ArticleProductCard";
import { SITE_URL, OG_FALLBACK_IMAGE, buildAbsoluteUrl } from "@/lib/seo";

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

  // Unique product slugs referenced by `product` blocks in the body.
  const productSlugs = useMemo<string[]>(() => {
    if (!article?.body || !Array.isArray(article.body)) return [];
    return Array.from(new Set(
      (article.body as any[])
        .filter((b) => b?.type === "product" && b.product_slug)
        .map((b) => b.product_slug as string)
    ));
  }, [article]);

  // Bulk-fetch the referenced products + their brand variants in one go
  // (brands_public = RLS-safe public view, same source ProductPage uses).
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["article-products", productSlugs.slice().sort().join(",")],
    enabled: productSlugs.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, slug, name, image_url, brands:brands_public(id, brand_name, price, in_stock, image_url, stored_image_url, sku), product_sizes(id, size_label, size_code, in_stock, display_order), product_colors(id, color_name, color_hex, in_stock, display_order)")
        .in("slug", productSlugs)
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, ProductWithBrands>();
      (data || []).forEach((p: any) => map.set(p.slug, p as ProductWithBrands));
      return map;
    },
  });

  // Bump the existing Navbar cart icon after an add (no new floating CTA).
  const triggerCartBump = useCallback(() => {
    window.dispatchEvent(new CustomEvent("cart-bump"));
  }, []);

  // schema.org Article JSON-LD for rich results.
  const articleJsonLd = useMemo(() => {
    if (!article) return null;
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.meta_description || article.excerpt || "",
      image: [buildAbsoluteUrl(article.hero_image_url) || OG_FALLBACK_IMAGE],
      datePublished: article.published_at || undefined,
      dateModified: article.updated_at || article.published_at || undefined,
      author: { "@type": "Organization", name: "BundledMum", url: SITE_URL },
      publisher: {
        "@type": "Organization",
        name: "BundledMum",
        logo: { "@type": "ImageObject", url: OG_FALLBACK_IMAGE },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/articles/${article.slug}` },
      articleSection: article.segment === "pregnancy" ? "Pregnancy" : "Parenting",
    };
  }, [article]);

  // Related articles: 2 published articles from the same segment,
  // excluding the current one. Only runs once the article is loaded.
  const { data: relatedArticles } = useQuery({
    queryKey: ["related_articles", article?.segment, article?.slug],
    enabled: !!article?.segment && !!article?.slug,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("articles")
        .select("slug, segment, title, excerpt, hero_image_url, hero_image_alt, read_time_minutes")
        .eq("is_published", true)
        .eq("segment", article.segment)
        .neq("slug", article.slug)
        .order("display_order", { ascending: true })
        .limit(2);
      if (error) throw error;
      return (data || []) as ArticleCardData[];
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
        title={article.meta_title || `${article.title} | BundledMum`}
        description={article.meta_description || article.excerpt || ""}
        type="article"
        image={buildAbsoluteUrl(article.hero_image_url) || OG_FALLBACK_IMAGE}
        jsonLd={articleJsonLd || undefined}
      />
      {/* Article-specific OG / Twitter tags not covered by <Seo>. */}
      <Helmet>
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:site_name" content="BundledMum" />
        <meta property="og:image:alt" content={article.hero_image_alt || article.title} />
        {article.published_at && <meta property="article:published_time" content={article.published_at} />}
        {(article.updated_at || article.published_at) && (
          <meta property="article:modified_time" content={article.updated_at || article.published_at} />
        )}
        <meta property="article:section" content={article.segment === "pregnancy" ? "Pregnancy" : "Parenting"} />
      </Helmet>

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
        <ArticleBlockRenderer
          body={article.body}
          productsData={productsData}
          productsLoading={productSlugs.length > 0 && productsLoading}
          onCartBump={triggerCartBump}
        />

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

        {relatedArticles && relatedArticles.length > 0 && (
          <section className="mt-16 pt-8 border-t border-border">
            <h2 className="text-xl font-bold text-foreground mb-6">You might also like</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {relatedArticles.map((related) => (
                <ArticleCard key={related.slug} article={related} />
              ))}
            </div>
          </section>
        )}
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
