import { Link } from "react-router-dom";
import logoWhite from "@/assets/logos/footer-logo.png";
import { Facebook, Instagram, MessageCircle } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSupabaseData";

export default function Footer() {
  const { data: settings } = useSiteSettings();

  const whatsapp = settings?.whatsapp_number || "";
  const tagline = "​...making being a mum easier.";
  const social = (typeof settings?.social_links === "object" && settings.social_links) ? settings.social_links as Record<string, string> : {};

  return (
    <footer style={{ background: "#1A1A1A" }} className="px-5 md:px-10 pt-10 md:pt-14 pb-20 md:pb-9">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-7 md:gap-14 mb-8 md:mb-12">
          <div className="col-span-2 md:col-span-1">
            <img src={logoWhite} alt="BundledMum" className="h-11 w-auto mb-3.5" />
            {tagline && <p className="text-primary-foreground/45 text-[13px] leading-[1.8] max-w-[260px]">{tagline}</p>}
            <div className="flex gap-2.5 mt-4">
              {social.facebook && (
                <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Follow us on Facebook" className="w-8 h-8 bg-primary-foreground/[0.08] rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-foreground/20 transition-colors">
                  <Facebook className="w-4 h-4 text-primary-foreground/60" />
                </a>
              )}
              {social.instagram && (
                <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Follow us on Instagram" className="w-8 h-8 bg-primary-foreground/[0.08] rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-foreground/20 transition-colors">
                  <Instagram className="w-4 h-4 text-primary-foreground/60" />
                </a>
              )}
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" className="w-8 h-8 bg-[#25D366] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#20bd5a] transition-colors">
                  <MessageCircle className="w-4 h-4 text-primary-foreground" />
                </a>
              )}
            </div>
          </div>
          {[
            { title: "Shop", links: [{ label: "Baby Items", to: "/shop?tab=baby" }, { label: "Mum Items", to: "/shop?tab=mum" }, { label: "Bundles & Kits", to: "/bundles" }, { label: "Gift Ideas", to: "/bundles?hospital=gift" }] },
            { title: "Help", links: [{ label: "FAQs", to: "/contact#faqs" }, ...(whatsapp ? [{ label: "WhatsApp Us", to: `https://wa.me/${whatsapp}?text=Hi%20BundledMum!%20I%20have%20a%20question.`, external: true }] : []), { label: "Track Order", to: "/track-order" }, { label: "Returns", to: "/returns" }] },
            { title: "Company", links: [{ label: "Our Story", to: "/about" }, { label: "Contact", to: "/contact" }, { label: "Blog", to: "/blog" }] },
          ].map(col => (
            <div key={col.title}>
              <div className="text-primary-foreground font-semibold text-[13px] mb-3.5">{col.title}</div>
              {col.links.map(l => (
                'external' in l && l.external ? (
                  <a key={l.label} href={l.to} target="_blank" rel="noopener noreferrer" className="block text-primary-foreground/40 text-xs mb-2 cursor-pointer hover:text-primary-foreground/70 transition-colors">{l.label}</a>
                ) : (
                  <Link key={l.label} to={l.to} className="block text-primary-foreground/40 text-xs mb-2 cursor-pointer hover:text-primary-foreground/70 transition-colors">{l.label}</Link>
                )
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-primary-foreground/[0.07] pt-5 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-primary-foreground/30">
          <p>© {new Date().getFullYear()} BundledMum. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-primary-foreground/60 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-primary-foreground/60 transition-colors">Terms</Link>
            <Link to="/cookies" className="hover:text-primary-foreground/60 transition-colors">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
