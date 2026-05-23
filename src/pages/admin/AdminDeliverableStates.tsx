import { useEffect, useState } from "react";
import { Save, MapPin, Plus, Trash2, X, Zap, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  useDeliverableStates,
  useUpdateDeliverableState,
  useCreateDeliverableState,
  useDeleteDeliverableState,
  type DeliverableState,
} from "@/hooks/useDeliverableStates";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

export default function AdminDeliverableStates() {
  const { can } = usePermissions();
  const canEdit = can("delivery", "edit");
  const { data: states, isLoading } = useDeliverableStates(false);
  const update = useUpdateDeliverableState();
  const create = useCreateDeliverableState();
  const del = useDeleteDeliverableState();

  // Note buffer per row so the Save button can flag unsaved changes.
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Express-only confirmation modal target; null = closed.
  const [expressConfirm, setExpressConfirm] = useState<DeliverableState | null>(null);
  // Add State modal toggle.
  const [showAdd, setShowAdd] = useState(false);
  // Edit modal target row; null = closed.
  const [editing, setEditing] = useState<DeliverableState | null>(null);
  // Per-row dirty display_order draft so blur-to-save doesn't fire on every keystroke.
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!states) return;
    const noteNext: Record<string, string> = {};
    const orderNext: Record<string, string> = {};
    states.forEach((s) => {
      noteNext[s.id] = s.note || "";
      orderNext[s.id] = String(s.display_order ?? 99);
    });
    setNotes(noteNext);
    setOrderDrafts(orderNext);
  }, [states]);

  const toggleActive = async (state: DeliverableState) => {
    try {
      await update.mutateAsync({ id: state.id, is_active: !state.is_active });
      toast.success(`${state.name} ${!state.is_active ? "enabled" : "disabled"}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update state");
    }
  };

  // The Express Only toggle goes through a confirm modal in the ON direction
  // because flipping it customer-side hides every standard courier. Off is
  // low-blast-radius so it persists immediately.
  const requestExpressToggle = (state: DeliverableState) => {
    if (!canEdit) return;
    if (!state.is_express_only) {
      setExpressConfirm(state);
    } else {
      void update.mutateAsync({ id: state.id, is_express_only: false }).then(
        () => toast.success(`Express Only disabled for ${state.name}`),
        (e) => toast.error(e?.message || "Failed to update state"),
      );
    }
  };

  const confirmExpressOn = async () => {
    if (!expressConfirm) return;
    try {
      await update.mutateAsync({ id: expressConfirm.id, is_express_only: true });
      toast.success(`Express Only enabled for ${expressConfirm.name}`);
      setExpressConfirm(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update state");
    }
  };

  const saveNote = async (state: DeliverableState) => {
    try {
      await update.mutateAsync({ id: state.id, note: notes[state.id] || null });
      toast.success(`${state.name} note saved`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save note");
    }
  };

  const saveDisplayOrder = async (state: DeliverableState) => {
    const next = parseInt(orderDrafts[state.id] || "", 10);
    if (!Number.isFinite(next) || next === state.display_order) return;
    try {
      await update.mutateAsync({ id: state.id, display_order: next });
      toast.success(`${state.name} order updated`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update order");
    }
  };

  const handleDelete = async (state: DeliverableState) => {
    if (!canEdit) return;
    if (!confirm(`Delete state ${state.name}? Customers currently in this state will not be able to checkout.`)) return;
    try {
      await del.mutateAsync(state.id);
      toast.success(`${state.name} deleted`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete state");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="pf text-2xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6" /> Deliverable States
          </h1>
          <p className="text-text-med text-sm mt-1 max-w-[720px]">
            Manage which Nigerian states you deliver to and whether each one requires Express Delivery.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep"
          >
            <Plus className="w-4 h-4" /> Add State
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-text-med">
          You need 'Delivery' edit permission — controls are read-only.
        </div>
      )}

      {/* Summary card — at-a-glance counts that re-render with the table. */}
      {!isLoading && states && states.length > 0 && (
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med">Total active states</p>
            <p className="text-2xl font-bold mt-1">{states.filter((s) => s.is_active).length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med">Express-only states</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{states.filter((s) => s.is_express_only).length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med">Total states</p>
            <p className="text-2xl font-bold mt-1">{states.length}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading states…</div>
      ) : !states || states.length === 0 ? (
        <div className="text-center py-10 text-text-med">No deliverable states configured yet.</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-text-med">State</th>
                  <th className="px-4 py-3 text-center font-semibold text-text-med">Active</th>
                  <th className="px-4 py-3 text-center font-semibold text-text-med">Has Zones</th>
                  <th className="px-4 py-3 text-center font-semibold text-text-med">Express Only</th>
                  <th className="px-4 py-3 text-center font-semibold text-text-med w-[80px]">Order</th>
                  <th className="px-4 py-3 text-left font-semibold text-text-med">Note</th>
                  <th className="px-4 py-3 text-right font-semibold text-text-med w-[160px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {states.map((s) => {
                  const pendingNote = notes[s.id] ?? "";
                  const noteDirty = (s.note || "") !== pendingNote;
                  const orderDraft = orderDrafts[s.id] ?? String(s.display_order ?? 99);
                  return (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/20 align-middle">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${s.is_active ? "bg-green-500" : "bg-border"}`} />
                          {canEdit ? (
                            <button
                              onClick={() => setEditing(s)}
                              className="font-semibold hover:underline text-left"
                            >
                              {s.name}
                            </button>
                          ) : (
                            <span className="font-semibold">{s.name}</span>
                          )}
                          {s.is_express_only && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-amber-100 text-amber-800 text-[10px] font-semibold">
                              <Zap className="w-3 h-3" /> Express
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ToggleSwitch
                          checked={s.is_active}
                          onChange={() => toggleActive(s)}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ToggleSwitch checked={s.has_zones} onChange={() => {}} disabled />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ToggleSwitch
                          checked={!!s.is_express_only}
                          onChange={() => requestExpressToggle(s)}
                          disabled={!canEdit}
                          accent="amber"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          value={orderDraft}
                          onChange={(e) => setOrderDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          onBlur={() => saveDisplayOrder(s)}
                          disabled={!canEdit}
                          className="w-16 text-center border border-input rounded-lg px-2 py-1.5 text-sm bg-background disabled:opacity-60"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={pendingNote}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          placeholder="e.g. Coming soon, pilot area"
                          disabled={!canEdit}
                          className={`w-full border rounded-lg px-3 py-2 text-sm bg-background disabled:opacity-60 ${noteDirty ? "border-coral" : "border-input"}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => saveNote(s)}
                            disabled={!canEdit || !noteDirty || update.isPending}
                            className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
                          >
                            <Save className="w-3.5 h-3.5" /> Save
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => setEditing(s)}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-muted text-text-med"
                              title={`Edit ${s.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => handleDelete(s)}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"
                              title={`Delete ${s.name}`}
                              disabled={del.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info banner — only renders when at least one state is express-only,
          mirroring the customer-side enforcement on checkout. */}
      {!isLoading && states && states.some((s) => s.is_express_only) && (
        <div className="mt-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-[12px] text-blue-900 leading-relaxed">
          <p className="font-semibold mb-0.5">ℹ️ About Express Only states</p>
          <p>
            States marked Express Only show ONLY Express Delivery on checkout. Standard couriers are hidden. Minimum cart size is waived for these states.
          </p>
        </div>
      )}

      {editing && (
        <EditStateModal
          state={editing}
          onClose={() => setEditing(null)}
          existingNames={(states || []).filter((s) => s.id !== editing.id).map((s) => s.name.toLowerCase())}
          onSave={async (next) => {
            await update.mutateAsync({ id: editing.id, ...next });
            toast.success(`${next.name || editing.name} updated`);
            setEditing(null);
          }}
        />
      )}

      {expressConfirm && (
        <Modal onClose={() => setExpressConfirm(null)}>
          <h3 className="font-bold text-base mb-1">Mark {expressConfirm.name} as Express Only?</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Customers in this state will ONLY see Express Delivery at checkout (no standard courier options). The minimum cart size is also waived for Express-Only states.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setExpressConfirm(null)}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={confirmExpressOn}
              disabled={update.isPending}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40"
            >
              {update.isPending ? "Saving…" : "Mark Express Only"}
            </button>
          </div>
        </Modal>
      )}

      {showAdd && (
        <AddStateModal
          onClose={() => setShowAdd(false)}
          onCreate={async (input) => {
            await create.mutateAsync(input);
            toast.success(`${input.name} added`);
            setShowAdd(false);
          }}
          existingNames={(states || []).map((s) => s.name.toLowerCase())}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
function ToggleSwitch({
  checked, onChange, disabled, accent,
}: { checked: boolean; onChange: () => void; disabled?: boolean; accent?: "forest" | "amber" }) {
  const onColor = accent === "amber" ? "peer-checked:bg-amber-500" : "peer-checked:bg-forest";
  return (
    <label className={`relative inline-flex items-center ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={() => { if (!disabled) onChange(); }}
        disabled={disabled}
      />
      <div className={`peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-4 ${onColor}`} />
    </label>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-foreground/60 z-[150] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-[440px] p-5" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function AddStateModal({
  onClose, onCreate, existingNames,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; is_active: boolean; is_express_only: boolean; note: string | null; display_order: number }) => Promise<void>;
  existingNames: string[];
}) {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isExpressOnly, setIsExpressOnly] = useState(false);
  const [note, setNote] = useState("");
  const [displayOrder, setDisplayOrder] = useState("99");
  const [submitting, setSubmitting] = useState(false);

  const trimmed = name.trim();
  const duplicate = trimmed && existingNames.includes(trimmed.toLowerCase());
  const tooLong = trimmed.length > 80;
  const noteTooLong = note.length > 200;
  const invalid = !trimmed || duplicate || tooLong || noteTooLong;

  const submit = async () => {
    if (invalid) return;
    setSubmitting(true);
    try {
      await onCreate({
        name: trimmed,
        is_active: isActive,
        is_express_only: isExpressOnly,
        note: note.trim() || null,
        display_order: parseInt(displayOrder, 10) || 99,
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to add state");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base">Add Deliverable State</h3>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">State Name *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cross River"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            maxLength={80}
          />
          {duplicate && <p className="text-[11px] text-destructive mt-1">A state with this name already exists.</p>}
          {tooLong && <p className="text-[11px] text-destructive mt-1">Max 80 characters.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <ToggleSwitch checked={isActive} onChange={() => setIsActive((v) => !v)} />
            <span>Active</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <ToggleSwitch checked={isExpressOnly} onChange={() => setIsExpressOnly((v) => !v)} accent="amber" />
            <span>Express Only</span>
          </label>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Coming soon, pilot area"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            maxLength={200}
          />
          {noteTooLong && <p className="text-[11px] text-destructive mt-1">Max 200 characters.</p>}
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Display Order</label>
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} disabled={submitting} className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={invalid || submitting}
          className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
        >
          {submitting ? "Adding…" : "Add State"}
        </button>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────
// Edit modal — same field set as Add, prefilled. Name is editable;
// uniqueness is checked against every other row (case-insensitive).
// ────────────────────────────────────────────────────────────────
function EditStateModal({
  state, onClose, onSave, existingNames,
}: {
  state: DeliverableState;
  onClose: () => void;
  onSave: (input: { name: string; is_active: boolean; is_express_only: boolean; note: string | null; display_order: number }) => Promise<void>;
  existingNames: string[];
}) {
  const [name, setName] = useState(state.name);
  const [isActive, setIsActive] = useState(state.is_active);
  const [isExpressOnly, setIsExpressOnly] = useState(!!state.is_express_only);
  const [note, setNote] = useState(state.note || "");
  const [displayOrder, setDisplayOrder] = useState(String(state.display_order ?? 99));
  const [submitting, setSubmitting] = useState(false);

  const trimmed = name.trim();
  const duplicate = trimmed && existingNames.includes(trimmed.toLowerCase());
  const tooLong = trimmed.length > 80;
  const noteTooLong = note.length > 200;
  const invalid = !trimmed || duplicate || tooLong || noteTooLong;

  const submit = async () => {
    if (invalid) return;
    setSubmitting(true);
    try {
      await onSave({
        name: trimmed,
        is_active: isActive,
        is_express_only: isExpressOnly,
        note: note.trim() || null,
        display_order: parseInt(displayOrder, 10) || 99,
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save state");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base">Edit {state.name}</h3>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">State Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            maxLength={80}
          />
          {duplicate && <p className="text-[11px] text-destructive mt-1">Another state already uses this name.</p>}
          {tooLong && <p className="text-[11px] text-destructive mt-1">Max 80 characters.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <ToggleSwitch checked={isActive} onChange={() => setIsActive((v) => !v)} />
            <span>Active</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <ToggleSwitch checked={isExpressOnly} onChange={() => setIsExpressOnly((v) => !v)} accent="amber" />
            <span>Express Only</span>
          </label>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Coming soon, pilot area"
            rows={3}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            maxLength={200}
          />
          {noteTooLong && <p className="text-[11px] text-destructive mt-1">Max 200 characters.</p>}
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Display Order</label>
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} disabled={submitting} className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={invalid || submitting}
          className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
        >
          {submitting ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}
