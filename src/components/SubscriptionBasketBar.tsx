import { Link } from "react-router-dom";
import { Repeat } from "lucide-react";
import { useSubscriptionDraft } from "@/hooks/useSubscription";

// Persistent subscription-basket pill. Shows when a draft has items, with a
// live product count + a Checkout link. Reads the draft via useSubscriptionDraft
// (re-renders on add/remove). Rendered as a centered floating pill so it doesn't
// stack a second full-width bar on top of the product page's sticky Add-to-Cart
// (cluttered at 375px). Each host page passes a `className` for its bottom offset.
export default function SubscriptionBasketBar({ className = "" }: { className?: string }) {
  const draft = useSubscriptionDraft();
  if (!draft || draft.items.length === 0) return null;
  const products = draft.items.length;

  return (
    <div className={`fixed left-1/2 -translate-x-1/2 z-50 px-2 w-full max-w-[440px] ${className}`}>
      <div className="flex items-center justify-between gap-2 bg-forest text-primary-foreground rounded-pill shadow-lg pl-4 pr-2 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold min-w-0">
          <Repeat className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{products} {products === 1 ? "product" : "products"} in your subscription</span>
        </span>
        <Link
          to="/subscriptions/checkout"
          className="inline-flex items-center justify-center rounded-pill bg-white text-forest px-4 min-h-9 text-xs font-bold hover:bg-white/90 flex-shrink-0"
        >
          Checkout
        </Link>
      </div>
    </div>
  );
}
