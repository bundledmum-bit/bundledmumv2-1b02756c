import { useEffect } from "react";
import Seo from "@/components/Seo";
import BundleSections from "@/components/BundleSections";
import Breadcrumb from "@/components/Breadcrumb";

export default function BundlesPage() {
  useEffect(() => { document.title = "Our Bundles & Kits | BundledMum"; }, []);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-8">
      <Seo
        title="Maternity + Baby Essentials & Hospital Bag Lists | BundledMum"
        description="Browse curated maternity bundles, postpartum recovery kits, and baby shower gift boxes — sorted by budget and delivered across Nigeria."
      />
      <div
        className="pt-[68px]"
        style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1A3D2E 100%)" }}
      >
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-14">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground mb-2.5">
            🎁 Bundles & Kits
          </h1>
          <p className="text-primary-foreground/70 text-sm md:text-base max-w-[620px] leading-relaxed">
            Pre-packed gift boxes and recovery kits — curated, sourced, and shipped without a single market run.
            Pick the tier that fits and we'll handle the rest.
          </p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12">
        <Breadcrumb items={[{ label: "Bundles & Kits" }]} className="mb-6" />
        <BundleSections variant="bundles" />
      </div>
    </div>
  );
}
