import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Repeat, Calendar, CreditCard, Package, Truck, Pause, Play, XCircle, CheckSquare,
  Eye, X, Save, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FREQUENCY_LABEL, WEEKDAY_LABEL, type Frequency } from "@/hooks/useSubscription";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface SubItem {
  id: string;
  quantity: number;
  unit_price: number;      // NAIRA
  frequency: string;
  is_active: boolean;
  products?: { id: string; name: string; category: string | null } | null;
  brands?: { id: string; brand_name: string; price: number | null } | null;
}
interface SubOrder {
  id: string;
  cycle_number: number | null;
  scheduled_date: string | null;
  status: string | null;
  charge_amount: number | null;
  order_id: string | null;
}
interface SubRow {
  id: string;
  status: string;
  frequency: Frequency | string;
  frequency_days: number | null;
  delivery_day: string | null;
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  next_charge_date: string | null;
  total_cycles: number | null;
  cycle_size: number | null;
  total_deliveries_paid: number | null;
  deliveries_remaining: number | null;
  discount_pct: number | null;
  price_locked_date: string | null;
  created_at: string;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  paystack_card_brand: string | null;
  paystack_card_last4: string | null;
  cancellation_requested_at: string | null;
  cancelled_at: string | null;
  paused_until: string | null;
  notes: string | null;
  subscription_items: SubItem[];
  subscription_orders: SubOrder[];
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  active:         { label: "Active",         cls: "bg-emerald-100 text-emerald-700" },
  paused:         { label: "Paused",         cls: "bg-amber-100 text-amber-700" },
  cancelled:      { label: "Cancelled",      cls: "bg-gray-100 text-gray-600" },
  completed:      { label: "Completed",      cls: "bg-gray-100 text-gray-600" },
  payment_failed: { label: "Payment Failed", cls: "bg-red-100 text-red-700" },
  pending:        { label: "Pending",        cls: "bg-gray-100 text-gray-600" },
};

const fmtN = (n: number | null | undefined) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;
function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function fmtDateFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
}
function totalPerCycle(row: SubRow): { subtotal: number; discount: number; total: number } {
  const subtotal = (row.subscription_items || [])
    .filter(i => i.is_active !== false)
    .reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);
  const pct = Number(row.discount_pct) || 0;
  const discount = Math.round(subtotal * (pct / 100));
  return { subtotal, discount, total: subtotal - discount };
}

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

type Tab = "all" | "active" | "cancelled" | "payment_failed" | "completed";

export default function AdminSubscriptions() {
  const [tab, setTab] = useState<Tab>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subscriptions")
        .select(`
          id, status, frequency, frequency_days, delivery_day,
          customer_email, customer_name, customer_phone,
          next_charge_date, total_cycles, cycle_size,
          total_deliveries_paid, deliveries_remaining,
          discount_pct, price_locked_date, created_at,
          delivery_address, delivery_city, delivery_state,
          paystack_card_brand, paystack_card_last4,
          cancellation_requested_at, cancelled_at, paused_until, notes,
          subscription_items(
            id, quantity, unit_price, frequency, is_active,
            products(id, name, category),
            brands(id, brand_name, price)
          ),
          subscription_orders(
            id, cycle_number, scheduled_date, status,
            charge_amount, order_id
          )
        `)
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return []; }
      return (data || []) as SubRow[];
    },
    staleTime: 30_000,
  });

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const active = subs.filter(s => s.status === "active").length;
    const cancelled = subs.filter(s => s.status === "cancelled" || s.status === "completed").length;
    const payment_failed = subs.filter(s => s.status === "payment_failed").length;
    const today_deliveries = subs.filter(s => s.next_charge_date === today).length;
    return { active, cancelled, payment_failed, today_deliveries };
  }, [subs, today]);

  const filtered = useMemo(() => {
    if (tab === "all") return subs;
    if (tab === "cancelled") return subs.filter(s => s.status === "cancelled");
    if (tab === "completed") return subs.filter(s => s.status === "completed");
    return subs.filter(s => s.status === tab);
  }, [subs, tab]);

  const selected = subs.find(s => s.id === detailId) || null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="pf text-2xl font-bold flex items-center gap-2"><Repeat className="w-6 h-6 text-forest" /> Subscriptions</h1>
        <p className="text-xs text-text-light mt-0.5">Manage recurring customer subscriptions, delivery schedules, and cancellations.</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active subscriptions" value={stats.active} tone="emerald" />
        <Stat label="Cancelled" value={stats.cancelled} />
        <Stat label="Payment failed" value={stats.payment_failed} tone={stats.payment_failed > 0 ? "red" : undefined} />
        <Stat label="Today's deliveries" value={stats.today_deliveries} tone={stats.today_deliveries > 0 ? "emerald" : undefined} />
      </section>

      <nav className="flex gap-1 border-b border-border flex-wrap">
        {([
          { k: "all",            label: "All" },
          { k: "active",         label: "Active" },
          { k: "cancelled",      label: "Cancelled" },
          { k: "payment_failed", label: "Payment Failed" },
          { k: "completed",      label: "Completed" },
        ] as Array<{ k: Tab; label: string }>).map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === t.k ? "border-forest text-forest" : "border-transparent text-text-med hover:text-forest"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Frequency</th>
                <th className="px-3 py-2">Delivery Day</th>
                <th className="px-3 py-2">Next Delivery</th>
                <th className="px-3 py-2">Cycle</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="px-3 py-8 text-center text-text-light">Loading…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-text-light">No subscriptions match.</td></tr>}
              {filtered.map(s => {
                const style = STATUS_STYLE[s.status] || { label: s.status, cls: "bg-muted text-text-med" };
                const activeItems = (s.subscription_items || []).filter(i => i.is_active !== false).length;
                return (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-semibold">{s.customer_name || s.customer_email.split("@")[0]}</td>
                    <td className="px-3 py-2 text-text-light">{s.customer_email}</td>
                    <td className="px-3 py-2">{FREQUENCY_LABEL[s.frequency as Frequency] || s.frequency}</td>
                    <td className="px-3 py-2">{WEEKDAY_LABEL[s.delivery_day || ""] || s.delivery_day || "—"}</td>
                    <td className="px-3 py-2 text-text-med">{fmtDateLong(s.next_charge_date)}</td>
                    <td className="px-3 py-2 tabular-nums text-[11px]">
                      {s.total_cycles ?? 0} of {s.total_deliveries_paid ?? 0}
                      {s.deliveries_remaining != null && <span className="text-text-light"> ({s.deliveries_remaining} left)</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{activeItems}</td>
                    <td className="px-3 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold capitalize ${style.cls}`}>{style.label}</span></td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setDetailId(s.id)} className="inline-flex items-center gap-1 text-forest text-xs font-semibold hover:underline"><Eye className="w-3 h-3" /> View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <SubscriptionDrawer row={selected} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "red" }) {
  const cls = tone === "red" ? "text-red-600" : tone === "emerald" ? "text-emerald-700" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Detail drawer
// -------------------------------------------------------------------------

function SubscriptionDrawer({ row, onClose }: { row: SubRow; onClose: () => void }) {
  const qc = useQueryClient();
  const style = STATUS_STYLE[row.status] || { label: row.status, cls: "bg-muted text-text-med" };
  const totals = totalPerCycle(row);
  const freqLabel = FREQUENCY_LABEL[row.frequency as Frequency] || row.frequency;

  const [busy, setBusy] = useState(false);
  const [pausedUntil, setPausedUntil] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(row.notes || "");
  const [courierOpen, setCourierOpen] = useState(false);

  const update = async (patch: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    const { error } = await (supabase as any).from("subscriptions").update(patch).eq("id", row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(successMsg);
    qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  };

  const pause = async () => {
    if (!pausedUntil) { toast.error("Pick a pause-until date."); return; }
    await update({ status: "paused", paused_until: pausedUntil }, "Subscription paused");
  };
  const resume = async () => update({ status: "active", paused_until: null }, "Subscription resumed");
  const cancel = async () => {
    if (!confirm("Cancel this subscription? It will stop after the remaining paid deliveries.")) return;
    await update({
      cancellation_requested_at: new Date().toISOString(),
      cancellation_effective_after_cycle: Math.max(row.total_deliveries_paid ?? 0, row.total_cycles ?? 0),
    }, "Cancellation scheduled");
  };
  const forceComplete = async () => {
    if (!confirm("Force-complete this subscription? This should only be used for manual close-outs.")) return;
    await update({ status: "completed", cancelled_at: new Date().toISOString() }, "Subscription marked as completed");
  };
  const saveNote = async () => {
    await update({ notes: noteText.trim() || null }, "Note saved");
    setNoteOpen(false);
  };

  const latestOrderId = (row.subscription_orders || [])
    .sort((a, b) => (b.cycle_number || 0) - (a.cycle_number || 0))[0]?.order_id;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="flex-1 bg-foreground/40" />
      <aside className="w-full max-w-[720px] h-full bg-background border-l border-border overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm">Subscription</h2>
            <p className="text-[10px] text-text-light">{row.customer_name || row.customer_email}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold capitalize ${style.cls}`}>{style.label}</span>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        </header>

        <div className="p-5 space-y-5 text-sm">
          {/* 1. Customer + subscription info */}
          <section className="space-y-1">
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1">Customer &amp; subscription</h3>
            <Kv k="Name"  v={row.customer_name || "—"} />
            <Kv k="Email" v={row.customer_email} />
            <Kv k="Phone" v={row.customer_phone || "—"} />
            <Kv k="Frequency" v={freqLabel} />
            <Kv k="Delivery day" v={WEEKDAY_LABEL[row.delivery_day || ""] || row.delivery_day || "—"} />
            {row.paystack_card_brand && row.paystack_card_last4 && (
              <Kv k="Card" v={<span className="inline-flex items-center gap-1"><CreditCard className="w-3 h-3" /> {row.paystack_card_brand} ending {row.paystack_card_last4}</span>} />
            )}
            <Kv k="Started" v={fmtDateFull(row.created_at)} />
            <Kv k="Price locked" v={`${fmtDateFull(row.price_locked_date)} (resets on each renewal)`} />
          </section>

          {/* 2. Delivery schedule */}
          <section className="space-y-1">
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Delivery schedule</h3>
            <Kv k="Next delivery" v={fmtDateFull(row.next_charge_date)} />
            <Kv k="Deliveries this cycle" v={`${row.total_cycles ?? 0} of ${row.total_deliveries_paid ?? 0}`} />
            <Kv k="Remaining in cycle" v={`${row.deliveries_remaining ?? 0}`} />
            <Kv k="Cycle size" v={`${row.cycle_size ?? 0} deliveries`} />
            {row.cancellation_requested_at && (
              <div className="mt-2 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Cancellation requested {fmtDateFull(row.cancellation_requested_at)}. Subscription ends after remaining {row.deliveries_remaining ?? 0} deliveries.
                </span>
              </div>
            )}
          </section>

          {/* 3. Items in this cycle */}
          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Items in this cycle</h3>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-2 py-1.5">Brand</th>
                    <th className="px-2 py-1.5">Product</th>
                    <th className="px-2 py-1.5 text-right w-12">Qty</th>
                    <th className="px-2 py-1.5 text-right w-20">Unit</th>
                    <th className="px-2 py-1.5 text-right w-20">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {(row.subscription_items || []).filter(i => i.is_active !== false).map(it => (
                    <tr key={it.id} className="border-t border-border/40">
                      <td className="px-2 py-1.5">{it.brands?.brand_name || "—"}</td>
                      <td className="px-2 py-1.5">{it.products?.name || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{it.quantity}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(it.unit_price)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(it.unit_price * it.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="text-xs space-y-0.5 mt-2">
              <Kv k="Subtotal" v={fmtN(totals.subtotal)} />
              <Kv k={`Discount (${row.discount_pct ?? 0}%)`} v={`−${fmtN(totals.discount)}`} />
              <Kv k="Delivery" v={<span className="text-emerald-700 font-semibold">FREE</span>} />
              <div className="flex items-center justify-between pt-1 border-t border-border/60 font-bold">
                <span>Total per delivery</span>
                <span className="tabular-nums text-forest">{fmtN(totals.total)}</span>
              </div>
            </dl>
          </section>

          {/* 4. Delivery address + courier assign */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Delivery address</h3>
              {latestOrderId && (
                <button onClick={() => setCourierOpen(true)} className="text-xs font-semibold text-forest hover:underline">Assign courier</button>
              )}
            </div>
            <div className="text-xs text-text-med bg-muted/30 rounded-lg px-3 py-2 whitespace-pre-line">
              {[row.delivery_address, row.delivery_city, row.delivery_state].filter(Boolean).join("\n") || "—"}
            </div>
            {courierOpen && latestOrderId && (
              <CourierAssignPanel orderId={latestOrderId} onClose={() => setCourierOpen(false)} />
            )}
          </section>

          {/* 5. Delivery history */}
          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1">Delivery history</h3>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 w-14">Cycle</th>
                    <th className="px-2 py-1.5">Scheduled</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5 text-right w-24">Amount</th>
                    <th className="px-2 py-1.5 text-right">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {(row.subscription_orders || []).length === 0 && <tr><td colSpan={5} className="px-2 py-3 text-center text-text-light">No deliveries yet.</td></tr>}
                  {(row.subscription_orders || [])
                    .slice()
                    .sort((a, b) => (a.cycle_number || 0) - (b.cycle_number || 0))
                    .map(o => (
                      <tr key={o.id} className="border-t border-border/40">
                        <td className="px-2 py-1.5 tabular-nums">#{o.cycle_number ?? "—"}</td>
                        <td className="px-2 py-1.5 text-text-med">{fmtDateLong(o.scheduled_date)}</td>
                        <td className="px-2 py-1.5 capitalize">{(o.status || "—").replace(/_/g, " ")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(o.charge_amount)}</td>
                        <td className="px-2 py-1.5 text-right">
                          {o.order_id ? (
                            <Link to={`/admin/orders/${o.order_id}`} className="text-forest font-semibold hover:underline">View order →</Link>
                          ) : <span className="text-text-light">—</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. Admin actions */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Admin actions</h3>
            <div className="flex flex-wrap gap-2">
              {row.status === "active" && (
                <div className="flex items-center gap-1">
                  <input type="date" value={pausedUntil} onChange={e => setPausedUntil(e.target.value)} className="border border-input rounded-lg px-2 py-1 text-xs bg-background" />
                  <button onClick={pause} disabled={busy || !pausedUntil} className="inline-flex items-center gap-1 border border-input rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                    <Pause className="w-3 h-3" /> Pause
                  </button>
                </div>
              )}
              {row.status === "paused" && (
                <button onClick={resume} disabled={busy} className="inline-flex items-center gap-1 border border-input rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                  <Play className="w-3 h-3" /> Resume
                </button>
              )}
              {row.status !== "cancelled" && row.status !== "completed" && !row.cancellation_requested_at && (
                <button onClick={cancel} disabled={busy} className="inline-flex items-center gap-1 text-destructive border border-destructive/40 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-destructive/10">
                  <XCircle className="w-3 h-3" /> Cancel subscription
                </button>
              )}
              {row.status !== "completed" && (
                <button onClick={forceComplete} disabled={busy} className="inline-flex items-center gap-1 border border-input rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                  <CheckSquare className="w-3 h-3" /> Force complete
                </button>
              )}
              <button onClick={() => { setNoteText(row.notes || ""); setNoteOpen(true); }} className="inline-flex items-center gap-1 border border-input rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                Add internal note
              </button>
            </div>

            {noteOpen && (
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block">Internal note</label>
                <textarea rows={3} value={noteText} onChange={e => setNoteText(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setNoteOpen(false)} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
                  <button onClick={saveNote} className="inline-flex items-center gap-1 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep">
                    <Save className="w-3 h-3" /> Save
                  </button>
                </div>
              </div>
            )}

            {row.notes && !noteOpen && (
              <p className="text-[11px] text-text-med bg-muted/40 rounded-lg px-3 py-2 whitespace-pre-line">{row.notes}</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-2 py-0.5"><dt className="text-text-light">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
}

// -------------------------------------------------------------------------
// Courier assignment — edits the linked order's delivery_partner / partner_cost
// -------------------------------------------------------------------------

function CourierAssignPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: order } = useQuery({
    queryKey: ["sub-courier-order", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, delivery_partner, partner_cost, courier_notes")
        .eq("id", orderId)
        .maybeSingle();
      if (error) return null;
      return data as { id: string; delivery_partner: string | null; partner_cost: number | null; courier_notes: string | null } | null;
    },
  });

  const [partner, setPartner] = useState("");
  const [cost, setCost] = useState<string>("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setPartner(order?.delivery_partner || "");
    setCost(order?.partner_cost != null ? String(order.partner_cost) : "");
    setNote(order?.courier_notes || "");
  }, [order?.delivery_partner, order?.partner_cost, order?.courier_notes]);

  const save = async () => {
    const { error } = await (supabase as any)
      .from("orders")
      .update({
        delivery_partner: partner.trim() || null,
        partner_cost: cost === "" ? null : Number(cost),
        courier_notes: note.trim() || null,
      })
      .eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    toast.success("Courier updated for next delivery");
    qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    qc.invalidateQueries({ queryKey: ["sub-courier-order", orderId] });
    onClose();
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
      <h4 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Assign courier (next delivery)</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-0.5">Courier</label>
          <input list="sub-courier-options" value={partner} onChange={e => setPartner(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-xs bg-background" placeholder="Unassigned" />
          <datalist id="sub-courier-options">
            <option value="eFTD Africa" />
            <option value="Brain Express" />
          </datalist>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-0.5">Partner cost (₦)</label>
          <input type="number" min={0} value={cost} onChange={e => setCost(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-xs bg-background" />
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-0.5">Courier note</label>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-xs bg-background" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
        <button onClick={save} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep">
          <Save className="w-3 h-3" /> Save
        </button>
      </div>
    </div>
  );
}
