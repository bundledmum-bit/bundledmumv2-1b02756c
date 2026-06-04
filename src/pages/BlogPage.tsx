import { useEffect } from "react";
import Seo from "@/components/Seo";
import { useBlogPosts } from "@/hooks/useSupabaseData";

export default function BlogPage() {
  const { data: posts, isLoading } = useBlogPosts();

  useEffect(() => { document.title = "Blog | BundledMum"; }, []);

  const articles = (posts || []).map(p => ({
    slug: p.slug,
    title: p.title,
    desc: p.excerpt || "",
    date: p.published_at ? new Date(p.published_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "",
    emoji: "📝",
    readTime: `${Math.max(1, Math.ceil((p.body?.length || 0) / 1000))} min`,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="BundledMum Blog — Guides for Nigerian Mums"
        description="Practical guides, hospital bag tips, and real stories from Nigerian mums — written by the BundledMum team."
      />
      <div className="pt-20" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="max-w-[900px] mx-auto px-4 md:px-10 py-10 md:py-16">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground mb-2">📝 The BundledMum Blog</h1>
          <p className="text-primary-foreground/65 text-sm md:text-base max-w-[500px]">Guides, checklists, and tips from real Nigerian mums to help you prepare for your baby's arrival.</p>
        </div>
      </div>
      <div className="max-w-[900px] mx-auto px-4 md:px-10 py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {[1, 2].map(i => <div key={i} className="bg-card rounded-card shadow-card h-[300px] animate-pulse" />)}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📝</div>
            <h2 className="pf text-xl mb-2">No blog posts yet</h2>
            <p className="text-text-med text-sm">Check back soon for helpful guides and tips!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {articles.map(a => (
              <div key={a.slug} className="bg-card rounded-card shadow-card card-hover overflow-hidden">
                <div className="h-40 flex items-center justify-center text-5xl" style={{ background: "linear-gradient(135deg, #E8F5E9, #FFF8F4)" }}>
                  {a.emoji}
                </div>
                <div className="p-5">
                  <div className="flex gap-2 text-text-light text-[11px] mb-2">
                    <span>{a.date}</span>
                    <span>·</span>
                    <span>{a.readTime} read</span>
                  </div>
                  <h2 className="pf text-lg font-bold mb-2 leading-tight">{a.title}</h2>
                  <p className="text-text-med text-sm leading-relaxed mb-3">{a.desc}</p>
                  <span className="text-forest text-sm font-semibold">Read more →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
