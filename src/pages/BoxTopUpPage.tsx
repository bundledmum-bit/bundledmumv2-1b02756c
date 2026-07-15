import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, X, Search, Lock, AlertTriangle, CalendarDays, ZoomIn, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getBrandImage } from "@/lib/brandImage";
import { fmtN, formatBoxDate } from "@/hooks/useSubscription";
import { getDraft, boxEditable, prepareTopup, type DraftBox } from "@/lib/boxSubscription";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const coerceSetting = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") { if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) { try { return JSON.parse(v); } catch { return v; } } return v; }
  return String(v);
};

// ===========================================================================
// Tokenised single-box edit page for the 48h→24h top-up email.
//   /subscription/box/:boxId?token=:guestToken
// Loads ONE box via get_guest_subscription(token). She may be logged out — the
// token is the key. She can ADD items (pay-per-add): prepare_box_topup prices it,
// Paystack charges, then the topup-box edge fn (NO amount) verifies + adds. If
// the box is locked (inside its 24h window), it's read-only.
// ===========================================================================
export default function BoxTopUpPage() {
  const { boxId } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("token");
  const valid = isUuid(boxId) && isUuid(token);

  const { data: siteSettings } = useSiteSettings();
  const boxImageUrl = coerceSetting(siteSettings?.["subscription_box_image_url"]).trim();

  const { data: draft, refetch, isLoading: draftLoading, error: draftError } = useQuery({
    queryKey: ["topup-draft", token],
    enabled: valid,
    queryFn: () => getDraft("", token as string),
  });
  const { data: edit, isLoading: editLoading } = useQuery({
    queryKey: ["box-editable", boxId],
    enabled: valid,
    queryFn: () => boxEditable(boxId as string),
  });

  const box: DraftBox | null = useMemo(() => draft?.boxes.find(b => b.box_id === boxId) || null, [draft, boxId]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fatal, setFatal] = useState<{ reference: string; message: string } | null>(null);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[#FFF8F4] pt-20 md:pt-24 pb-24">
      <header className="px-4 md:px-8 py-6 text-primary-foreground text-center" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <img src={bmLogoCoral} alt="BundledMum" className="h-7 mx-auto mb-1.5" />
        <h1 className="pf text-xl md:text-2xl font-bold">Top up your box</h1>
      </header>
      <main className="max-w-[640px] mx-auto px-4 md:px-8 py-6 space-y-4">{children}</main>
    </div>
  );

  if (!valid) return <Shell><ErrorCard title="This link is invalid" body="The box link is missing or malformed. Please use the link from your email." /></Shell>;
  if (draftLoading || editLoading) return <Shell><p className="text-sm text-text-light text-center py-10">Loading your box…</p></Shell>;
  if (draftError || !box) return <Shell><ErrorCard title="We couldn't load this box" body="The link may have expired. If you think this is a mistake, contact us and we'll help." /></Shell>;

  const locked = edit ? !edit.editable : false;
  const hoursLeft = Number(edit?.hours_left ?? 0);
  const countdown = hoursLeft >= 48 ? `about ${Math.floor(hoursLeft / 24)} days` : hoursLeft >= 1 ? `about ${Math.floor(hoursLeft)} hours` : "under an hour";

  return (
    <Shell>
      {fatal && (
        <div className="rounded-card border-2 border-red-400 bg-red-50 p-4">
          <div className="flex items-start gap-2 text-red-800">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold">Your payment was taken but the item was not added.</p>
              <p className="mt-1">{fatal.message}</p>
              <p className="mt-1">The box locked before we could add it. Please contact us with reference <span className="font-mono font-semibold">{fatal.reference}</span> for a refund. Do not pay again.</p>
            </div>
          </div>
        </div>
      )}

      <section className="bg-card border border-border rounded-card overflow-hidden">
        <div className="relative aspect-[16/9] bg-warm-cream">
          {boxImageUrl ? <img src={boxImageUrl} alt={`Box ${box.box_number}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-forest/40 text-sm">BundledMum box</div>}
          <span className="absolute top-2 left-2 rounded-pill bg-white/90 backdrop-blur-sm text-[11px] font-bold px-2 py-0.5">Box {box.box_number}</span>
        </div>
        <div className="p-4 space-y-1.5">
          <p className="text-[12px] text-text-med inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Delivers {formatBoxDate(box.scheduled_date)}</p>
          <p className="text-[12px] text-forest font-semibold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Free delivery and 5% off this box{box.discount_amount > 0 ? ` — you save ${fmtN(box.discount_amount)}` : ""}.</p>
        </div>
      </section>

      {/* Current contents (read-only — items already paid for). */}
      <section className="bg-card border border-border rounded-card p-4">
        <h2 className="font-bold text-sm mb-2">What's in this box</h2>
        {box.items.length === 0 ? (
          <p className="text-[13px] text-text-light py-1">This box is empty.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {box.items.map(it => (
              <li key={it.item_id} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{it.quantity}× {it.product_name || "Item"} <span className="text-text-light">· {it.brand_name}</span></span>
                <span className="font-semibold tabular-nums">{fmtN(it.line_total)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border mt-2 pt-2 flex items-center justify-between text-[13px] font-bold">
          <span>Box total</span><span className="tabular-nums">{fmtN(box.total)}</span>
        </div>
      </section>

      {locked ? (
        <div className="rounded-card border border-border bg-muted/40 p-4 flex items-start gap-2 text-[13px]">
          <Lock className="w-4 h-4 text-text-med flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">This box is closed for changes.</p>
            <p className="text-text-med mt-0.5">{edit?.reason || "It's within 24 hours of delivery, so it can no longer be edited."}</p>
          </div>
        </div>
      ) : (
        <section className="bg-card border border-border rounded-card p-4 space-y-2">
          <p className="text-[13px] text-text-med">Add more to this box before it locks{hoursLeft > 0 ? ` — ${countdown} left` : ""}. Each item you add is paid for on its own.</p>
          <button type="button" onClick={() => setPickerOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-forest text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-forest-deep">
            <Plus className="w-4 h-4" /> Add items to this box
          </button>
        </section>
      )}

      {pickerOpen && box && (
        <TopUpPickerModal
          token={token as string}
          boxId={box.box_id}
          boxNumber={box.box_number}
          payerEmail={draft?.customer_email || ""}
          onClose={() => setPickerOpen(false)}
          onAdded={() => refetch()}
          onFatal={(f) => { setFatal(f); setPickerOpen(false); }}
        />
      )}
    </Shell>
  );
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-card border border-border rounded-card p-6 text-center space-y-1.5">
      <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
      <h2 className="pf text-lg font-bold">{title}</h2>
      <p className="text-sm text-text-med">{body}</p>
    </div>
  );
}

// -------------------------------------------------------------------------
// Shop-style picker for the top-up. "Add & pay" = pay-per-add (prepare →
// Paystack → topup-box, no amount). Zoom lightbox like /deals, no PDP link.
// -------------------------------------------------------------------------
interface CatalogBrand { brand_id: string; product_name: string; brand_name: string; price: number; image: string | null; description: string | null; size_variant: string | null; is_subscribable: boolean }

function TopUpPickerModal({ token, boxId, boxNumber, payerEmail, onClose, onAdded, onFatal }: {
  token: string; boxId: string; boxNumber: number; payerEmail: string;
  onClose: () => void; onAdded: () => void; onFatal: (f: { reference: string; message: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState<CatalogBrand | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["box-catalog"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brands:brands_public!brands_product_id_fkey(id, brand_name, price, in_stock, image_url, stored_image_url, images, size_variant, description, is_subscribable)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const flat: CatalogBrand[] = [];
      for (const p of (data || []) as any[]) {
        for (const b of (p.brands || [])) {
          if (b.in_stock === false) continue;
          flat.push({ brand_id: b.id, product_name: p.name, brand_name: b.brand_name, price: Number(b.price) || 0, image: getBrandImage(b) || b.images?.[0] || null, description: b.description || null, size_variant: b.size_variant || null, is_subscribable: b.is_subscribable === true });
        }
      }
      // Subscribable products first (stable), then the rest. Nothing is hidden.
      flat.sort((a, b) => (b.is_subscribable ? 1 : 0) - (a.is_subscribable ? 1 : 0));
      return flat;
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? options.filter(o => `${o.product_name} ${o.brand_name}`.toLowerCase().includes(s)) : options).slice(0, 120);
  }, [q, options]);

  // Pay-per-add: price it, charge it, then let the edge fn verify + add.
  const addAndPay = async (o: CatalogBrand) => {
    if (busyId) return;
    setBusyId(o.brand_id);
    try {
      const { charge_amount } = await prepareTopup(token, boxId, o.brand_id, 1);
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      if (!paystackKey) throw new Error("Payment is not configured (missing Paystack key).");
      const popup = new PaystackPop();
      const reference = `topup_${boxId.slice(0, 8)}_${Date.now()}`;
      popup.newTransaction({
        key: paystackKey, email: payerEmail || "", amount: Math.max(0, charge_amount) * 100, currency: "NGN", ref: reference,
        metadata: { type: "box_topup", box_id: boxId, brand_id: o.brand_id } as any,
        onSuccess: async (tx: { reference: string }) => {
          try {
            // NO amount — topup-box asks Paystack what was actually paid.
            const { data, error } = await supabase.functions.invoke("topup-box", { body: { box_id: boxId, brand_id: o.brand_id, quantity: 1, reference: tx.reference } });
            if (error) {
              const ctx = (error as any)?.context; let parsed: any = null;
              if (ctx && typeof ctx.clone === "function") { try { parsed = await ctx.clone().json(); } catch { /* ignore */ } }
              if (ctx?.status === 409 && parsed?.paid_but_not_added) { onFatal({ reference: tx.reference, message: parsed?.error || "The box locked before the item could be added." }); setBusyId(null); return; }
              toast.error(`Couldn't add the item: ${parsed?.error || error.message || "unknown error"}. Reference: ${tx.reference}`); setBusyId(null); return;
            }
            if (!(data as any)?.success) {
              if ((data as any)?.paid_but_not_added) onFatal({ reference: tx.reference, message: (data as any)?.error || "The box locked before the item could be added." });
              else toast.error(`Couldn't add the item: ${(data as any)?.error || "unknown error"}. Reference: ${tx.reference}`);
              setBusyId(null); return;
            }
            toast.success(`Added ${o.product_name} to Box ${boxNumber}.`);
            onAdded();
            setBusyId(null);
          } catch (e: any) { toast.error(`Couldn't add the item: ${e?.message || "unexpected error"}. Reference: ${tx.reference}`); setBusyId(null); }
        },
        onCancel: () => setBusyId(null),
      } as any);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't start that top-up.");
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-foreground/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-[720px] rounded-t-2xl md:rounded-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold text-sm">Add to Box {boxNumber} · pay per item</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…" className="w-full pl-9 pr-3 py-2.5 border border-input rounded-lg text-sm bg-background" />
          </div>
        </div>
        <div className="overflow-y-auto p-3">
          {isLoading ? (
            <p className="text-sm text-text-light text-center py-10">Loading products…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-text-light text-center py-10">No products match “{q}”.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map(o => (
                <div key={o.brand_id} className="rounded-[14px] border border-border bg-card overflow-hidden flex flex-col">
                  <button type="button" onClick={() => setZoom(o)} aria-label="Zoom product" className="aspect-square bg-warm-cream relative overflow-hidden w-full group">
                    {o.image ? <img src={o.image} alt={o.product_name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>}
                    {o.is_subscribable && <span className="absolute top-2 left-2 rounded-pill bg-forest text-white text-[9px] font-bold px-1.5 py-0.5">Subscription favourite</span>}
                    <span className="absolute bottom-2 right-2 bg-white/85 backdrop-blur-sm rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn className="w-3 h-3 text-foreground" /></span>
                  </button>
                  <div className="p-2.5 flex flex-col gap-1 flex-1">
                    <p className="font-semibold text-xs text-foreground line-clamp-2 leading-snug">{o.product_name}</p>
                    <span className="text-coral text-[11px] font-semibold -mt-0.5 truncate">{o.brand_name}{o.size_variant ? ` · ${o.size_variant}` : ""}</span>
                    <span className="font-mono-price text-coral font-bold text-sm">{fmtN(o.price)}</span>
                    <div className="mt-auto pt-1">
                      <button type="button" onClick={() => addAndPay(o)} disabled={!!busyId} className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-coral text-white text-xs font-semibold py-2 hover:bg-coral-dark min-h-[36px] disabled:opacity-50">
                        {busyId === o.brand_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add & pay
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-border">
          <button type="button" onClick={onClose} className="w-full rounded-lg bg-forest text-primary-foreground py-2.5 text-sm font-semibold hover:bg-forest-deep">Done</button>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-midnight/80 animate-fade-in" onClick={() => setZoom(null)}>
          <div className="relative bg-card rounded-[20px] overflow-hidden shadow-2xl max-w-[400px] w-full" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setZoom(null)} aria-label="Close" className="absolute top-3 right-3 z-10 bg-card/90 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center shadow"><X className="w-4 h-4 text-foreground" /></button>
            <div className="aspect-square bg-warm-cream overflow-hidden">
              {zoom.image ? <img src={zoom.image} alt={zoom.product_name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-7xl">📦</div>}
            </div>
            <div className="p-4">
              <p className="font-semibold text-sm text-foreground leading-snug">{zoom.product_name}</p>
              <p className="text-coral text-xs font-semibold mb-1">{zoom.brand_name}{zoom.size_variant ? ` · ${zoom.size_variant}` : ""}</p>
              <div className="flex items-baseline gap-2 mb-2"><span className="font-mono-price text-coral font-bold text-lg">{fmtN(zoom.price)}</span></div>
              {zoom.description && <p className="text-[12px] text-text-med mb-3 line-clamp-4">{zoom.description}</p>}
              <button type="button" onClick={() => addAndPay(zoom)} disabled={!!busyId} className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-coral text-white text-sm font-semibold py-2.5 hover:bg-coral-dark disabled:opacity-50">
                {busyId === zoom.brand_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add &amp; pay {fmtN(zoom.price)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
