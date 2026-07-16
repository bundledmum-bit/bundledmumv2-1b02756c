import { fmt } from "@/lib/cart";

/**
 * The shared "Totals" card used by both the customer quote page and the public
 * landing (package) page. The delivery value is passed as a node so each caller
 * can render its own delivery treatment (quote: TBD/override aware; landing:
 * estimate or FREE) while keeping the layout identical.
 */
export default function QuoteTotalsCard({
  subtotal,
  serviceFee,
  delivery,
  giftWrap,
  discount,
  total,
}: {
  subtotal: number;
  serviceFee: number;
  delivery: React.ReactNode;
  giftWrap?: { fee: number } | null;
  discount?: { amount: number; reason?: string | null } | null;
  total: number;
}) {
  return (
    <div className="bg-card quote-card border border-border rounded-xl p-5 mb-4">
      <h2 className="text-sm font-bold uppercase tracking-widest text-text-med mb-3">Totals</h2>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-text-med">Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-med">Service fee</span>
          <span>{serviceFee === 0 ? "FREE" : fmt(serviceFee)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-text-med flex-shrink-0">Delivery</span>
          {delivery}
        </div>
        {giftWrap && (
          <div className="flex justify-between">
            <span className="text-text-med">Gift wrapping</span>
            <span>{fmt(giftWrap.fee)}</span>
          </div>
        )}
        {discount && discount.amount > 0 && (
          <div className="flex justify-between text-forest">
            <span>
              Discount
              {discount.reason && (
                <span className="block text-[11px] text-text-med">{discount.reason}</span>
              )}
            </span>
            <span>- {fmt(discount.amount)}</span>
          </div>
        )}
        <div className="border-t border-border pt-3 mt-2 flex justify-between items-baseline">
          <span className="text-sm font-semibold">Total</span>
          <span className="pf text-2xl font-bold text-forest">{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
