import { Link } from "react-router-dom";
import Seo from "@/components/Seo";
import { useEffect } from "react";
import { useDeliverySettings, useSiteSettings } from "@/hooks/useSupabaseData";
import { usePage } from "@/hooks/usePage";
import DbPageContent from "@/components/DbPageContent";
import { fmt } from "@/lib/cart";

export default function TermsPage() {
  useEffect(() => { document.title = "Terms & Conditions | BundledMum"; }, []);

  const { data: deliveryZones } = useDeliverySettings();
  const { data: settings } = useSiteSettings();
  const { data: dbPage } = usePage("terms");
  const serviceFee = parseInt(settings?.service_fee) || 0;
  const contactEmail = settings?.contact_email || "";

  if (dbPage && dbPage.content) return <DbPageContent page={dbPage} />;

  // Build delivery summary from Supabase zones
  const deliverySummary = (deliveryZones || []).map(z => {
    const days = z.delivery_days_min === z.delivery_days_max
      ? `${z.delivery_days_min} business day${z.delivery_days_min > 1 ? "s" : ""}`
      : `${z.delivery_days_min}–${z.delivery_days_max} business days`;
    const freeText = z.free_delivery_threshold
      ? "Free delivery is available on qualifying orders that meet the threshold."
      : "";
    const feeText = `A delivery fee applies${z.free_delivery_threshold ? " unless your order qualifies for free delivery" : ""}.`;
    return `${z.zone_name}: ${days}. ${freeText} ${feeText}`.trim();
  }).join(" ");

  return (
    <div className="min-h-screen pt-[68px]">
      <Seo
        title="Terms of Service | BundledMum"
        description="The terms that govern your use of BundledMum — including orders, delivery, payments, and account responsibilities."
      />
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-5 md:px-10 py-10 md:py-16">
        <div className="max-w-[780px] mx-auto text-center">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground">Terms & Conditions</h1>
          <p className="text-primary-foreground/70 text-sm mt-2">Last updated: April 2026</p>
        </div>
      </div>
      <div className="max-w-[780px] mx-auto px-5 md:px-10 py-10 md:py-16 prose prose-sm text-text-med font-body">
        <h2 className="pf text-forest text-xl mb-3">1. General</h2>
        <p className="mb-4 leading-relaxed">By using bundledmum.ng, you agree to these terms. BundledMum is operated by BundledMum Nigeria Ltd, registered in Lagos, Nigeria.</p>

        <h2 className="pf text-forest text-xl mb-3">2. Products & Pricing</h2>
        <p className="mb-4 leading-relaxed">All prices are in Nigerian Naira (₦) and include applicable taxes. Prices may change without prior notice. A {fmt(serviceFee)} service and packaging fee applies to all orders.</p>

        <h2 className="pf text-forest text-xl mb-3">3. Orders & Payment</h2>
        <p className="mb-4 leading-relaxed">Orders are confirmed once payment is received. We accept card payments (Visa, Mastercard, Verve), bank transfers, and USSD via Paystack. Bank transfer orders must be completed within 24 hours.</p>

        <h2 className="pf text-forest text-xl mb-3">4. Delivery</h2>
        <p className="mb-4 leading-relaxed">{deliverySummary || "Delivery details are being loaded..."}</p>

        <h2 className="pf text-forest text-xl mb-3">5. Returns & Exchanges</h2>
        <p className="mb-4 leading-relaxed">Unused, sealed items may be returned within 7 days of delivery. Contact us on WhatsApp to arrange a return. Refunds are processed within 5–7 business days. Opened or used items cannot be returned for hygiene reasons.</p>

        <h2 className="pf text-forest text-xl mb-3">6. Limitation of Liability</h2>
        <p className="mb-4 leading-relaxed">BundledMum is not liable for delays caused by courier services or events outside our control. Our maximum liability is limited to the order value.</p>

        <h2 className="pf text-forest text-xl mb-3">7. Contact</h2>
        <p className="mb-4 leading-relaxed">Questions about these terms? Email {contactEmail ? <a href={`mailto:${contactEmail}`} className="text-forest underline">{contactEmail}</a> : "us"}.</p>

        <div className="mt-8 text-center">
          <Link to="/" className="text-forest font-semibold underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
