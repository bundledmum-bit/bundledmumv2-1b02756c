import { useMemo } from "react";
import { MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSiteSettings } from "@/hooks/useSupabaseData";

export interface RecoveryContext {
  customer?: {
    name?: string;
    phone?: string;
    state?: string;
    city?: string;
  } | null;
  items?: Array<{ name?: string; qty?: number; price?: number }> | null;
  order?: { total?: number } | null;
}

/**
 * Friendly modal that opens when a TECHNICAL checkout failure happens
 * (5xx, network drop, Paystack init failure, unexpected exception).
 * Validation errors keep their inline toast UI and never reach here.
 *
 * The CTA opens a wa.me link pre-filled with the customer's contact
 * details, delivery state, cart total, and items so the fulfilment
 * team can pick up the order from the message and complete it
 * manually. Falls back to mailto when whatsapp_number is empty in
 * site_settings.
 */
export default function WhatsAppRecoveryModal({
  isOpen,
  onClose,
  context,
}: {
  isOpen: boolean;
  onClose: () => void;
  context?: RecoveryContext;
}) {
  const { data: settings } = useSiteSettings();
  const rawWhatsapp = String(settings?.whatsapp_number ?? "").replace(/^"|"$/g, "");
  const whatsappDigits = rawWhatsapp.replace(/\D/g, "");
  const contactEmail = String(settings?.contact_email ?? "").replace(/^"|"$/g, "") || "hello@bundledmum.ng";

  const message = useMemo(() => {
    const c = context?.customer || {};
    const items = Array.isArray(context?.items) ? context!.items! : [];
    const total = Number(context?.order?.total || 0);
    const itemLines = items.length
      ? items.map((i: any) => `- ${i.qty || 1}x ${i.name || "Item"} (₦${Number(i.price || 0).toLocaleString("en-NG")})`).join("\n")
      : "- (no cart items captured)";
    const deliveryParts = [c?.state, c?.city].filter(Boolean).join(", ");
    return [
      "Hi BundledMum! I was trying to place an order but got an error. Please help me complete it.",
      "",
      `Name: ${c?.name || "Not provided"}`,
      `Phone: ${c?.phone || "Not provided"}`,
      `Delivery: ${deliveryParts || "Not provided"}`,
      "",
      `Cart total: ₦${total.toLocaleString("en-NG")}`,
      "",
      "Items:",
      itemLines,
    ].join("\n");
  }, [context]);

  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`
    : `mailto:${contactEmail}?subject=${encodeURIComponent("Help me complete my BundledMum order")}&body=${encodeURIComponent(message)}`;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[440px] p-0 overflow-hidden">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-left">
              Let's help you complete your order
            </DialogTitle>
            <DialogDescription className="text-sm text-text-med text-left leading-relaxed mt-2">
              We're experiencing a small hiccup placing your order right now. Don't worry — tap below and our team will personally help you complete your order on WhatsApp in minutes.
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-text-light mt-2">
            Or email us at <a href={`mailto:${contactEmail}`} className="text-forest font-semibold hover:underline">{contactEmail}</a>
          </p>

          <a
            href={whatsappHref}
            target={whatsappDigits ? "_blank" : undefined}
            rel="noopener noreferrer"
            onClick={() => {
              // Close the modal once they've tapped through — keeps the
              // door open to retry if WhatsApp doesn't open for some
              // reason without trapping them behind the dialog.
              setTimeout(onClose, 200);
            }}
            className="mt-5 inline-flex items-center justify-center gap-2 w-full bg-[#25D366] hover:opacity-90 text-white text-sm font-bold px-6 py-3 rounded-pill"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp us to complete order
          </a>
          <button
            onClick={onClose}
            className="mt-3 w-full text-center text-sm font-semibold text-text-med hover:text-foreground py-2"
          >
            Try again
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
