import { Link } from "react-router-dom";
import Seo from "@/components/Seo";
import { useEffect } from "react";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { usePage } from "@/hooks/usePage";
import DbPageContent from "@/components/DbPageContent";

export default function CookiesPage() {
  useEffect(() => { document.title = "Cookie Policy | BundledMum"; }, []);
  const { data: settings } = useSiteSettings();
  const { data: dbPage } = usePage("cookies");
  const contactEmail = settings?.contact_email || "";

  if (dbPage && dbPage.content) return <DbPageContent page={dbPage} />;

  return (
    <div className="min-h-screen pt-[68px]">
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-5 md:px-10 py-10 md:py-16">
        <div className="max-w-[780px] mx-auto text-center">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground">Cookie Policy</h1>
          <p className="text-primary-foreground/70 text-sm mt-2">Last updated: April 2026</p>
        </div>
      </div>
      <div className="max-w-[780px] mx-auto px-5 md:px-10 py-10 md:py-16 prose prose-sm text-text-med font-body">
        <h2 className="pf text-forest text-xl mb-3">What Are Cookies?</h2>
        <p className="mb-4 leading-relaxed">Cookies are small text files stored on your device when you visit a website. They help the site remember your preferences and improve your experience.</p>

        <h2 className="pf text-forest text-xl mb-3">Cookies We Use</h2>
        <p className="mb-2 leading-relaxed"><strong>Essential cookies only.</strong> We use localStorage to:</p>
        <ul className="list-disc pl-5 mb-4 space-y-1">
          <li>Save your shopping cart between visits</li>
          <li>Remember your quiz preferences</li>
        </ul>
        <p className="mb-4 leading-relaxed">We do <strong>not</strong> use advertising cookies, social media tracking cookies, or third-party analytics cookies.</p>

        <h2 className="pf text-forest text-xl mb-3">Managing Cookies</h2>
        <p className="mb-4 leading-relaxed">You can clear your browser's local storage at any time. This will reset your cart. Most browsers allow you to manage cookie preferences in their settings.</p>

        <h2 className="pf text-forest text-xl mb-3">Contact</h2>
        <p className="mb-4 leading-relaxed">Questions? Email {contactEmail ? <a href={`mailto:${contactEmail}`} className="text-forest underline">{contactEmail}</a> : "us"}.</p>

        <div className="mt-8 text-center">
          <Link to="/" className="text-forest font-semibold underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
