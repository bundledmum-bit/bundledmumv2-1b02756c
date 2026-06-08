import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Seo from "@/components/Seo";
import { Skeleton } from "@/components/ui/skeleton";
import ArticleCard, { type ArticleCardData } from "@/components/article/ArticleCard";

// /articles index. Fetches published articles and groups them into the
// two segments (Pregnancy / Parenting). The `articles` table is not yet
// in the generated Supabase types, so the query is cast through `any`
// (same pattern used across the codebase for newer tables).

const SEGMENTS: { key: string; label: string }[] = [
  { key: "pregnancy", label: "Pregnancy" },
  { key: "parenting", label: "Parenting" },
];

export default function ArticlesIndexPage() {
  const { data: articles, isLoading, isError } = useQuery({
    queryKey: ["articles-index"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("articles")
        .select("slug, segment, title, excerpt, hero_image_url, hero_image_alt, read_time_minutes")
        .eq("is_published", true)
        .order("display_order", { ascending: true })
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ArticleCardData[];
    },
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <Seo
        title="Articles for Nigerian Mums | BundledMum"
        description="Practical, mum-tested guides on pregnancy, hospital bags, newborn care and parenting — written for Nigerian mums."
        type="website"
      />

      {/* Hero */}
      <section className="bg-warm-cream pt-24 md:pt-28 pb-12 md:pb-16 px-5">
        <div className="max-w-[1100px] mx-auto text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-coral mb-4">BundledMum Journal</p>
          <h1 className="pf text-[40px] md:text-6xl font-light leading-[1.05] text-foreground tracking-tight mb-5">
            Articles for Nigerian Mums
          </h1>
          <p className="text-text-med text-base md:text-lg leading-relaxed max-w-[600px] mx-auto">
            Practical, mum-tested guides — from packing your hospital bag to your baby&rsquo;s first months.
          </p>
        </div>
      </section>

      <div className="max-w-[1100px] mx-auto px-5 mt-12 md:mt-16 space-y-16">
        {SEGMENTS.map((seg) => {
          const items = (articles || []).filter((a) => a.segment === seg.key);
          return (
            <section key={seg.key}>
              <div className="flex items-baseline justify-between mb-6 border-b border-border pb-3">
                <h2 className="pf text-2xl md:text-3xl font-light text-foreground">{seg.label}</h2>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 3 }).map((_, i) => <ArticleCardSkeleton key={i} />)}
                </div>
              ) : isError ? (
                <p className="text-text-med text-sm py-8 text-center">Articles unavailable, please try again.</p>
              ) : items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border py-12 text-center text-text-light text-sm">
                  More {seg.label.toLowerCase()} articles coming soon.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map((a) => <ArticleCard key={a.slug} article={a} />)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ArticleCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-border">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="p-5 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
