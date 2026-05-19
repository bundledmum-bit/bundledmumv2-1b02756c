import { Link } from "react-router-dom";
import Seo from "@/components/Seo";
import { useEffect } from "react";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { usePage } from "@/hooks/usePage";
import DbPageContent from "@/components/DbPageContent";

export default function PrivacyPage() {
  useEffect(() => { document.title = "Privacy Policy | BundledMum"; }, []);
  const { data: settings } = useSiteSettings();
  const { data: dbPage } = usePage("privacy");
  const whatsapp = settings?.whatsapp_number || "";
  const contactEmail = settings?.contact_email || "";

  if (dbPage && dbPage.content) return <DbPageContent page={dbPage} />;

  return (
    <div className="min-h-screen pt-[68px]">
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-5 md:px-10 py-10 md:py-16">
        <div className="max-w-[780px] mx-auto text-center">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground">Privacy Policy</h1>
          <p className="text-primary-foreground/70 text-sm mt-2">Last updated: April 2026</p>
        </div>
      </div>
      <div className="max-w-[780px] mx-auto px-5 md:px-10 py-10 md:py-16 prose prose-sm text-text-med font-body">
        <h2 className="pf text-forest text-xl mb-3">1. Information We Collect</h2>
        <p className="mb-4 leading-relaxed">When you place an order, we collect your name, email address, phone number, delivery address, and payment details (processed securely via Paystack). We do not store your card information.</p>

        <h2 className="pf text-forest text-xl mb-3">2. How We Use Your Information</h2>
        <p className="mb-4 leading-relaxed">We use your personal information to process and deliver your orders, send order confirmations and tracking updates via email and WhatsApp, improve our products and services, and respond to your enquiries.</p>

        <h2 className="pf text-forest text-xl mb-3">3. Data Sharing</h2>
        <p className="mb-4 leading-relaxed">We share your information only with Paystack (payment processing), delivery partners (to fulfil your order), and Google Sheets (for internal order management). We never sell your data to third parties.</p>

        <h2 className="pf text-forest text-xl mb-3">4. Data Security</h2>
        <p className="mb-4 leading-relaxed">All payments are processed through Paystack's PCI-DSS compliant platform. We use HTTPS encryption on our website and limit access to personal data to authorised team members only.</p>

        <h2 className="pf text-forest text-xl mb-3">5. Your Rights</h2>
        <p className="mb-4 leading-relaxed">You may request access to, correction of, or deletion of your personal data at any time by contacting us at {contactEmail || "our contact email"}. We will respond within 14 business days.</p>

        <h2 className="pf text-forest text-xl mb-3">6. Cookies</h2>
        <p className="mb-4 leading-relaxed">We use essential cookies to save your cart and preferences. We do not use tracking cookies or third-party analytics cookies. Your cart data is stored locally in your browser.</p>

        <h2 className="pf text-forest text-xl mb-3">7. Contact</h2>
        <p className="mb-4 leading-relaxed">For any privacy-related questions, contact us at {contactEmail ? <a href={`mailto:${contactEmail}`} className="text-forest underline">{contactEmail}</a> : "our contact email"}{whatsapp ? <> or via <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-forest underline">WhatsApp</a></> : ""}.</p>

        <div className="mt-8 text-center">
          <Link to="/" className="text-forest font-semibold underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
