import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, User as UserIcon, Plus, Trash2, MapPin, Save, Star } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useDeliverableStates } from "@/hooks/useDeliverableStates";

interface CustomerRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  whatsapp_number: string | null;
}

interface AddressRow {
  id: string;
  customer_id: string;
  label: string | null;
  recipient_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  delivery_notes: string | null;
  is_default: boolean | null;
}

const inputCls = "w-full rounded-lg border border-input px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-ring min-h-[44px]";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

export default function AccountProfilePage() {
  const { user } = useCustomerAuth();
  const email = user?.email || "";
  const qc = useQueryClient();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["my-profile", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customers")
        .select("id, email, full_name, phone, whatsapp_number")
        .eq("email", email)
        .maybeSingle();
      if (error) throw error;
      return data as CustomerRow | null;
    },
  });

  const { data: addresses } = useQuery({
    queryKey: ["my-addresses", customer?.id],
    enabled: !!customer?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", customer!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as AddressRow[];
    },
  });

  const { data: deliverableStates } = useDeliverableStates(true);

  // Local edit draft for the profile card.
  const [draft, setDraft] = useState<Partial<CustomerRow>>({});
  useEffect(() => {
    if (customer) setDraft({
      full_name: customer.full_name || "",
      phone: customer.phone || "",
      whatsapp_number: customer.whatsapp_number || "",
    });
  }, [customer]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!customer?.id) {
        // First-time save — insert a customers row keyed to this email.
        const { error } = await (supabase as any).from("customers").insert({
          email,
          full_name: draft.full_name || null,
          phone: draft.phone || null,
          whatsapp_number: draft.whatsapp_number || null,
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("customers").update({
          full_name: draft.full_name || null,
          phone: draft.phone || null,
          whatsapp_number: draft.whatsapp_number || null,
          updated_at: new Date().toISOString(),
        }).eq("id", customer.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-profile", email] }); toast.success("Profile saved"); },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const dirty =
    (draft.full_name || "") !== (customer?.full_name || "") ||
    (draft.phone || "") !== (customer?.phone || "") ||
    (draft.whatsapp_number || "") !== (customer?.whatsapp_number || "");

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-20 md:pb-10 px-4">
      <div className="max-w-[680px] mx-auto pt-6 space-y-4">
        <Link to="/account" className="inline-flex items-center gap-1 text-xs text-text-med hover:text-forest">
          <ArrowLeft className="w-3 h-3" /> Back to account
        </Link>

        <header>
          <h1 className="pf text-2xl font-bold flex items-center gap-2"><UserIcon className="w-5 h-5" /> My Profile</h1>
          <p className="text-xs text-text-med mt-1">Your contact details and saved delivery addresses.</p>
        </header>

        {/* Profile details */}
        <section className="bg-card border border-border rounded-card p-4 space-y-3">
          <div>
            <label className={labelCls}>Email</label>
            <input value={email} readOnly className={inputCls + " bg-muted/60 text-text-light cursor-not-allowed"} />
            <p className="text-[10px] text-text-light mt-1">Your email is tied to your account and can't be changed here.</p>
          </div>
          <div>
            <label className={labelCls}>Full name</label>
            <input value={draft.full_name || ""} onChange={e => setDraft({ ...draft, full_name: e.target.value })} className={inputCls} disabled={isLoading} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone number</label>
              <input value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} className={inputCls} placeholder="0801..." disabled={isLoading} />
            </div>
            <div>
              <label className={labelCls}>WhatsApp number</label>
              <input value={draft.whatsapp_number || ""} onChange={e => setDraft({ ...draft, whatsapp_number: e.target.value })} className={inputCls} placeholder="Optional" disabled={isLoading} />
              <p className="text-[10px] text-text-light mt-1">For order updates.</p>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => saveProfile.mutate()}
              disabled={!dirty || saveProfile.isPending}
              className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40 min-h-[40px]"
            >
              <Save className="w-3.5 h-3.5" /> {saveProfile.isPending ? "Saving…" : "Save profile"}
            </button>
          </div>
        </section>

        {/* Addresses */}
        <AddressesSection customer={customer} addresses={addresses || []} states={(deliverableStates || []).map(s => s.name)} />
      </div>
    </div>
  );
}

function AddressesSection({ customer, addresses, states }: {
  customer: CustomerRow | null | undefined;
  addresses: AddressRow[];
  states: string[];
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-addresses", customer?.id] });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<AddressRow> & { customer_id: string }) => {
      if ((payload as any).id) {
        const { error } = await (supabase as any).from("customer_addresses").update({
          ...payload,
          updated_at: new Date().toISOString(),
        }).eq("id", (payload as any).id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("customer_addresses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Address saved"); },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("customer_addresses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Address removed"); },
    onError: (e: any) => toast.error(e?.message || "Delete failed"),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      if (!customer?.id) return;
      // Clear existing default, then set.
      await (supabase as any).from("customer_addresses").update({ is_default: false }).eq("customer_id", customer.id);
      const { error } = await (supabase as any).from("customer_addresses").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Default address updated"); },
  });

  return (
    <section className="bg-card border border-border rounded-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Saved addresses</h2>
        {!adding && customer?.id && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-forest text-xs font-semibold hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Add new
          </button>
        )}
      </div>

      {!customer?.id && (
        <p className="text-xs text-text-light">Save your profile first to start adding addresses.</p>
      )}

      {customer?.id && addresses.length === 0 && !adding && (
        <p className="text-xs text-text-light">No saved addresses yet.</p>
      )}

      {addresses.map(a => (
        editingId === a.id ? (
          <AddressForm
            key={a.id}
            customerId={customer!.id}
            address={a}
            states={states}
            onCancel={() => setEditingId(null)}
            onSave={payload => upsert.mutateAsync({ ...payload, customer_id: customer!.id, id: a.id } as any).then(() => setEditingId(null))}
          />
        ) : (
          <div key={a.id} className="border border-border rounded-lg p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{a.label || "Address"}</span>
                  {a.is_default && <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-forest/10 text-forest px-1.5 py-0.5 rounded-pill"><Star className="w-2.5 h-2.5" /> Default</span>}
                </div>
                <p className="text-xs text-text-med mt-0.5">{a.recipient_name}{a.phone ? ` · ${a.phone}` : ""}</p>
                <p className="text-xs text-text-light mt-0.5 leading-snug">{a.address}{a.city ? `, ${a.city}` : ""}{a.state ? `, ${a.state}` : ""}</p>
                {a.delivery_notes && <p className="text-[11px] text-text-light italic mt-1">{a.delivery_notes}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
              <button onClick={() => setEditingId(a.id)} className="text-forest font-semibold hover:underline inline-flex items-center min-h-9">Edit</button>
              {!a.is_default && <button onClick={() => setDefault.mutate(a.id)} className="text-forest font-semibold hover:underline inline-flex items-center min-h-9">Set as default</button>}
              <button onClick={() => { if (confirm("Remove this address?")) del.mutate(a.id); }} className="text-destructive hover:underline inline-flex items-center gap-1 min-h-9 ml-auto">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </div>
        )
      ))}

      {adding && customer?.id && (
        <AddressForm
          customerId={customer.id}
          states={states}
          onCancel={() => setAdding(false)}
          onSave={payload => upsert.mutateAsync({ ...payload, customer_id: customer.id } as any).then(() => setAdding(false))}
        />
      )}
    </section>
  );
}

function AddressForm({ address, customerId, states, onCancel, onSave }: {
  address?: AddressRow;
  customerId: string;
  states: string[];
  onCancel: () => void;
  onSave: (payload: Partial<AddressRow>) => Promise<any>;
}) {
  const [draft, setDraft] = useState<Partial<AddressRow>>({
    label: address?.label || "Home",
    recipient_name: address?.recipient_name || "",
    phone: address?.phone || "",
    address: address?.address || "",
    city: address?.city || "",
    state: address?.state || (states[0] || "Lagos"),
    delivery_notes: address?.delivery_notes || "",
    is_default: address?.is_default || false,
  });

  const submit = () => {
    if (!draft.recipient_name?.trim()) { toast.error("Recipient name is required"); return; }
    if (!draft.address?.trim()) { toast.error("Address is required"); return; }
    if (!draft.state?.trim()) { toast.error("State is required"); return; }
    onSave({
      ...draft,
      label: (draft.label || "Home").trim(),
      recipient_name: draft.recipient_name?.trim(),
      phone: draft.phone?.trim() || null,
      address: draft.address?.trim(),
      city: draft.city?.trim() || null,
      state: draft.state?.trim(),
      delivery_notes: draft.delivery_notes?.trim() || null,
    });
  };

  return (
    <div className="border border-forest/30 bg-forest/5 rounded-lg p-3 space-y-2">
      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Label</label>
          <select value={draft.label || "Home"} onChange={e => setDraft({ ...draft, label: e.target.value })} className={inputCls}>
            <option value="Home">Home</option>
            <option value="Work">Work</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Recipient name</label>
          <input value={draft.recipient_name || ""} onChange={e => setDraft({ ...draft, recipient_name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>City</label>
          <input value={draft.city || ""} onChange={e => setDraft({ ...draft, city: e.target.value })} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Address</label>
          <textarea rows={2} value={draft.address || ""} onChange={e => setDraft({ ...draft, address: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>State</label>
          <select value={draft.state || ""} onChange={e => setDraft({ ...draft, state: e.target.value })} className={inputCls}>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Delivery notes (optional)</label>
          <input value={draft.delivery_notes || ""} onChange={e => setDraft({ ...draft, delivery_notes: e.target.value })} className={inputCls} placeholder="Landmarks, gate codes…" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={!!draft.is_default} onChange={e => setDraft({ ...draft, is_default: e.target.checked })} />
        Set as default delivery address
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs text-text-med hover:text-foreground px-2 min-h-[40px]">Cancel</button>
        <button onClick={submit} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep min-h-[40px]">
          <Save className="w-3.5 h-3.5" /> Save address
        </button>
      </div>
      <p className="text-[10px] text-text-light">Associated with customer {customerId.slice(0, 8)}.</p>
    </div>
  );
}
