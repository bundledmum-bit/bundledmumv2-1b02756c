/**
 * Branded subscription-delivery invoice, print-ready.
 *
 * Uses the shared `@media print` rule in index.css which hides body *
 * except .payslip-print, .employment-letter — so we re-use the
 * .payslip-print class here as the visibility hook. Content sized for
 * A4 with the BundledMum forest / coral palette.
 */

function fmtN(n: number | null | undefined): string {
  return `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;
}
function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const base = d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
    if (!withTime) return base;
    const time = d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
    return `${base} · ${time}`;
  } catch { return iso; }
}

/** Try to extract "Delivery N of M" from an order notes blob. */
function extractDeliveryNumber(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Delivery\s+(\d+)\s+of\s+(\d+)/i);
  return m ? `Delivery ${m[1]} of ${m[2]}` : null;
}
function extractNotesField(notes: string | null | undefined, label: string): string | null {
  if (!notes) return null;
  const re = new RegExp(`${label}\\s*:\\s*([^\\n·]+)`, "i");
  const m = notes.match(re);
  return m ? m[1].trim() : null;
}

interface OrderItem {
  product_name?: string | null;
  product_id?: string | null;
  brand_name?: string | null;
  brand_id?: string | null;
  quantity: number;
  unit_price: number;  // NAIRA
}
interface OrderLike {
  id: string;
  order_number: string | null;
  created_at: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_partner: string | null;
  estimated_weight_kg: number | null;
  subtotal: number | null;
  total: number | null;
  payment_status: string | null;
  notes: string | null;
  items: OrderItem[];
}
interface SubInfo {
  frequency: string | null;
  delivery_day: string | null;
  cycle_size: number | null;
  price_locked_date: string | null;
  next_charge_date: string | null;
}

export default function SubscriptionInvoice({
  order, subscription,
}: {
  order: OrderLike;
  subscription?: SubInfo;
}) {
  const invoiceNumber = order.order_number || `SUB-${order.id.slice(0, 8).toUpperCase()}`;
  const deliveryLabel = extractDeliveryNumber(order.notes);
  const freq = subscription?.frequency || extractNotesField(order.notes, "Frequency");
  const deliveryDay = subscription?.delivery_day || extractNotesField(order.notes, "Delivery day") || extractNotesField(order.notes, "Delivery Day");
  const courier = order.delivery_partner || "To be assigned";
  const subtotal = Number(order.subtotal) || 0;
  const total = Number(order.total) || 0;
  const discount = Math.max(0, subtotal - total);

  return (
    <div className="payslip-print bg-white text-black p-8 max-w-[820px] mx-auto text-[13px] leading-snug">
      <header className="flex items-start justify-between pb-4 border-b-2" style={{ borderColor: "#2D6A4F" }}>
        <div>
          <div className="text-2xl font-black" style={{ color: "#F4845F" }}>BundledMum</div>
          <div className="text-[11px] text-black/60 mt-0.5">hr@bundledmum.com · Lagos, Nigeria</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: "#2D6A4F" }}>Subscription Delivery Invoice</div>
          <div className="text-lg font-bold mt-1">Invoice #{invoiceNumber}</div>
          <div className="text-xs text-black/60">{fmtDate(order.created_at)}</div>
          {deliveryLabel && (
            <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold" style={{ backgroundColor: "#2D6A4F", color: "white" }}>
              {deliveryLabel}
            </div>
          )}
        </div>
      </header>

      {/* Bill-to + Subscription box */}
      <section className="grid grid-cols-[1fr_280px] gap-4 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-black/50 mb-1">Bill to</div>
          <div className="font-semibold">{order.customer_name || "—"}</div>
          {order.customer_email && <div className="text-black/70">{order.customer_email}</div>}
          {order.customer_phone && <div className="text-black/70">{order.customer_phone}</div>}
          <div className="mt-2 text-black/70 text-xs leading-relaxed whitespace-pre-line">
            {[order.delivery_address, order.delivery_city, order.delivery_state].filter(Boolean).join("\n")}
          </div>
        </div>
        <div className="rounded-lg p-3 border-2" style={{ borderColor: "#2D6A4F", backgroundColor: "rgba(45,106,79,0.04)" }}>
          <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: "#2D6A4F" }}>Subscription details</div>
          <dl className="text-xs space-y-0.5">
            <Row label="Frequency" v={freq || "—"} />
            <Row label="Delivery Day" v={deliveryDay ? cap(deliveryDay) : "—"} />
            <Row label="Courier" v={courier} />
            {order.estimated_weight_kg != null && (
              <Row label="Est. Weight" v={`${Number(order.estimated_weight_kg).toFixed(1)} kg`} />
            )}
          </dl>
        </div>
      </section>

      {/* Items */}
      <section>
        <div className="overflow-x-auto">
        <table className="w-full text-xs border-t border-black/20">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="bg-black/5 text-left">
              <th className="px-2 py-1.5 w-8">#</th>
              <th className="px-2 py-1.5">Product</th>
              <th className="px-2 py-1.5">Brand</th>
              <th className="px-2 py-1.5 text-right w-14">Qty</th>
              <th className="px-2 py-1.5 text-right w-24">Unit Price</th>
              <th className="px-2 py-1.5 text-right w-24">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((it, i) => (
              <tr key={i} className="border-t border-black/10">
                <td className="px-2 py-1.5 text-black/60">{i + 1}</td>
                <td className="px-2 py-1.5">{it.product_name || "—"}</td>
                <td className="px-2 py-1.5 text-black/70">{it.brand_name || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{it.quantity}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(it.unit_price)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(it.unit_price * it.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="flex justify-end mt-3">
          <dl className="text-xs space-y-0.5 w-[280px]">
            <Row label="Subtotal" v={fmtN(subtotal)} />
            {discount > 0 && <Row label="Subscription discount" v={`−${fmtN(discount)}`} />}
            <Row label="Delivery" v={<span style={{ color: "#2D6A4F", fontWeight: 700 }}>FREE</span>} />
            <div className="flex items-center justify-between pt-1 mt-1 border-t-2 font-black" style={{ borderColor: "#2D6A4F" }}>
              <span>TOTAL</span>
              <span className="tabular-nums" style={{ color: "#2D6A4F" }}>{fmtN(total)}</span>
            </div>
          </dl>
        </div>
      </section>

      {/* Payment */}
      <section className="mt-4 rounded-lg px-4 py-3 text-xs" style={{ backgroundColor: "rgba(45,106,79,0.06)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest font-bold text-black/60">Status</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-bold" style={{ backgroundColor: "#2D6A4F", color: "white" }}>
            {(order.payment_status || "paid").toUpperCase()}
          </span>
        </div>
        {subscription?.cycle_size != null && (
          <p className="mt-1 text-black/70">Payment covers {subscription.cycle_size} deliveries in this cycle.</p>
        )}
        {subscription?.price_locked_date && (
          <p className="text-black/70">Prices locked at rate on {fmtDate(subscription.price_locked_date)}.</p>
        )}
        {subscription?.next_charge_date && (
          <p className="text-black/70">Next delivery: {fmtDate(subscription.next_charge_date)}.</p>
        )}
      </section>

      <footer className="mt-6 pt-3 border-t border-black/10 text-[10px] text-black/60 text-center space-y-0.5">
        <p><b style={{ color: "#F4845F" }}>BundledMum</b> …making being a mum easier</p>
        <p>Thank you for subscribing. Manage your subscription at bundledmum.com/account/subscriptions</p>
      </footer>
    </div>
  );
}

function Row({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-black/60">{label}</dt>
      <dd className="tabular-nums text-right font-semibold">{v}</dd>
    </div>
  );
}
function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
