import { useState, useEffect } from "react";
import Seo from "@/components/Seo";
import { useLocation } from "react-router-dom";
import { useFaqItems, useSiteSettings } from "@/hooks/useSupabaseData";
import { track as pixelTrack } from "@/lib/metaPixel";

export default function ContactPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const location = useLocation();
  const { data: faqData, isLoading: faqLoading } = useFaqItems();
  const { data: settings } = useSiteSettings();

  const whatsapp = settings?.whatsapp_number || "";
  const email = settings?.contact_email || "";
  const address = settings?.office_address || "";

  const faqItems = (faqData || []).map(f => ({ q: f.question, a: f.answer }));

  useEffect(() => { document.title = "Help & Contact | BundledMum"; }, []);

  useEffect(() => {
    if (location.hash === "#faqs") {
      setTimeout(() => {
        document.getElementById("faqs")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [location]);

  const contactCards = [
    whatsapp ? { icon: "💬", t: "WhatsApp Us", sub: "Fastest response", cta: "Chat Now", bg: "#E8F9F0", c: "#25D366", href: `https://wa.me/${whatsapp}?text=Hi%20BundledMum!%20I%20have%20a%20question.` } : null,
    email ? { icon: "📧", t: "Email Us", sub: email, cta: "Send Email", bg: "hsl(145,33%,92%)", c: "#2D6A4F", href: `mailto:${email}` } : null,
    address ? { icon: "📍", t: "Lagos Office", sub: address, cta: "Get Directions", bg: "#FFF0EA", c: "#F4845F", href: "https://maps.google.com/?q=Lagos+Nigeria" } : null,
  ].filter(Boolean) as { icon: string; t: string; sub: string; cta: string; bg: string; c: string; href: string }[];

  return (
    <div className="min-h-screen pt-[68px]">
      <Seo
        title="Contact BundledMum — Customer Support"
        description="Get in touch with the BundledMum team for product help, delivery questions, or partnership enquiries. We reply on WhatsApp and email."
      />
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-5 md:px-10 py-10 md:py-[72px]">
        <div className="max-w-[680px] mx-auto text-center">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground mb-3">Help & Contact</h1>
          <p className="text-primary-foreground/70 text-sm md:text-base">We're here for you — before, during, and after your order.</p>
        </div>
      </div>
      <div className="max-w-[920px] mx-auto px-5 md:px-10 py-8 md:py-[72px]">
        {contactCards.length > 0 && (
          <div className="grid md:grid-cols-3 gap-3 md:gap-5 mb-10 md:mb-16">
            {contactCards.map(ct => (
              <div key={ct.t} className="bg-card rounded-card shadow-card p-5 md:p-7 text-center">
                <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-2xl mx-auto mb-3" style={{ background: ct.bg }}>{ct.icon}</div>
                <h3 className="font-bold text-[15px] mb-1">{ct.t}</h3>
                <p className="text-text-med text-[13px] mb-3.5">{ct.sub}</p>
                <a href={ct.href} onClick={() => pixelTrack("Contact", { content_name: ct.t })} target="_blank" rel="noopener noreferrer" className="inline-block rounded-pill px-5 py-2.5 text-[13px] font-semibold text-primary-foreground font-body" style={{ background: ct.c }}>{ct.cta}</a>
              </div>
            ))}
          </div>
        )}
        <h2 id="faqs" className="pf text-xl md:text-[34px] text-forest mb-5 text-center scroll-mt-24">Frequently Asked Questions</h2>
        {faqLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="bg-card rounded-[14px] shadow-card h-16 animate-pulse" />)}
          </div>
        ) : faqItems.length === 0 ? (
          <p className="text-center text-text-med text-sm">No FAQs yet. Check back soon!</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {faqItems.map((item, i) => (
              <div key={i} className="bg-card rounded-[14px] shadow-card overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full px-5 py-4 md:py-5 flex justify-between items-center text-left font-body font-semibold text-[13px] md:text-[15px] gap-2.5">
                  <span>{item.q}</span>
                  <span className={`text-lg text-forest flex-shrink-0 transition-transform ${openFaq === i ? "rotate-45" : ""}`}>+</span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 md:pb-5 text-text-med text-sm leading-[1.8] animate-fade-in">{item.a}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
