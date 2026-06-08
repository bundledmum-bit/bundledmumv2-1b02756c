import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Star, Trash2, MessageSquare } from "lucide-react";
import { useAllTestimonials, useUpsertTestimonial, useDeleteTestimonial, type Testimonial } from "@/hooks/useHomepage";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";
const btnPrimary = "inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40";

export default function AdminTestimonials() {
  const { data: items, isLoading } = useAllTestimonials();
  const upsert = useUpsertTestimonial();
  const del = useDeleteTestimonial();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-forest flex items-center gap-2">
          <MessageSquare className="w-6 h-6" /> Testimonials
        </h1>
        <p className="text-xs text-text-light mt-1">Customer quotes shown on the homepage testimonials rail.</p>
      </header>

      <AddForm onSave={t => upsert.mutateAsync(t).then(() => toast.success("Added"))} />

      {isLoading ? (
        <div className="text-center py-10 text-text-med text-sm">Loading testimonials…</div>
      ) : (
        <div className="space-y-2">
          {(items || []).map(t => (
            <Row
              key={t.id}
              t={t}
              onSave={payload => upsert.mutateAsync({ id: t.id, ...payload }).then(() => toast.success("Saved"))}
              onDelete={() => { if (confirm("Delete this testimonial?")) del.mutateAsync(t.id).then(() => toast.success("Deleted")); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddForm({ onSave }: { onSave: (t: Partial<Testimonial>) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Testimonial>>({
    customer_name: "", customer_city: "", customer_location: "", quote: "",
    rating: 5, product_context: "", is_verified_purchase: true, is_active: true,
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-forest-light text-forest px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest/20">
        <Plus className="w-3.5 h-3.5" /> Add testimonial
      </button>
    );
  }

  const submit = async () => {
    if (!draft.customer_name?.trim() || !draft.quote?.trim()) { toast.error("Name and quote are required"); return; }
    await onSave(draft);
    setOpen(false);
    setDraft({ customer_name: "", customer_city: "", customer_location: "", quote: "", rating: 5, product_context: "", is_verified_purchase: true, is_active: true });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <h3 className="font-semibold text-sm">New testimonial</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div><label className={labelCls}>Name</label><input value={draft.customer_name || ""} onChange={e => setDraft({ ...draft, customer_name: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls}>Initial (optional)</label><input value={draft.customer_initial || ""} onChange={e => setDraft({ ...draft, customer_initial: e.target.value })} maxLength={2} className={inputCls} /></div>
        <div><label className={labelCls}>City</label><input value={draft.customer_city || ""} onChange={e => setDraft({ ...draft, customer_city: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls}>Location label</label><input value={draft.customer_location || ""} onChange={e => setDraft({ ...draft, customer_location: e.target.value })} placeholder="e.g. Lekki, Lagos" className={inputCls} /></div>
        <div className="md:col-span-2"><label className={labelCls}>Avatar URL (optional)</label><input value={draft.avatar_url || ""} onChange={e => setDraft({ ...draft, avatar_url: e.target.value })} className={inputCls} /></div>
        <div className="md:col-span-2"><label className={labelCls}>Quote</label><textarea rows={3} value={draft.quote || ""} onChange={e => setDraft({ ...draft, quote: e.target.value })} className={inputCls} /></div>
        <div>
          <label className={labelCls}>Rating</label>
          <select value={draft.rating || 5} onChange={e => setDraft({ ...draft, rating: Number(e.target.value) })} className={inputCls}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Product context</label><input value={draft.product_context || ""} onChange={e => setDraft({ ...draft, product_context: e.target.value })} placeholder="e.g. Premium Bundle" className={inputCls} /></div>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!draft.is_verified_purchase} onChange={e => setDraft({ ...draft, is_verified_purchase: e.target.checked })} /> Verified purchase</label>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="text-xs text-text-med hover:text-foreground">Cancel</button>
        <button onClick={submit} className={btnPrimary}><Save className="w-3.5 h-3.5" /> Save</button>
      </div>
    </div>
  );
}

function Row({ t, onSave, onDelete }: { t: Testimonial; onSave: (p: Partial<Testimonial>) => Promise<any>; onDelete: () => void }) {
  const [draft, setDraft] = useState<Testimonial>(t);
  useEffect(() => { setDraft(t); }, [t]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(t);

  return (
    <div className={`bg-card border border-border rounded-xl p-3 ${t.is_active ? "" : "opacity-60"}`}>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-start">
        <input value={draft.customer_name} onChange={e => setDraft({ ...draft, customer_name: e.target.value })} className={inputCls + " md:col-span-1"} />
        <input value={draft.customer_location || draft.customer_city || ""} onChange={e => setDraft({ ...draft, customer_location: e.target.value })} className={inputCls + " md:col-span-1"} placeholder="Location" />
        <textarea rows={2} value={draft.quote} onChange={e => setDraft({ ...draft, quote: e.target.value })} className={inputCls + " md:col-span-3"} />
        <select value={draft.rating || 5} onChange={e => setDraft({ ...draft, rating: Number(e.target.value) })} className={inputCls + " md:col-span-1"}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}★</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mt-2 items-center">
        <input value={draft.product_context || ""} onChange={e => setDraft({ ...draft, product_context: e.target.value })} placeholder="Product context" className={inputCls + " md:col-span-2"} />
        <input type="number" value={draft.display_order ?? 0} onChange={e => setDraft({ ...draft, display_order: Number(e.target.value) })} placeholder="Order" className={inputCls + " md:col-span-1"} />
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!draft.is_verified_purchase} onChange={e => setDraft({ ...draft, is_verified_purchase: e.target.checked })} /> Verified</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} /> Active</label>
        <div className="md:col-span-1 flex items-center gap-2 justify-end">
          <button onClick={() => onSave({
            customer_name: draft.customer_name,
            customer_location: draft.customer_location,
            customer_city: draft.customer_city,
            quote: draft.quote,
            rating: draft.rating,
            product_context: draft.product_context,
            display_order: draft.display_order,
            is_verified_purchase: draft.is_verified_purchase,
            is_active: draft.is_active,
          })} disabled={!dirty} className="text-forest hover:underline text-xs font-semibold disabled:text-text-light disabled:no-underline">Save</button>
          <button onClick={onDelete} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-text-light mt-1">
        <Star className="w-3 h-3 fill-coral text-coral" /> Preview: "{draft.quote.slice(0, 60)}{draft.quote.length > 60 ? "…" : ""}"
      </div>
    </div>
  );
}
