import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Repeat, Plus, Calendar, CheckCircle2, CreditCard, XCircle, CalendarDays, Save, X, Minus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import {
  useSubscriptionSettings, WEEKDAYS, WEEKDAY_LABEL, FREQUENCY_LABEL,
  type Frequency,
} from "@/hooks/useSubscription";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface SubscriptionItemRow {
  id: string;
  quantity: number;
  unit_price: number;       // NAIRA
  frequency: string;
  is_active: boolean;
  products?: { name: string; category: string | null } | null;
  brands?: { brand_name: string; image_url: string | null; price: number | null } | null;
}
interface SubscriptionRow {
  id: string;
  status: string;
  frequency: Frequency | string;
  frequency_days: number | null;
  delivery_day: string | null;
  next_charge_date: string | null;
  edit_deadline: string | null;
  total_cycles: number | null;
  min_cycles: number | null;
  discount_pct: number | null;
  free_delivery: boolean | null;
  created_at: string;
  paystack_card_brand: string | null;
  paystack_card_last4: string | null;
  cancellation_requested_at: string | null;
  cancellation_effective_after_cycle: number | null;
  subscription_items: SubscriptionItemRow[];
}

const fmtN = (naira: number) => `₦${Math.round(naira || 0).toLocaleString("en-NG")}`;

function totalPerCycle(row: SubscriptionRow): number {
  const items = row.subscription_items || [];
  const subtotal = items
    .filter(i => i.is_active !== false)
    .reduce((sum, i) => sum + Number(i.unit_price) * Number(i.quantity), 0);
  const pct = Number(row.discount_pct) || 0;
  return Math.round(subtotal * (1 - pct / 100));
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

/** Project a future charge date given a starting date and the number of cycles to advance. */
function projectChargeDate(nextCharge: string | null, frequencyDays: number | null, cyclesToAdvance: number): string | null {
  if (!nextCharge || !frequencyDays || cyclesToAdvance < 0) return null;
  const d = new Date(nextCharge);
  d.setDate(d.getDate() + frequencyDays * cyclesToAdvance);
  return d.toISOString().slice(0, 10);
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  active:         { label: "Active",         cls: "bg-emerald-100 text-emerald-700" },
  paused:         { label: "Paused",         cls: "bg-amber-100 text-amber-700" },
  cancelled:      { label: "Cancelled",      cls: "bg-gray-100 text-gray-600" },
  payment_failed: { label: "Payment Failed", cls: "bg-red-100 text-red-700" },
  pending:        { label: "Pending",        cls: "bg-gray-100 text-gray-600" },
};

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export default function AccountSubscriptions() {
  const { user } = useCustomerAuth();
  const [params] = useSearchParams();
  const showSuccess = params.get("new") === "true";

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["my-subscriptions", user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subscriptions")
        .select(`
          id, status, frequency, frequency_days, delivery_day,
          next_charge_date, edit_deadline, total_cycles, min_cycles,
          discount_pct, free_delivery, created_at,
          paystack_card_brand, paystack_card_last4,
          cancellation_requested_at, cancellation_effective_after_cycle,
          subscription_items(
            id, quantity, unit_price, frequency, is_active,
            products(name, category),
            brands:brands_public(brand_name, image_url, price)
          )
        `)
        .eq("customer_email", user?.email)
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return []; }
      return (data || []) as SubscriptionRow[];
    },
  });

  const latest = subs[0];
  const empty = useMemo(() => !isLoading && subs.length === 0, [isLoading, subs]);

  return (
    <div className="min-h-screen bg-[#FFF8F4] pt-20 md:pt-24">
      <div className="max-w-[720px] mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="pf text-2xl font-bold flex items-center gap-2"><Repeat className="w-5 h-5 text-forest" /> My subscriptions</h1>
            <p className="text-xs text-text-med mt-0.5">Manage your recurring BundledMum deliveries.</p>
          </div>
          <Link
            to="/subscriptions"
            className="inline-flex items-center gap-1.5 rounded-pill bg-forest text-primary-foreground px-3 py-2 text-xs font-semibold hover:bg-forest-deep"
          >
            <Plus className="w-3.5 h-3.5" /> New subscription
          </Link>
        </header>

        {showSuccess && latest && (
          <section className="bg-emerald-50 border-2 border-emerald-600 rounded-card p-4 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              <h2 className="pf text-lg font-bold text-emerald-800">Your subscription is active!</h2>
            </div>
            <p className="text-xs text-emerald-900/80">We'll deliver every {WEEKDAY_LABEL[latest.delivery_day || ""] || latest.delivery_day} starting {formatDate(latest.next_charge_date)}.</p>
          </section>
        )}

        {isLoading && (
          <p className="text-sm text-text-light text-center py-8">Loading your subscriptions…</p>
        )}

        {empty && (
          <section className="bg-card border border-border rounded-card p-6 text-center space-y-2">
            <Repeat className="w-10 h-10 text-forest/50 mx-auto" />
            <h2 className="pf text-lg font-bold">No active subscriptions</h2>
            <p className="text-xs text-text-med max-w-sm mx-auto">
              Subscribe to the products you use every week or month and we'll deliver them on a schedule that works for you — with a standing discount and free delivery.
            </p>
            <Link
              to="/subscriptions"
              className="inline-flex items-center gap-1.5 rounded-pill bg-forest text-primary-foreground px-4 py-2 text-xs font-semibold hover:bg-forest-deep mt-2"
            >
              Browse subscribable products →
            </Link>
          </section>
        )}

        {!isLoading && subs.length > 0 && (
          <div className="space-y-3">
            {subs.map(s => <SubscriptionCard key={s.id} row={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Subscription card
// -------------------------------------------------------------------------

function SubscriptionCard({ row }: { row: SubscriptionRow }) {
  const { data: settings } = useSubscriptionSettings();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [brandEditFor, setBrandEditFor] = useState<SubscriptionItemRow | null>(null);
  const [addProductsOpen, setAddProductsOpen] = useState(false);

  const status = STATUS_STYLE[row.status] || { label: row.status, cls: "bg-muted text-text-med" };
  const freqLabel = FREQUENCY_LABEL[(row.frequency as Frequency)] || row.frequency;
  const total = totalPerCycle(row);
  const editableNextCycle = row.status !== "cancelled";

  // Quantity change — applies from the next cycle (DB update only; no
  // effect on deliveries already scheduled in the current paid cycle).
  const changeQty = async (itemId: string, nextQty: number) => {
    if (nextQty < 1) return;
    const { error } = await (supabase as any)
      .from("subscription_items")
      .update({ quantity: nextQty })
      .eq("id", itemId);
    if (error) { toast.error(error.message); return; }
    toast.success("Quantity updated — takes effect from your next cycle.");
    qc.invalidateQueries({ queryKey: ["my-subscriptions"] });
  };

  return (
    <article className="bg-card border border-border rounded-card p-4 space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-sm">Subscription</div>
          <div className="text-[11px] text-text-light">Started {formatDate(row.created_at)}</div>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold capitalize ${status.cls}`}>{status.label}</span>
      </header>

      {row.cancellation_requested_at && (
        <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          Cancellation requested — your subscription will stop after delivery #{row.cancellation_effective_after_cycle}.
        </div>
      )}

      <dl className="text-xs space-y-1">
        <div className="flex items-center justify-between"><dt className="text-text-light">Delivery day</dt><dd className="font-semibold">{WEEKDAY_LABEL[row.delivery_day || ""] || row.delivery_day || "—"} · every {freqLabel.toLowerCase()}</dd></div>
        <div className="flex items-center justify-between"><dt className="text-text-light">Next delivery</dt><dd className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(row.next_charge_date)}</dd></div>
        {row.paystack_card_brand && row.paystack_card_last4 && (
          <div className="flex items-center justify-between"><dt className="text-text-light">Card</dt><dd className="inline-flex items-center gap-1"><CreditCard className="w-3 h-3" /> {row.paystack_card_brand} ending {row.paystack_card_last4}</dd></div>
        )}
        {row.total_cycles != null && row.min_cycles != null && (
          <div className="flex items-center justify-between"><dt className="text-text-light">Deliveries completed</dt><dd className="tabular-nums">{row.total_cycles} / {row.min_cycles} minimum</dd></div>
        )}
      </dl>

      {row.subscription_items?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Items in your box</h3>
          <ul className="divide-y divide-border/40">
            {row.subscription_items.filter(it => it.is_active !== false).map(it => (
              <li key={it.id} className="py-2 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{it.brands?.brand_name || ""} {it.products?.name || "Product"}</div>
                    <div className="text-[10px] text-text-light">Qty: {it.quantity} · {fmtN(it.unit_price)} per delivery</div>
                  </div>
                  {editableNextCycle && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setBrandEditFor(it)}
                        className="inline-flex items-center gap-1 border border-input rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                      >
                        <Pencil className="w-3 h-3" /> Change brand
                      </button>
                      <div className="inline-flex items-center gap-0.5 rounded-lg border border-input px-0.5 py-0.5 bg-background">
                        <button
                          onClick={() => changeQty(it.id, Math.max(1, it.quantity - 1))}
                          disabled={it.quantity <= 1}
                          aria-label="Decrease quantity"
                          className="w-6 h-6 inline-flex items-center justify-center text-text-med disabled:opacity-40"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums">{it.quantity}</span>
                        <button
                          onClick={() => changeQty(it.id, it.quantity + 1)}
                          aria-label="Increase quantity"
                          className="w-6 h-6 inline-flex items-center justify-center text-text-med"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-light bg-muted/40 border border-border/60 rounded-lg px-3 py-2">
            Your current cycle items are locked. Changes take effect from your next cycle on {formatDate(row.next_charge_date)}.
          </p>
          {editableNextCycle && (
            <button
              onClick={() => setAddProductsOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill border border-forest text-forest px-3 py-2 text-xs font-semibold hover:bg-forest/5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Products to Next Cycle
            </button>
          )}
        </section>
      )}

      <div className="pt-2 border-t border-border flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest font-semibold text-text-med">Total per delivery</span>
        <span className="text-sm font-bold tabular-nums text-forest">{fmtN(total)} <span className="text-emerald-700 font-semibold">· FREE delivery</span></span>
      </div>
      <p className="text-[11px] text-text-light">
        <b>Price this cycle:</b> {fmtN(total)} per delivery <span className="text-text-light">(locks at renewal to current prices)</span>
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        {settings?.delivery_day_changeable && row.status !== "cancelled" && !row.cancellation_requested_at && (
          <button onClick={() => setDayOpen(true)} className="inline-flex items-center gap-1.5 border border-input rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            <CalendarDays className="w-3.5 h-3.5" /> Change delivery day
          </button>
        )}
        {row.status !== "cancelled" && !row.cancellation_requested_at && (
          <button onClick={() => setCancelOpen(true)} className="inline-flex items-center gap-1.5 text-destructive border border-destructive/40 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-destructive/10 ml-auto">
            <XCircle className="w-3.5 h-3.5" /> Cancel subscription
          </button>
        )}
      </div>

      {dayOpen && <ChangeDeliveryDayModal row={row} onClose={() => setDayOpen(false)} />}
      {cancelOpen && <CancelModal row={row} onClose={() => setCancelOpen(false)} />}
      {brandEditFor && <ChangeBrandModal item={brandEditFor} onClose={() => setBrandEditFor(null)} />}
      {addProductsOpen && <AddProductsModal row={row} onClose={() => setAddProductsOpen(false)} />}
    </article>
  );
}

// -------------------------------------------------------------------------
// Change delivery day modal
// -------------------------------------------------------------------------

function ChangeDeliveryDayModal({ row, onClose }: { row: SubscriptionRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [day, setDay] = useState<string>(row.delivery_day || "monday");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("subscriptions")
      .update({ delivery_day: day })
      .eq("id", row.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Delivery day updated");
    qc.invalidateQueries({ queryKey: ["my-subscriptions"] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Change delivery day</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map(d => (
              <button
                key={d.v}
                onClick={() => setDay(d.v)}
                className={`px-3 py-2 rounded-pill text-xs font-semibold border min-w-[52px] ${
                  day === d.v
                    ? "bg-forest text-primary-foreground border-forest"
                    : "bg-background text-text-med border-input hover:border-forest/60"
                }`}
              >
                {d.short}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-light">Change applies to your next delivery onwards.</p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={save} disabled={saving || day === row.delivery_day} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Cancel modal
// -------------------------------------------------------------------------

function CancelModal({ row, onClose }: { row: SubscriptionRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const totalCycles = Number(row.total_cycles) || 0;
  const minCycles = Number(row.min_cycles) || 0;
  const belowMin = totalCycles < minCycles;
  const remainingOnMin = Math.max(0, minCycles - totalCycles);
  const effectiveAfter = belowMin ? minCycles : Math.max(minCycles, totalCycles);
  // Project when that delivery will happen.
  const extraCycles = Math.max(0, effectiveAfter - totalCycles - 1);
  const projectedDate = projectChargeDate(row.next_charge_date, row.frequency_days, extraCycles);

  const confirm = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("subscriptions")
      .update({
        cancellation_requested_at: new Date().toISOString(),
        cancellation_effective_after_cycle: effectiveAfter,
      })
      .eq("id", row.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cancellation scheduled");
    qc.invalidateQueries({ queryKey: ["my-subscriptions"] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm inline-flex items-center gap-1.5"><XCircle className="w-4 h-4 text-destructive" /> Cancel subscription</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          {belowMin ? (
            <p className="text-text-med">
              You have <b>{remainingOnMin}</b> delivery{remainingOnMin === 1 ? "" : "s"} remaining on your minimum commitment. Your subscription will be cancelled after delivery #{minCycles}{projectedDate ? ` on ${formatDate(projectedDate)}` : ""}.
            </p>
          ) : (
            <p className="text-text-med">
              Are you sure you want to cancel? Your subscription will stop after your current cycle.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Keep my subscription</button>
            <button onClick={confirm} disabled={saving} className="inline-flex items-center gap-1.5 bg-destructive text-destructive-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40">
              {belowMin ? `Confirm — cancel after delivery ${minCycles}` : "Confirm cancellation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Change brand modal — swap the brand for an item (next cycle)
// -------------------------------------------------------------------------

interface BrandRow { id: string; brand_name: string; price: number; in_stock: boolean | null }

function ChangeBrandModal({ item, onClose }: { item: SubscriptionItemRow & { product_id?: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Pull all in-stock brands for the item's product.
  const { data: brands = [], isLoading } = useQuery({
    queryKey: ["subscription-item-brands", item.id],
    queryFn: async () => {
      const { data: lookup } = await (supabase as any)
        .from("subscription_items")
        .select("product_id")
        .eq("id", item.id)
        .maybeSingle();
      const productId = lookup?.product_id;
      if (!productId) return [];
      const { data, error } = await (supabase as any)
        .from("brands_public")
        .select("id, brand_name, price, in_stock")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });
      if (error) return [];
      return (data || []).filter((b: BrandRow) => b.in_stock !== false) as BrandRow[];
    },
    staleTime: 60_000,
  });

  const save = async () => {
    const b = brands.find(x => x.id === selectedId);
    if (!b) { toast.error("Pick a brand."); return; }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("subscription_items")
      .update({ brand_id: b.id, unit_price: b.price })
      .eq("id", item.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Brand updated — takes effect from your next cycle.");
    qc.invalidateQueries({ queryKey: ["my-subscriptions"] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Change brand</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-text-med">Choose a new brand for <b>{item.products?.name}</b>.</p>
          {isLoading ? (
            <p className="text-xs text-text-light">Loading brands…</p>
          ) : brands.length === 0 ? (
            <p className="text-xs text-text-light">No alternative brands in stock.</p>
          ) : (
            <ul className="divide-y divide-border/60 border border-border rounded-lg overflow-hidden">
              {brands.map(b => (
                <li key={b.id}>
                  <label className={`flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-muted/40 ${selectedId === b.id ? "bg-forest/5" : ""}`}>
                    <div>
                      <div className="text-sm font-semibold">{b.brand_name}</div>
                      <div className="text-[11px] text-text-light">{fmtN(b.price)} per delivery</div>
                    </div>
                    <input
                      type="radio"
                      name="brand"
                      checked={selectedId === b.id}
                      onChange={() => setSelectedId(b.id)}
                      className="accent-forest"
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-text-light">Applies from your next cycle. Current-cycle deliveries aren't affected.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={save} disabled={saving || !selectedId} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Add products modal — add new items to a subscription (next cycle)
// -------------------------------------------------------------------------

interface SubscribableProduct {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  brands: BrandRow[];
}

function AddProductsModal({ row, onClose }: { row: SubscriptionRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [selections, setSelections] = useState<Record<string, { brand_id: string; qty: number }>>({});
  const [saving, setSaving] = useState(false);

  const existingProductIds = useMemo(() => {
    const s = new Set<string>();
    for (const it of row.subscription_items || []) {
      // SubscriptionItemRow doesn't include product_id directly — use the embedded products(name) row's key-shape.
      const pid = (it as any).product_id;
      if (pid) s.add(pid);
    }
    return s;
  }, [row.subscription_items]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["add-products-options"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, category, subcategory, brands:brands_public(id, brand_name, price, in_stock)")
        .eq("is_subscribable", true)
        .eq("is_active", true)
        .order("category")
        .order("name");
      if (error) return [];
      return (data || []) as SubscribableProduct[];
    },
    staleTime: 60_000,
  });

  // Exclude products already in the subscription.
  const options = useMemo(() => products.filter(p => !existingProductIds.has(p.id)), [products, existingProductIds]);

  const pickBrand = (product: SubscribableProduct, brandId: string) => {
    setSelections(prev => ({
      ...prev,
      [product.id]: { brand_id: brandId, qty: prev[product.id]?.qty ?? 1 },
    }));
  };
  const pickQty = (productId: string, qty: number) => {
    setSelections(prev => ({
      ...prev,
      [productId]: { brand_id: prev[productId]?.brand_id || "", qty: Math.max(1, qty) },
    }));
  };

  const addOne = async (product: SubscribableProduct) => {
    const sel = selections[product.id];
    const brandId = sel?.brand_id || product.brands.find(b => b.in_stock !== false)?.id;
    if (!brandId) { toast.error("No in-stock brands for this product."); return; }
    const brand = product.brands.find(b => b.id === brandId);
    if (!brand) return;
    const qty = sel?.qty ?? 1;

    setSaving(true);
    const { error } = await (supabase as any).from("subscription_items").insert({
      subscription_id: row.id,
      product_id: product.id,
      brand_id: brand.id,
      quantity: qty,
      unit_price: brand.price,
      frequency: row.frequency,
      is_active: true,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Product added — included from your next cycle.");
    qc.invalidateQueries({ queryKey: ["my-subscriptions"] });
    setSelections(prev => { const next = { ...prev }; delete next[product.id]; return next; });
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[92svh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-sm">Add products to next cycle</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-xs text-text-med">
            New items take effect from your next cycle on <b>{formatDate(row.next_charge_date)}</b>. Items already in your subscription aren't shown.
          </p>
          {isLoading ? (
            <p className="text-xs text-text-light">Loading products…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-text-light">You've already added every subscribable product.</p>
          ) : (
            <ul className="space-y-2">
              {options.map(p => {
                const inStock = p.brands.filter(b => b.in_stock !== false);
                if (inStock.length === 0) return null;
                const sel = selections[p.id];
                const pickedBrandId = sel?.brand_id || inStock[0].id;
                const qty = sel?.qty ?? 1;
                return (
                  <li key={p.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{p.name}</div>
                        <div className="text-[10px] text-text-light">{p.subcategory || p.category || ""}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-0.5">Brand</label>
                        <select
                          value={pickedBrandId}
                          onChange={e => pickBrand(p, e.target.value)}
                          className="w-full rounded-lg border border-input px-2 py-1.5 text-xs bg-background"
                        >
                          {inStock.map(b => (
                            <option key={b.id} value={b.id}>{b.brand_name} — {fmtN(b.price)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-0.5">Qty</label>
                        <div className="inline-flex items-center gap-0.5 rounded-lg border border-input px-0.5 py-0.5 bg-background">
                          <button onClick={() => pickQty(p.id, qty - 1)} disabled={qty <= 1} className="w-7 h-7 inline-flex items-center justify-center text-text-med disabled:opacity-40"><Minus className="w-3 h-3" /></button>
                          <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">{qty}</span>
                          <button onClick={() => pickQty(p.id, qty + 1)} className="w-7 h-7 inline-flex items-center justify-center text-text-med"><Plus className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => addOne(p)}
                      disabled={saving}
                      className="w-full rounded-pill bg-forest text-primary-foreground py-2 text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
                    >
                      Add to subscription
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end flex-shrink-0">
          <button onClick={onClose} className="text-xs font-semibold text-forest hover:underline px-3 py-2">Done</button>
        </div>
      </div>
    </div>
  );
}
