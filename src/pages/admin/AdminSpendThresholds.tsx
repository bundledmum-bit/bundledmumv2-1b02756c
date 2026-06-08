import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Gift, Plus, Save } from "lucide-react";
import {
  useAllSpendThresholds, useUpsertSpendThreshold,
  type SpendThreshold,
} from "@/hooks/useHomepage";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";
const btnPrimary = "inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40";

export default function AdminSpendThresholds() {
  const { data: items } = useAllSpendThresholds();
  const upsert = useUpsertSpendThreshold();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-forest flex items-center gap-2"><Gift className="w-6 h-6" /> Spend Thresholds</h1>
        <p className="text-xs text-text-light mt-1">Order-value thresholds that unlock rewards (e.g. free delivery).</p>
      </header>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          Changing these amounts affects live storefront behaviour: cart progress bars, the checkout
          free-delivery note, and the <code>get_courier_assignment</code> RPC all consult these values. Changes
          are instant — double-check amounts before saving.
        </div>
      </div>

      <div className="space-y-2">
        {(items || []).map(t => (
          <Row
            key={t.id}
            t={t}
            onSave={p => upsert.mutateAsync({ id: t.id, ...p }).then(() => toast.success("Saved"))}
          />
        ))}
      </div>

      <AddForm onSave={t => upsert.mutateAsync(t).then(() => toast.success("Added"))} />
    </div>
  );
}

function Row({ t, onSave }: { t: SpendThreshold; onSave: (p: Partial<SpendThreshold>) => Promise<any> }) {
  const [d, setD] = useState<SpendThreshold>(t);
  const [zonesInput, setZonesInput] = useState((t.applies_to_zones || []).join(", "));
  useEffect(() => {
    setD(t);
    setZonesInput((t.applies_to_zones || []).join(", "));
  }, [t]);
  const dirty = JSON.stringify(d) !== JSON.stringify(t) || zonesInput !== (t.applies_to_zones || []).join(", ");

  const save = () => onSave({
    label: d.label,
    amount: Number(d.amount),
    reward_description: d.reward_description,
    applies_to_zones: zonesInput.split(",").map(s => s.trim()).filter(Boolean),
    is_active: d.is_active,
    display_order: d.display_order,
  });

  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
        <div>
          <label className={labelCls}>Type (key)</label>
          <input value={d.threshold_type} readOnly className={inputCls + " bg-muted/60 text-text-light cursor-not-allowed"} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Label</label>
          <input value={d.label} onChange={e => setD({ ...d, label: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Amount (₦)</label>
          <input type="number" value={d.amount} onChange={e => setD({ ...d, amount: Number(e.target.value) || 0 })} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Reward description</label>
          <input value={d.reward_description || ""} onChange={e => setD({ ...d, reward_description: e.target.value })} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mt-2 items-end">
        <div className="md:col-span-4">
          <label className={labelCls}>Applies to zones (comma-separated)</label>
          <input value={zonesInput} onChange={e => setZonesInput(e.target.value)} placeholder="e.g. Island, Mainland" className={inputCls} />
        </div>
        <label className="flex items-center gap-2 text-xs mb-2"><input type="checkbox" checked={!!d.is_active} onChange={e => setD({ ...d, is_active: e.target.checked })} /> Active</label>
        <button onClick={save} disabled={!dirty} className={btnPrimary + " self-end"}><Save className="w-3.5 h-3.5" /> Save</button>
      </div>
    </div>
  );
}

function AddForm({ onSave }: { onSave: (t: Partial<SpendThreshold>) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<SpendThreshold>>({
    threshold_type: "", label: "", amount: 0, reward_description: "", applies_to_zones: [], is_active: true,
  });
  const [zonesInput, setZonesInput] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-forest-light text-forest px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest/20">
        <Plus className="w-3.5 h-3.5" /> Add threshold
      </button>
    );
  }

  const submit = async () => {
    if (!draft.threshold_type?.trim() || !draft.label?.trim() || !draft.amount) {
      toast.error("Type, label and amount are required"); return;
    }
    await onSave({ ...draft, applies_to_zones: zonesInput.split(",").map(s => s.trim()).filter(Boolean) });
    setOpen(false);
    setDraft({ threshold_type: "", label: "", amount: 0, reward_description: "", applies_to_zones: [], is_active: true });
    setZonesInput("");
  };

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <h3 className="font-semibold text-sm">New threshold</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div><label className={labelCls}>Type (key)</label><input value={draft.threshold_type || ""} onChange={e => setDraft({ ...draft, threshold_type: e.target.value })} placeholder="e.g. free_delivery_lagos" className={inputCls} /></div>
        <div><label className={labelCls}>Label</label><input value={draft.label || ""} onChange={e => setDraft({ ...draft, label: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls}>Amount (₦)</label><input type="number" value={draft.amount || 0} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} className={inputCls} /></div>
        <div><label className={labelCls}>Reward</label><input value={draft.reward_description || ""} onChange={e => setDraft({ ...draft, reward_description: e.target.value })} className={inputCls} /></div>
        <div className="md:col-span-4"><label className={labelCls}>Applies to zones</label><input value={zonesInput} onChange={e => setZonesInput(e.target.value)} placeholder="Island, Mainland" className={inputCls} /></div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="text-xs text-text-med hover:text-foreground">Cancel</button>
        <button onClick={submit} className={btnPrimary}><Save className="w-3.5 h-3.5" /> Save</button>
      </div>
    </div>
  );
}
