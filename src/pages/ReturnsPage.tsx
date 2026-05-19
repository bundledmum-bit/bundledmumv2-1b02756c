import { useEffect } from "react";
import Seo from "@/components/Seo";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { usePage } from "@/hooks/usePage";
import DbPageContent from "@/components/DbPageContent";
import { fmt } from "@/lib/cart";

export default function ReturnsPage() {
  useEffect(() => { document.title = "Returns & Exchanges | BundledMum"; }, []);
  const { data: settings } = useSiteSettings();
  const { data: dbPage } = usePage("returns");
  const whatsapp = settings?.whatsapp_number || "";
  const giftWrapPrice = parseInt(settings?.gift_wrapping_price) || 0;

  if (dbPage && dbPage.content) return <DbPageContent page={dbPage} />;

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-20" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="max-w-[860px] mx-auto px-4 md:px-10 py-10 md:py-16">
          <h1 className="pf text-3xl md:text-[44px] text-primary-foreground mb-2">Returns & Exchanges</h1>
          <p className="text-primary-foreground/65 text-sm md:text-base">We want you to be completely happy with your order.</p>
        </div>
      </div>
      <div className="max-w-[860px] mx-auto px-4 md:px-10 py-8 md:py-14 prose prose-sm max-w-none">
        <div className="bg-card rounded-card shadow-card p-6 md:p-10 space-y-6">
          <section>
            <h2 className="pf text-xl text-forest mb-3">Return Window</h2>
            <p className="text-text-med text-sm leading-relaxed">You may return eligible items within <strong>7 days</strong> of delivery. The return window starts from the date your order is delivered.</p>
          </section>

          <section>
            <h2 className="pf text-xl text-forest mb-3">Eligibility Conditions</h2>
            <ul className="text-text-med text-sm space-y-2 list-disc pl-5">
              <li>Items must be <strong>unopened and in original sealed packaging</strong></li>
              <li>Items must be in the same condition as received — no damage, stains, or alterations</li>
              <li>Skincare products and food items (e.g., Labour Snack Pack) are <strong>non-returnable</strong> once the seal is broken</li>
              <li>Gift-wrapped bundles: the gift wrapping fee ({giftWrapPrice ? fmt(giftWrapPrice) : "applied at checkout"}) is non-refundable</li>
            </ul>
          </section>

          <section>
            <h2 className="pf text-xl text-forest mb-3">How to Initiate a Return</h2>
            <ol className="text-text-med text-sm space-y-2 list-decimal pl-5">
              <li>Send a WhatsApp message to {whatsapp ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-forest font-semibold underline">{whatsapp}</a> : <span className="font-semibold">our WhatsApp</span>} with your order number and reason for return</li>
              <li>Our team will respond within 2 hours during business hours (Mon–Sat, 8am–8pm)</li>
              <li>We'll arrange a pickup from your delivery address at no extra cost (Lagos only; other states may incur a return shipping fee)</li>
              <li>Once we receive and inspect the item, your refund is processed within 3–5 business days</li>
            </ol>
          </section>

          <section>
            <h2 className="pf text-xl text-forest mb-3">Refund Process</h2>
            <ul className="text-text-med text-sm space-y-2 list-disc pl-5">
              <li><strong>Card/USSD payments:</strong> Refunded to the original payment method via Paystack</li>
              <li><strong>Bank transfers:</strong> Refunded to the bank account you provide</li>
              <li>Delivery fees are refunded only if the return is due to a BundledMum error</li>
            </ul>
          </section>

          <section>
            <h2 className="pf text-xl text-forest mb-3">Exchanges</h2>
            <p className="text-text-med text-sm leading-relaxed">Need a different size for clothing items (Belly Band, Nursing Nightgown, Slippers, etc.)? We offer <strong>free size exchanges</strong> within 7 days. Contact us on WhatsApp with your order number and the size you need — we'll swap it out at no extra cost.</p>
          </section>

          <section>
            <h2 className="pf text-xl text-forest mb-3">Damaged or Incorrect Items</h2>
            <p className="text-text-med text-sm leading-relaxed">If an item arrives damaged or you received the wrong product, contact us within 48 hours with a photo. We'll send a replacement immediately at no cost to you.</p>
          </section>

          <div className="bg-forest rounded-card p-5 flex flex-col md:flex-row justify-between items-center gap-3 text-center md:text-left">
            <div>
              <h4 className="pf text-primary-foreground text-lg mb-1">Need Help?</h4>
              <p className="text-primary-foreground/65 text-sm">Chat with us — we reply within minutes.</p>
            </div>
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}?text=Hi! I'd like to return/exchange an item from my order.`}
                target="_blank" rel="noopener noreferrer"
                className="bg-[#25D366] text-primary-foreground px-5 py-3 rounded-pill font-semibold text-sm whitespace-nowrap">
                Chat on WhatsApp 💬
              </a>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-center mt-8">
          <Link to="/" className="rounded-pill bg-forest px-7 py-3 font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive text-sm">
            Continue Shopping →
          </Link>
        </div>
      </div>
    </div>
  );
}
