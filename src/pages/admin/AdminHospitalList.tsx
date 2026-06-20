import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Search, ClipboardList, Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ── Config field map ─────────────────────────────────────────────────
// Mirrors the columns returned by get_hospital_list_config(). Grouped into
// the cards shown on the Page Settings tab.
type FieldType = "switch" | "text" | "textarea";
interface Field {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  placeholder?: string;
}
interface Section {
  title: string;
  help?: string;
  fields: Field[];
}

const SECTIONS: Section[] = [
  {
    title: "Master",
    help: "When off, the public /hospital-list page shows a disabled / coming-soon state.",
    fields: [{ key: "page_enabled", label: "Page enabled", type: "switch" }],
  },
  {
    title: "Header",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Subheading", type: "textarea" },
    ],
  },
  {
    title: "Budget builder",
    fields: [
      { key: "budget_enabled", label: "Budget builder enabled", type: "switch" },
      { key: "budget_prompt_label", label: "Prompt label", type: "text" },
      {
        key: "budget_summary_template",
        label: "Summary template",
        type: "textarea",
        help: "Placeholders: {budget}, {count}, {total} are replaced at runtime.",
      },
    ],
  },
  {
    title: "Search",
    fields: [{ key: "search_placeholder", label: "Search placeholder", type: "text" }],
  },
  {
    title: "Tabs & section headings",
    fields: [
      { key: "tabs_enabled", label: "Section tabs enabled", type: "switch" },
      { key: "tab_label_all", label: "Tab label — All", type: "text" },
      { key: "tab_label_baby", label: "Tab label — Baby", type: "text" },
      { key: "tab_label_mother", label: "Tab label — Mother", type: "text" },
      { key: "tab_label_hospital", label: "Tab label — Hospital", type: "text" },
      { key: "section_heading_baby", label: "Section heading — Baby", type: "text" },
      { key: "section_heading_mother", label: "Section heading — Mother", type: "text" },
      { key: "section_heading_hospital", label: "Section heading — Hospital", type: "text" },
    ],
  },
  {
    title: "Add more products",
    fields: [
      { key: "add_more_enabled", label: "“Add more products” enabled", type: "switch" },
      { key: "add_more_label", label: "Button label", type: "text" },
      { key: "add_more_path", label: "Link path", type: "text", placeholder: "/shop" },
    ],
  },
  {
    title: "WhatsApp help",
    fields: [
      { key: "whatsapp_enabled", label: "WhatsApp help link enabled", type: "switch" },
      { key: "whatsapp_label", label: "Link label", type: "text" },
      { key: "whatsapp_number", label: "WhatsApp number", type: "text", placeholder: "2348012345678" },
    ],
  },
  {
    title: "Empty state",
    fields: [{ key: "empty_state_text", label: "No-results text", type: "textarea" }],
  },
];

const ALL_KEYS = SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

type Config = Record<string, any>;

// ── Page ─────────────────────────────────────────────────────────────
export default function AdminHospitalList() {
  const [tab, setTab] = useState<"settings" | "eligibility">("settings");

  return (
    <div className="max-w-[920px]">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList className="w-6 h-6 text-forest" />
        <h1 className="pf text-2xl font-bold">Hospital List</h1>
      </div>
      <p className="text-text-med text-sm mb-6">
        Manage the public{" "}
        <a href="/hospital-list" target="_blank" rel="noopener noreferrer" className="text-forest font-semibold underline">
          /hospital-list
        </a>{" "}
        page — its copy, toggles, and which products are eligible.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          ["settings", "Page Settings"],
          ["eligibility", "Product Eligibility"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border ${
              tab === key ? "border-forest bg-forest-light text-forest" : "border-border text-text-med"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "settings" ? <PageSettings /> : <ProductEligibility />}
    </div>
  );
}

// ── Page Settings tab ────────────────────────────────────────────────
function PageSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Config | null>(null); // last-persisted snapshot

  const { data, isLoading } = useQuery({
    queryKey: ["hospital-list-config"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_hospital_list_config");
      if (error) throw error;
      return (data || {}) as Config;
    },
  });

  useEffect(() => {
    if (data && !form) {
      setForm({ ...data });
      setSaved({ ...data });
    }
  }, [data, form]);

  const setField = (key: string, value: any) => setForm((prev) => ({ ...(prev || {}), [key]: value }));

  // Only changed fields are sent as the patch.
  const patch = useMemo(() => {
    if (!form || !saved) return {} as Config;
    const out: Config = {};
    for (const k of ALL_KEYS) {
      if (form[k] !== saved[k]) out[k] = form[k];
    }
    return out;
  }, [form, saved]);
  const dirtyCount = Object.keys(patch).length;

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("update_hospital_list_config", { p_patch: patch });
      if (error) throw error;
      return (data || {}) as Config;
    },
    onSuccess: (row) => {
      setForm({ ...row });
      setSaved({ ...row });
      queryClient.setQueryData(["hospital-list-config"], row);
      toast.success("Hospital list settings saved");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save settings"),
  });

  if (isLoading || !form) return <div className="text-center py-10 text-text-med">Loading…</div>;

  return (
    <div className="space-y-5 pb-24">
      {SECTIONS.map((section) => (
        <div key={section.title} className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold mb-1">{section.title}</h3>
          {section.help && <p className="text-xs text-text-light mb-3">{section.help}</p>}
          <div className="space-y-4 mt-3">
            {section.fields.map((field) => (
              <div key={field.key}>
                {field.type === "switch" ? (
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm font-medium text-text-dark">{field.label}</span>
                    <Switch
                      checked={!!form[field.key]}
                      onCheckedChange={(v) => setField(field.key, v)}
                    />
                  </label>
                ) : (
                  <>
                    <label className="block text-xs font-semibold text-text-med mb-1">{field.label}</label>
                    {field.type === "textarea" ? (
                      <textarea
                        value={form[field.key] ?? ""}
                        onChange={(e) => setField(field.key, e.target.value)}
                        rows={2}
                        placeholder={field.placeholder}
                        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                      />
                    ) : (
                      <input
                        value={form[field.key] ?? ""}
                        onChange={(e) => setField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                      />
                    )}
                  </>
                )}
                {field.type !== "switch" && field.help && (
                  <p className="text-xs text-text-light mt-1">{field.help}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border px-5 py-3 flex items-center justify-end gap-3">
        <span className="text-xs text-text-light">
          {dirtyCount === 0 ? "No unsaved changes" : `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`}
        </span>
        <button
          onClick={() => save.mutate()}
          disabled={dirtyCount === 0 || save.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" /> {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ── Product Eligibility tab — section manager ────────────────────────
type SectionKey = "baby" | "mother" | "hospital";
const ELIG_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "baby", label: "Baby" },
  { key: "mother", label: "Mother" },
  { key: "hospital", label: "Hospital" },
];
// Mirror the public page's category→section fallback for optimistic moves
// when the admin picks "Auto" (server is authoritative on the response).
const deriveSection = (cat: string | null): SectionKey =>
  cat === "baby" ? "baby" : cat === "mum" ? "mother" : "hospital";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface EligibilityRow {
  product_id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  on_hospital_list: boolean;
  section_override: string | null;
  resolved_section: SectionKey;
}

export function ProductEligibility() {
  const [rows, setRows] = useState<EligibilityRow[]>([]);
  const [query, setQuery] = useState(""); // filters the on-list section groups
  const [addQuery, setAddQuery] = useState(""); // filters the add-products area
  const [showAdd, setShowAdd] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["hospital-list-eligibility"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_list_hospital_list_eligibility");
      if (error) throw error;
      return (data || []) as EligibilityRow[];
    },
  });

  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const markPending = (id: string, on: boolean) =>
    setPending((prev) => {
      const n = new Set(prev);
      on ? n.add(id) : n.delete(id);
      return n;
    });

  // Add / remove from the hospital list (hospital-bag scope).
  const setOnList = async (row: EligibilityRow, next: boolean) => {
    setRows((prev) => prev.map((r) => (r.product_id === row.product_id ? { ...r, on_hospital_list: next } : r)));
    markPending(row.product_id, true);
    const { data, error } = await (supabase as any).rpc("admin_toggle_hospital_list_eligibility", {
      p_product_id: row.product_id,
      p_on: next,
    });
    markPending(row.product_id, false);
    if (error) {
      setRows((prev) => prev.map((r) => (r.product_id === row.product_id ? { ...r, on_hospital_list: !next } : r)));
      toast.error(error.message || "Could not update product");
      return;
    }
    const serverState = typeof data === "boolean" ? data : next;
    setRows((prev) =>
      prev.map((r) => (r.product_id === row.product_id ? { ...r, on_hospital_list: serverState } : r)),
    );
    toast.success(`${row.name} ${serverState ? "added to" : "removed from"} the hospital list`);
  };

  // Pin to a section, or 'auto' to clear the override (fall back to category).
  const setSection = async (row: EligibilityRow, value: SectionKey | "auto") => {
    const snapshot = { section_override: row.section_override, resolved_section: row.resolved_section };
    const optimisticOverride = value === "auto" ? null : value;
    const optimisticResolved: SectionKey = value === "auto" ? deriveSection(row.category) : value;
    setRows((prev) =>
      prev.map((r) =>
        r.product_id === row.product_id
          ? { ...r, section_override: optimisticOverride, resolved_section: optimisticResolved }
          : r,
      ),
    );
    markPending(row.product_id, true);
    const { data, error } = await (supabase as any).rpc("admin_set_hospital_list_section", {
      p_product_id: row.product_id,
      p_section: value,
    });
    markPending(row.product_id, false);
    if (error) {
      setRows((prev) => prev.map((r) => (r.product_id === row.product_id ? { ...r, ...snapshot } : r)));
      toast.error(error.message || "Could not move product");
      return;
    }
    const resolved = (typeof data === "string" ? data : optimisticResolved) as SectionKey;
    setRows((prev) =>
      prev.map((r) =>
        r.product_id === row.product_id
          ? { ...r, section_override: optimisticOverride, resolved_section: resolved }
          : r,
      ),
    );
    toast.success(`${row.name} → ${cap(resolved)}${optimisticOverride ? "" : " (auto)"}`);
  };

  const matchesQuery = (r: EligibilityRow, q: string) =>
    !q || `${r.name} ${r.category ?? ""} ${r.subcategory ?? ""}`.toLowerCase().includes(q);

  // On-list products grouped by resolved section, filtered by the group search.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map: Record<SectionKey, EligibilityRow[]> = { baby: [], mother: [], hospital: [] };
    for (const r of rows) {
      if (!r.on_hospital_list || !matchesQuery(r, q)) continue;
      (map[r.resolved_section] || map.hospital).push(r);
    }
    return map;
  }, [rows, query]);

  // Off-list products for the Add area, filtered by the add search.
  const offList = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return rows.filter((r) => !r.on_hospital_list && matchesQuery(r, q));
  }, [rows, addQuery]);

  const onCount = rows.filter((r) => r.on_hospital_list).length;
  const ADD_CAP = 60;

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs text-text-light">
          Controls which products appear on the public hospital-list page and in which section. The section here
          is hospital-list display only — it does <span className="font-semibold">not</span> change the product’s
          storefront category. Prices, brands, and images are edited in Products / Brands / Inventory.
        </p>
      </div>

      {/* Add products */}
      <div className="bg-card border border-border rounded-xl p-5">
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 text-sm font-bold"
        >
          <Plus className="w-4 h-4 text-forest" /> Add products to the hospital list
          <span className="text-xs font-normal text-text-light">({rows.length - onCount} not on list)</span>
        </button>
        {showAdd && (
          <div className="mt-4">
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-text-light absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Search products to add…"
                className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-background"
              />
            </div>
            {offList.length === 0 ? (
              <div className="text-center py-6 text-text-light text-sm">No products to add.</div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {offList.slice(0, ADD_CAP).map((row) => (
                    <div key={row.product_id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-dark truncate">{row.name}</div>
                        <div className="text-xs text-text-light truncate">
                          {row.category || "—"}
                          {row.subcategory ? ` · ${row.subcategory}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => setOnList(row, true)}
                        disabled={pending.has(row.product_id)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-forest text-primary-foreground px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  ))}
                </div>
                {offList.length > ADD_CAP && (
                  <p className="text-xs text-text-light mt-3">
                    Showing {ADD_CAP} of {offList.length}. Search to narrow.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* On-list groups */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-bold">On the hospital list ({onCount})</h3>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-text-light absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter on-list products…"
              className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-background"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-text-med">Loading…</div>
        ) : (
          <div className="space-y-6">
            {ELIG_SECTIONS.map((sec) => {
              const items = grouped[sec.key];
              return (
                <div key={sec.key}>
                  <div className="bg-forest border-t-4 border-forest-deep px-4 py-2 rounded-t-lg">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-primary-foreground">
                      {sec.label} <span className="font-normal opacity-80">· {items.length}</span>
                    </h4>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-text-light py-3 px-1">No products in this section.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {items.map((row) => (
                        <div key={row.product_id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-dark truncate">{row.name}</div>
                            <div className="text-xs text-text-light truncate">
                              {row.category || "—"}
                              {row.subcategory ? ` · ${row.subcategory}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={row.section_override ?? "auto"}
                              disabled={pending.has(row.product_id)}
                              onChange={(e) => setSection(row, e.target.value as SectionKey | "auto")}
                              className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background disabled:opacity-50"
                              aria-label={`Section for ${row.name}`}
                            >
                              <option value="baby">Baby</option>
                              <option value="mother">Mother</option>
                              <option value="hospital">Hospital</option>
                              <option value="auto">Auto ({cap(deriveSection(row.category))})</option>
                            </select>
                            <button
                              onClick={() => setOnList(row, false)}
                              disabled={pending.has(row.product_id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border text-text-med px-2.5 py-1.5 text-xs font-semibold hover:border-destructive hover:text-destructive disabled:opacity-50"
                              aria-label={`Remove ${row.name}`}
                            >
                              <X className="w-3.5 h-3.5" /> Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
