import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb } from "./data";
import { OpsHeader, ConfirmDialog } from "./opsUi";

/**
 * Admin category questions manager (design 15a). What sellers answer when
 * creating a listing: one row per question in marketplace_category_fields,
 * grouped by category and by the same 7 category groups the buyer filter
 * uses. This screen ONLY manages question DEFINITIONS. Nothing here writes to
 * marketplace_listings.attributes (that is a later phase, the seller form does
 * not read these yet either); the "answered on N live listings" count in the
 * remove confirm reads attributes defensively so it is correct once that phase
 * lands, and today always shows 0.
 *
 * Two routes, one component: /admin/marketplace/categories (list, Q1) and
 * /admin/marketplace/categories/:categoryId (editor, Q2/Q3/Q4). Both share one
 * data layer so switching between them is instant, no refetch.
 */

type FieldType = "select" | "text" | "number" | "boolean";

interface Group { id: string; name: string; sort_order: number }
interface Category { id: string; name: string; group_id: string | null; is_allowed: boolean; sort_order: number }
interface CategoryField {
  id: string;
  category_id: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  is_required: boolean;
  help_text: string | null;
  sort_order: number;
}

const TYPE_LABEL: Record<FieldType, string> = { text: "Free text", select: "Choice list", number: "Number", boolean: "Yes / no" };
const TYPE_OPTS: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "Free text" },
  { value: "select", label: "Choice list" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / no" },
];

/** Lowercase, underscored suggestion from a label ("Brand and model" -> "brand_and_model").
 * The admin confirms or edits this before a NEW question is created; changing it later on
 * an existing question is treated as a bigger action (see the "Change key" reveal below),
 * since the unique (category_id, field_key) constraint means a changed key cannot be
 * reconciled with any answer already stored under the old one. */
function suggestKey(label: string): string {
  const k = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return k || "question";
}
const KEY_RE = /^[a-z][a-z0-9_]*$/;

function fieldDetail(f: Pick<CategoryField, "field_type" | "help_text" | "options">): string {
  if (f.help_text) return `${TYPE_LABEL[f.field_type]} · ${f.help_text}`;
  if (f.field_type === "select" && f.options?.length) return `${TYPE_LABEL[f.field_type]} · ${f.options.join(", ")}`;
  return TYPE_LABEL[f.field_type];
}

function countsLabel(required: number, optional: number): string {
  if (required === 0 && optional === 0) return "No questions yet";
  if (optional === 0) return `${required} required only`;
  if (required === 0) return `${optional} optional only`;
  return `${required} required, ${optional} optional`;
}

/** For every category in a group, how many of its questions exist ONLY on that
 * category (field_key used by exactly one category in the group). This is what
 * design 15a's coral "unique to this category" tag and the group-level "N
 * categories carry a one-off question" line are both driven by. */
function computeUniqueCounts(groupCats: Category[], fieldsByCategory: Record<string, CategoryField[]>): Record<string, number> {
  const keyToCats = new Map<string, Set<string>>();
  for (const c of groupCats) {
    for (const f of fieldsByCategory[c.id] ?? []) {
      if (!keyToCats.has(f.field_key)) keyToCats.set(f.field_key, new Set());
      keyToCats.get(f.field_key)!.add(c.id);
    }
  }
  const out: Record<string, number> = {};
  for (const c of groupCats) {
    out[c.id] = (fieldsByCategory[c.id] ?? []).filter((f) => (keyToCats.get(f.field_key)?.size ?? 0) === 1).length;
  }
  return out;
}

export default function MarketplaceCategoryFields() {
  const { categoryId } = useParams<{ categoryId?: string }>();

  const groupsQ = useQuery({
    queryKey: ["mkt-cf-groups"],
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await adb.from("marketplace_category_groups").select("id, name, sort_order").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Group[];
    },
    staleTime: 15000,
  });

  const catsQ = useQuery({
    queryKey: ["mkt-cf-categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await adb.from("marketplace_categories").select("id, name, group_id, is_allowed, sort_order").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
    staleTime: 15000,
  });

  const fieldsQ = useQuery({
    queryKey: ["mkt-cf-fields"],
    queryFn: async (): Promise<CategoryField[]> => {
      const { data, error } = await adb.from("marketplace_category_fields")
        .select("id, category_id, field_key, label, field_type, options, is_required, help_text, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as CategoryField[];
    },
    staleTime: 15000,
  });

  const fieldsByCategory = useMemo(() => {
    const map: Record<string, CategoryField[]> = {};
    for (const f of fieldsQ.data ?? []) (map[f.category_id] ||= []).push(f);
    return map;
  }, [fieldsQ.data]);

  const catsByGroup = useMemo(() => {
    const map: Record<string, Category[]> = {};
    for (const c of catsQ.data ?? []) (map[c.group_id ?? "__ungrouped"] ||= []).push(c);
    return map;
  }, [catsQ.data]);

  function refetchAll() { groupsQ.refetch(); catsQ.refetch(); fieldsQ.refetch(); }

  if (groupsQ.isLoading || catsQ.isLoading || fieldsQ.isLoading) {
    return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;
  }

  const groups = groupsQ.data ?? [];
  const cats = catsQ.data ?? [];

  if (categoryId) {
    const category = cats.find((c) => c.id === categoryId);
    const group = category ? groups.find((g) => g.id === category.group_id) ?? null : null;
    const groupCats = group ? catsByGroup[group.id] ?? [] : [];
    const uniqueCounts = group ? computeUniqueCounts(groupCats, fieldsByCategory) : {};
    return (
      <CategoryEditor
        category={category ?? null}
        group={group}
        fields={category ? fieldsByCategory[category.id] ?? [] : []}
        uniqueForThisCategory={category ? uniqueCounts[category.id] ?? 0 : 0}
        onChanged={refetchAll}
      />
    );
  }

  return <CategoryList groups={groups} catsByGroup={catsByGroup} fieldsByCategory={fieldsByCategory} onChanged={refetchAll} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST (design Q1 / Q6)
// ─────────────────────────────────────────────────────────────────────────────

function CategoryList({ groups, catsByGroup, fieldsByCategory, onChanged }: {
  groups: Group[];
  catsByGroup: Record<string, Category[]>;
  fieldsByCategory: Record<string, CategoryField[]>;
  onChanged: () => void;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  return (
    <div>
      <OpsHeader
        title="Category questions"
        subtitle="What sellers answer when creating a listing. Fewer, sharper questions get better listings finished, not more of them."
        right={
          <button onClick={() => setBulkOpen(true)} className="text-xs font-heading font-extrabold px-3.5 py-2 rounded-xl border" style={{ borderColor: "#2D6A4F", color: "#2D6A4F" }}>
            Apply a question to a group
          </button>
        }
      />

      <div className="mt-5 flex flex-col gap-6">
        {groups.map((g) => {
          const groupCats = catsByGroup[g.id] ?? [];
          if (groupCats.length === 0) return null;
          const uniqueCounts = computeUniqueCounts(groupCats, fieldsByCategory);
          const oneOffCount = groupCats.filter((c) => (uniqueCounts[c.id] ?? 0) > 0).length;
          return (
            <div key={g.id}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-text-med">{g.name}</div>
                {oneOffCount > 0 && (
                  <span className="text-[11px] text-text-light">
                    {oneOffCount === 1 ? "1 category carries a one-off question" : `${oneOffCount} categories carry one-off questions`}
                  </span>
                )}
              </div>
              <div className="rounded-2xl border overflow-hidden bg-white" style={{ borderColor: "#F0DDD2" }}>
                {groupCats.map((c, i) => {
                  const fields = fieldsByCategory[c.id] ?? [];
                  const required = fields.filter((f) => f.is_required).length;
                  const optional = fields.length - required;
                  const unique = uniqueCounts[c.id] ?? 0;
                  return (
                    <Link
                      key={c.id}
                      to={`/admin/marketplace/categories/${c.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#FFF8F4] transition"
                      style={{ borderTop: i > 0 ? "1px solid #F5EDE8" : undefined }}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-extrabold text-sm text-foreground">{c.name}</span>
                          {!c.is_allowed && <span className="text-[9px] font-heading font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "#8A7A72", color: "#FFF8F4" }}>disabled</span>}
                          {unique > 0 && (
                            <span className="text-[10px] font-heading font-extrabold px-1.5 py-0.5 rounded" style={{ background: "#FDE8DF", color: "#D4613C" }}>
                              {unique === 1 ? "1 unique to this category" : `${unique} unique to this category`}
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] text-text-med">{countsLabel(required, optional)}</span>
                      </div>
                      <span className="text-[11px] font-heading font-extrabold px-2.5 py-1.5 rounded-lg flex-none" style={{ background: "#EDE6E1", color: "#6B5B54" }}>
                        {fields.length} {fields.length === 1 ? "question" : "questions"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {bulkOpen && (
        <BulkApplyDialog
          groups={groups}
          catsByGroup={catsByGroup}
          fieldsByCategory={fieldsByCategory}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR (design Q2 / Q3 / Q4 / Q7 / Q8)
// ─────────────────────────────────────────────────────────────────────────────

interface DraftField {
  label: string;
  field_type: FieldType;
  optionsText: string; // one choice per line, only used when field_type === "select"
  is_required: boolean;
  help_text: string;
  key: string;
  keyUnlocked: boolean; // editing an existing question: the key stays locked until this is explicitly opened
}

const EMPTY_DRAFT: DraftField = { label: "", field_type: "text", optionsText: "", is_required: false, help_text: "", key: "", keyUnlocked: false };

function CategoryEditor({ category, group, fields, uniqueForThisCategory, onChanged }: {
  category: Category | null;
  group: Group | null;
  fields: CategoryField[];
  uniqueForThisCategory: number;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftField>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CategoryField | null>(null);

  if (!category) {
    return (
      <div>
        <Link to="/admin/marketplace/categories" className="text-sm text-text-med">‹ Categories</Link>
        <div className="mt-6 rounded-2xl border p-12 text-center" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
          <div className="font-heading font-black text-lg text-foreground">Category not found</div>
          <p className="mt-2 text-sm text-text-med">It may have been removed. Go back to the category list.</p>
        </div>
      </div>
    );
  }

  function startAdd() {
    setDraft(EMPTY_DRAFT);
    setAdding(true);
    setEditingId(null);
    setError(null);
  }
  function startEdit(f: CategoryField) {
    setDraft({
      label: f.label,
      field_type: f.field_type,
      optionsText: (f.options ?? []).join("\n"),
      is_required: f.is_required,
      help_text: f.help_text ?? "",
      key: f.field_key,
      keyUnlocked: false,
    });
    setEditingId(f.id);
    setAdding(false);
    setError(null);
  }
  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setError(null);
  }

  function validate(): { key: string; options: string[] } | null {
    const label = draft.label.trim();
    if (!label) { setError("Give the question a label."); return null; }
    const key = draft.key.trim().toLowerCase();
    if (!KEY_RE.test(key)) { setError("The key must start with a letter and use only lowercase letters, numbers and underscores."); return null; }
    const collides = fields.some((f) => f.field_key === key && f.id !== editingId);
    if (collides) { setError(`"${key}" is already used by another question on this category.`); return null; }
    let options: string[] = [];
    if (draft.field_type === "select") {
      options = Array.from(new Set(draft.optionsText.split("\n").map((s) => s.trim()).filter(Boolean)));
      if (options.length === 0) { setError("Add at least one choice for a choice list question."); return null; }
    }
    setError(null);
    return { key, options };
  }

  async function saveField() {
    const v = validate();
    if (!v) return;
    setBusy(true);
    if (editingId) {
      const patch: Record<string, unknown> = {
        label: draft.label.trim(),
        field_type: draft.field_type,
        options: draft.field_type === "select" ? v.options : null,
        is_required: draft.is_required,
        help_text: draft.help_text.trim() || null,
      };
      if (draft.keyUnlocked) patch.field_key = v.key;
      const { error } = await adb.from("marketplace_category_fields").update(patch).eq("id", editingId);
      setBusy(false);
      if (error) { setError(error.message); return; }
    } else {
      const maxSort = Math.max(-1, ...fields.map((f) => f.sort_order));
      const { error } = await adb.from("marketplace_category_fields").insert({
        category_id: category.id,
        field_key: v.key,
        label: draft.label.trim(),
        field_type: draft.field_type,
        options: draft.field_type === "select" ? v.options : null,
        is_required: draft.is_required,
        help_text: draft.help_text.trim() || null,
        sort_order: maxSort + 1,
      });
      setBusy(false);
      if (error) { setError(error.message); return; }
    }
    cancelForm();
    onChanged();
  }

  async function moveField(index: number, dir: -1 | 1) {
    const other = fields[index + dir];
    const cur = fields[index];
    if (!other) return;
    setBusy(true);
    await Promise.all([
      adb.from("marketplace_category_fields").update({ sort_order: other.sort_order }).eq("id", cur.id),
      adb.from("marketplace_category_fields").update({ sort_order: cur.sort_order }).eq("id", other.id),
    ]);
    setBusy(false);
    onChanged();
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setBusy(true);
    const { error } = await adb.from("marketplace_category_fields").delete().eq("id", removeTarget.id);
    setBusy(false);
    if (error) { setError(error.message); setRemoveTarget(null); return; }
    setRemoveTarget(null);
    onChanged();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link to="/admin/marketplace/categories" className="text-sm text-text-med">‹ Categories</Link>
          <span className="font-heading font-black text-xl tracking-tight text-foreground">{category.name}</span>
          <span className="text-[10px] font-heading font-extrabold px-2 py-1 rounded-lg" style={{ background: "#EDE6E1", color: "#6B5B54" }}>
            {group ? `Under ${group.name}` : "No group"}
          </span>
        </div>
        <button onClick={startAdd} className="text-xs font-heading font-extrabold px-3.5 py-2.5 rounded-xl text-white" style={{ background: "#2D6A4F" }}>
          Add a question
        </button>
      </div>

      <div className="mt-4 rounded-xl p-3 flex gap-2.5 items-start" style={{ background: "#D8EFE5" }}>
        <div className="w-[18px] h-[18px] rounded-full flex-none flex items-center justify-center text-[11px] font-bold text-white" style={{ background: "#2D6A4F" }}>i</div>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "#1A4A33" }}>
          Every question here is one more thing a seller must answer before listing. Keep this list short and each question sharp, three or four is usually enough.
        </p>
      </div>

      {uniqueForThisCategory > 0 && group && (
        <div className="mt-3 rounded-xl p-3 flex gap-2.5 items-start" style={{ background: "#D8EFE5" }}>
          <div className="w-[17px] h-[17px] rounded-full flex-none flex items-center justify-center text-[10px] font-bold text-white mt-0.5" style={{ background: "#2D6A4F" }}>i</div>
          <p className="text-[12px] leading-relaxed" style={{ color: "#1A4A33" }}>
            {uniqueForThisCategory === 1 ? "One question below" : `${uniqueForThisCategory} questions below`} exist{uniqueForThisCategory === 1 ? "s" : ""} only on {category.name}. The rest of {group.name} does not ask it. Removing or editing it here changes nothing anywhere else.
          </p>
        </div>
      )}

      {fields.length === 0 && !adding ? (
        <div className="mt-6 rounded-2xl border p-10 text-center" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
          <div className="font-heading font-black text-base text-foreground">No questions yet</div>
          <p className="mt-1.5 text-sm text-text-med">Add the first one when a seller listing in this category needs to tell buyers something specific.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {fields.map((f, i) => {
            return (
              <div key={f.id} className="rounded-xl border bg-white p-3.5 flex items-center gap-3" style={{ borderColor: editingId === f.id ? "#2D6A4F" : "#F0DDD2", borderWidth: editingId === f.id ? 1.5 : 1 }}>
                <div className="flex flex-col gap-1 flex-none text-[#C9B7AD]">
                  <button onClick={() => moveField(i, -1)} disabled={i === 0 || busy} className="disabled:opacity-30" aria-label="Move up">▲</button>
                  <button onClick={() => moveField(i, 1)} disabled={i === fields.length - 1 || busy} className="disabled:opacity-30" aria-label="Move down">▼</button>
                </div>
                <span className="w-[22px] h-[22px] rounded-full flex-none text-center font-heading font-extrabold text-[11px] leading-[22px]" style={{ background: "#EDE6E1", color: "#6B5B54" }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-heading font-extrabold text-sm">{f.label}</span>
                  <div className="text-[11.5px] text-text-med truncate">{fieldDetail(f)}</div>
                </div>
                <span className="text-[10px] font-heading font-extrabold px-2 py-1 rounded-md flex-none" style={f.is_required ? { background: "#FDE8DF", color: "#D4613C" } : { background: "#EDE6E1", color: "#6B5B54" }}>
                  {f.is_required ? "Required" : "Optional"}
                </span>
                <div className="flex gap-2.5 flex-none">
                  <button onClick={() => startEdit(f)} className="text-[12.5px] font-bold" style={{ color: "#2D6A4F" }}>Edit</button>
                  <button onClick={() => setRemoveTarget(f)} className="text-[12.5px] font-bold" style={{ color: "#8A7A72" }}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(adding || editingId) && (
        <div className="mt-4 h-px" style={{ background: "#F0DDD2" }} />
      )}

      {(adding || editingId) && (
        <QuestionForm
          draft={draft}
          setDraft={setDraft}
          isNew={adding}
          error={error}
          busy={busy}
          onCancel={cancelForm}
          onSave={saveField}
        />
      )}

      {removeTarget && (
        <RemoveConfirm
          field={removeTarget}
          categoryId={category.id}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={confirmRemove}
          busy={busy}
        />
      )}
    </div>
  );
}

function QuestionForm({ draft, setDraft, isNew, error, busy, onCancel, onSave }: {
  draft: DraftField;
  setDraft: (updater: (d: DraftField) => DraftField) => void;
  isNew: boolean;
  error: string | null;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  function setLabel(label: string) {
    setDraft((d) => ({ ...d, label, key: isNew && (d.key === "" || d.key === suggestKey(d.label)) ? suggestKey(label) : d.key }));
  }
  return (
    <div className="mt-4 rounded-2xl border bg-white p-4.5 flex flex-col gap-3.5" style={{ borderColor: "#F0DDD2" }}>
      <div className="font-heading font-extrabold text-[15px]">{isNew ? "New question" : `Editing "${draft.label}"`}</div>

      <Field label="Label">
        <input value={draft.label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Number of wheels"
          className="w-full rounded-lg border px-3 h-10 text-sm" style={{ borderColor: "#E3D4CB", background: "#FFF8F4" }} />
      </Field>

      <div className="flex gap-2.5 flex-wrap sm:flex-nowrap">
        <div className="flex-1 min-w-[220px]">
          <div className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-text-med mb-1.5">Type</div>
          <div className="flex gap-1.5 flex-wrap">
            {TYPE_OPTS.map((t) => (
              <button key={t.value} onClick={() => setDraft((d) => ({ ...d, field_type: t.value }))}
                className="flex-1 text-center text-[11.5px] font-heading font-extrabold py-2 px-2 rounded-lg border"
                style={draft.field_type === t.value ? { background: "#2D6A4F", color: "#FFF8F4", borderColor: "#2D6A4F" } : { background: "#FFF8F4", color: "#1A1A1A", borderColor: "#E3D4CB" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="w-full sm:w-[150px]">
          <div className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-text-med mb-1.5">Required</div>
          <button onClick={() => setDraft((d) => ({ ...d, is_required: !d.is_required }))}
            className="w-full h-10 rounded-lg flex items-center justify-center gap-2 font-heading font-extrabold text-[12.5px]"
            style={draft.is_required ? { background: "#FDE8DF", color: "#D4613C" } : { background: "#EDE6E1", color: "#6B5B54" }}>
            <span className="w-8 h-[18px] rounded-full relative" style={{ background: draft.is_required ? "#D4613C" : "#C9B7AD" }}>
              <span className="w-3.5 h-3.5 rounded-full bg-white absolute top-[2px]" style={{ left: draft.is_required ? 16 : 2 }} />
            </span>
            {draft.is_required ? "Required" : "Optional"}
          </button>
        </div>
      </div>

      {draft.field_type === "select" && (
        <Field label="Choices, one per line">
          <textarea value={draft.optionsText} onChange={(e) => setDraft((d) => ({ ...d, optionsText: e.target.value }))}
            placeholder={"Chicco\nJoie\nGraco"} rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E3D4CB", background: "#FFF8F4" }} />
        </Field>
      )}

      <Field label="Help text for the seller, optional">
        <input value={draft.help_text} onChange={(e) => setDraft((d) => ({ ...d, help_text: e.target.value }))}
          placeholder="e.g. Check the base of the pram or the manual"
          className="w-full rounded-lg border px-3 h-10 text-sm" style={{ borderColor: "#E3D4CB", background: "#FFF8F4" }} />
      </Field>

      {isNew ? (
        <Field label="Key, confirm or edit before creating">
          <input value={draft.key} onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value.toLowerCase() }))}
            className="w-full rounded-lg border px-3 h-10 text-sm font-mono" style={{ borderColor: "#E3D4CB", background: "#FFF8F4" }} />
          <p className="text-[11px] text-text-light mt-1">Stable identifier for this question. It cannot be changed later without risking answers already stored under it.</p>
        </Field>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-text-med">Key</span>
            {!draft.keyUnlocked && (
              <button onClick={() => setDraft((d) => ({ ...d, keyUnlocked: true }))} className="text-[11px] font-bold" style={{ color: "#2D6A4F" }}>Change key (advanced)</button>
            )}
          </div>
          {draft.keyUnlocked ? (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="rounded-lg p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#FDECEA", color: "#8C2A1F" }}>
                Changing the key does not move any existing answer. Any seller who already answered this question under the old key becomes orphaned data under it, and this question starts fresh under the new key.
              </div>
              <input value={draft.key} onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value.toLowerCase() }))}
                className="w-full rounded-lg border px-3 h-10 text-sm font-mono" style={{ borderColor: "#C0392B", background: "#FFF8F4" }} />
            </div>
          ) : (
            <div className="mt-1.5 rounded-lg border px-3 h-10 flex items-center text-sm font-mono text-text-med" style={{ borderColor: "#F0DDD2", background: "#F5EDE8" }}>{draft.key}</div>
          )}
        </div>
      )}

      {/* Seller sees, live preview */}
      <div className="rounded-lg p-2.75 flex flex-col gap-1" style={{ background: "#FFF8F4" }}>
        <span className="text-[10.5px] font-heading font-extrabold uppercase tracking-wider text-text-med">Seller sees</span>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold">{draft.label || "Question label"}{draft.is_required && <span style={{ color: "#D4613C" }}> *</span>}</span>
        </div>
        <div className="rounded-md border h-8 mt-0.5" style={{ borderColor: "#E3D4CB", background: "#FFFFFF" }} />
      </div>

      {error && <div className="text-xs" style={{ color: "#C0392B" }}>{error}</div>}

      <div className="flex justify-end gap-2.5">
        <button onClick={onCancel} disabled={busy} className="text-xs font-heading font-extrabold px-4 py-2.5 rounded-xl border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
        <button onClick={onSave} disabled={busy} className="text-xs font-heading font-extrabold px-4 py-2.5 rounded-xl text-white" style={{ background: "#2D6A4F" }}>{busy ? "Saving..." : "Save question"}</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-text-med mb-1.5">{label}</div>
      {children}
    </div>
  );
}

/** Remove confirm (design Q4): states the real "answered on N live listings" count,
 * read from marketplace_listings.attributes via the ->> key-existence check. Nothing
 * writes to attributes yet, so this is always 0 today, correctly. */
function RemoveConfirm({ field, categoryId, onCancel, onConfirm, busy }: {
  field: CategoryField;
  categoryId: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const countQ = useQuery({
    queryKey: ["mkt-cf-answered-count", categoryId, field.field_key],
    queryFn: async (): Promise<number> => {
      const { count, error } = await adb.from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .eq("category_id", categoryId)
        .eq("status", "live")
        .not(`attributes->>${field.field_key}`, "is", null);
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 10000,
  });
  const n = countQ.data ?? 0;
  return (
    <ConfirmDialog
      open
      danger
      title={`Remove "${field.label}"?`}
      body={
        countQ.isLoading
          ? "Checking how many live listings already answered this…"
          : `${n} live listing${n === 1 ? " has" : "s have"} an answer to this. Removing it here does not touch those listings, but no seller will be asked it again, and you cannot get the question back once it is gone, you would be adding a new one.`
      }
      kv={[{ label: "Answered on", value: `${n} live listing${n === 1 ? "" : "s"}` }]}
      confirmLabel="Remove this question"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK APPLY (design Q5) — its own deliberate flow, off by default, with a
// preview of exactly which categories will be affected before committing.
// ─────────────────────────────────────────────────────────────────────────────

interface Template { field_key: string; label: string; field_type: FieldType; options: string[] | null; is_required: boolean; help_text: string | null }

function BulkApplyDialog({ groups, catsByGroup, fieldsByCategory, onClose, onDone }: {
  groups: Group[];
  catsByGroup: Record<string, Category[]>;
  fieldsByCategory: Record<string, CategoryField[]>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? "");
  const [templateKey, setTemplateKey] = useState<string>("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupCats = catsByGroup[groupId] ?? [];

  // Every distinct question already used somewhere in this group, first occurrence wins,
  // so bulk apply only ever copies a question that already exists, per the design copy
  // ("for a question every category in a group should share, like one already used
  // group wide"). It never invents a brand new question shape.
  const templates = useMemo(() => {
    const seen = new Map<string, Template>();
    for (const c of groupCats) {
      for (const f of fieldsByCategory[c.id] ?? []) {
        if (!seen.has(f.field_key)) seen.set(f.field_key, { field_key: f.field_key, label: f.label, field_type: f.field_type, options: f.options, is_required: f.is_required, help_text: f.help_text });
      }
    }
    return Array.from(seen.values());
  }, [groupCats, fieldsByCategory]);

  const template = templates.find((t) => t.field_key === templateKey) ?? null;

  const rows = useMemo(() => {
    if (!template) return [];
    return groupCats.map((c) => {
      const already = (fieldsByCategory[c.id] ?? []).some((f) => f.field_key === template.field_key);
      const totalNow = (fieldsByCategory[c.id] ?? []).length;
      return { category: c, already, totalNow };
    });
  }, [groupCats, fieldsByCategory, template]);

  function pickGroup(g: string) {
    setGroupId(g);
    setTemplateKey("");
    setChecked(new Set());
  }
  function pickTemplate(k: string) {
    setTemplateKey(k);
    const cats = catsByGroup[groupId] ?? [];
    const next = new Set<string>();
    for (const c of cats) {
      const already = (fieldsByCategory[c.id] ?? []).some((f) => f.field_key === k);
      if (!already) next.add(c.id);
    }
    setChecked(next);
  }
  function toggle(catId: string) {
    setChecked((prev) => { const n = new Set(prev); if (n.has(catId)) n.delete(catId); else n.add(catId); return n; });
  }

  async function confirm() {
    if (!template || checked.size === 0) return;
    setBusy(true); setError(null);
    let added = 0;
    for (const catId of checked) {
      const already = (fieldsByCategory[catId] ?? []).some((f) => f.field_key === template.field_key);
      if (already) continue; // defensive, checkboxes for these are not offered
      const maxSort = Math.max(-1, ...(fieldsByCategory[catId] ?? []).map((f) => f.sort_order));
      const { error } = await adb.from("marketplace_category_fields").insert({
        category_id: catId,
        field_key: template.field_key,
        label: template.label,
        field_type: template.field_type,
        options: template.options,
        is_required: template.is_required,
        help_text: template.help_text,
        sort_order: maxSort + 1,
      });
      if (!error) added++;
    }
    setBusy(false);
    if (added === 0) { setError("Nothing was added. Every checked category may already have this question."); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(26,26,26,0.45)" }} onClick={() => !busy && onClose()}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-heading font-extrabold text-[15px]">Add to a whole group at once</div>
        <p className="text-[12.5px] text-text-med leading-relaxed">
          For a question every category in a group should share, like a light one already used group wide. Off by default, since most questions belong on one category.
        </p>

        <Field label="Group">
          <select value={groupId} onChange={(e) => pickGroup(e.target.value)} className="w-full rounded-lg border px-3 h-10 text-sm" style={{ borderColor: "#E3D4CB", background: "#FFF8F4" }}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>

        <Field label="Question to copy">
          {templates.length === 0 ? (
            <div className="text-[12.5px] text-text-med rounded-lg border px-3 py-2.5" style={{ borderColor: "#F0DDD2" }}>No question exists anywhere in this group yet. Add one to a category first.</div>
          ) : (
            <select value={templateKey} onChange={(e) => pickTemplate(e.target.value)} className="w-full rounded-lg border px-3 h-10 text-sm" style={{ borderColor: "#E3D4CB", background: "#FFF8F4" }}>
              <option value="">Choose a question…</option>
              {templates.map((t) => <option key={t.field_key} value={t.field_key}>{t.label} ({TYPE_LABEL[t.field_type]})</option>)}
            </select>
          )}
        </Field>

        {template && (
          <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "#FDE8DF" }}>
            <span className="text-[11px] font-heading font-extrabold uppercase tracking-wider" style={{ color: "#D4613C" }}>Will add "{template.label}" to</span>
            <div className="flex flex-col gap-1.5">
              {rows.map(({ category, already, totalNow }) => (
                <label key={category.id} className={`flex items-center gap-2 text-[12.5px] ${already ? "opacity-60" : "cursor-pointer"}`}>
                  {already ? (
                    <span className="w-3.5 h-3.5 rounded flex-none flex items-center justify-center text-[9px] font-bold text-white" style={{ background: "#8A7A72" }}>✓</span>
                  ) : (
                    <input type="checkbox" checked={checked.has(category.id)} onChange={() => toggle(category.id)} className="w-3.5 h-3.5 flex-none" />
                  )}
                  <span>{category.name}{already ? ", already has this question" : `, already has ${totalNow}`}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="text-xs" style={{ color: "#C0392B" }}>{error}</div>}

        <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-1">
          <button onClick={onClose} disabled={busy} className="sm:flex-1 font-heading font-extrabold text-sm rounded-xl py-2.5 border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
          <button onClick={confirm} disabled={busy || !template || checked.size === 0} className="sm:flex-[1.4] font-heading font-extrabold text-sm rounded-xl py-2.5 text-white disabled:opacity-50" style={{ background: "#2D6A4F" }}>
            {busy ? "Adding…" : `Add to ${checked.size} categor${checked.size === 1 ? "y" : "ies"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
