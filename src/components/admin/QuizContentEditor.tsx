import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Sparkles } from "lucide-react";

// Keys must mirror HomeQuiz's fallback defaults (see HomeQuiz.tsx).
const FIELDS = {
  labels: [
    { key: "quiz_label_budget", label: "Budget section heading", hint: "Shown above the budget input" },
    { key: "quiz_label_what_you_need", label: "Categories section heading", hint: "Shown above the 3 category cards" },
    { key: "quiz_label_what_you_need_hint", label: "Categories helper hint", hint: "Small italic hint next to the heading" },
    { key: "quiz_label_gender", label: "Gender section heading", hint: "Shown above the 3 gender cards" },
  ],
  cta: [
    { key: "quiz_cta_label", label: "CTA button text", hint: "The button that advances to the WhatsApp screen" },
    { key: "quiz_min_budget", label: "Minimum budget (₦)", hint: "Enforced on blur — users typing a lower value snap up to this", numeric: true },
  ],
  categories: [
    { key: "quiz_category_maternity_title", label: "Maternity — title" },
    { key: "quiz_category_maternity_sub", label: "Maternity — subtitle" },
    { key: "quiz_category_baby_title", label: "Baby — title" },
    { key: "quiz_category_baby_sub", label: "Baby — subtitle" },
    { key: "quiz_category_gift_title", label: "Gift — title" },
    { key: "quiz_category_gift_sub", label: "Gift — subtitle" },
  ],
  gender: [
    { key: "quiz_gender_boy_title", label: "Baby Boy — title" },
    { key: "quiz_gender_boy_sub", label: "Baby Boy — subtitle" },
    { key: "quiz_gender_girl_title", label: "Baby Girl — title" },
    { key: "quiz_gender_girl_sub", label: "Baby Girl — subtitle" },
    { key: "quiz_gender_surprise_title", label: "Surprise — title" },
    { key: "quiz_gender_surprise_sub", label: "Surprise — subtitle" },
  ],
};

function unwrap(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return String(v);
}

export default function QuizContentEditor() {
  const queryClient = useQueryClient();
  const allKeys = [...FIELDS.labels, ...FIELDS.cta, ...FIELDS.categories, ...FIELDS.gender].map(f => f.key);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-quiz-content-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", allKeys);
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
  });

  // Local draft state — keyed by setting key
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (!rows || initialised) return;
    const next: Record<string, string> = {};
    allKeys.forEach(k => { next[k] = unwrap(rows[k]); });
    setDraft(next);
    setInitialised(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const isDirty = rows ? Object.entries(draft).some(([k, v]) => unwrap(rows[k]) !== v) : false;

  const saveAll = useMutation({
    mutationFn: async () => {
      const changed = Object.entries(draft).filter(([k, v]) => unwrap(rows?.[k]) !== v);
      await Promise.all(
        changed.map(([k, v]) => supabase.from("site_settings").upsert({ key: k, value: v }, { onConflict: "key" }))
      );
      const errors = await Promise.all(changed.map(([k, v]) => supabase.from("site_settings").select("value").eq("key", k).single()));
      return errors.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-quiz-content-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      toast.success("Quiz content saved — live on the home quiz now");
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const resetField = (key: string) => setDraft(d => ({ ...d, [key]: unwrap(rows?.[key]) }));

  const renderField = (f: { key: string; label: string; hint?: string; numeric?: boolean }) => {
    const current = draft[f.key] ?? "";
    const original = unwrap(rows?.[f.key]);
    const changed = current !== original;
    return (
      <div key={f.key}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-text-med">{f.label}</label>
          {changed && (
            <button onClick={() => resetField(f.key)} className="text-[10px] text-text-light hover:text-coral">Revert</button>
          )}
        </div>
        <input
          type={f.numeric ? "number" : "text"}
          value={current}
          onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
          className={`w-full border rounded-lg px-3 py-2 text-sm bg-background ${changed ? "border-coral" : "border-input"}`}
        />
        {f.hint && <p className="text-[10px] text-text-light mt-1">{f.hint}</p>}
      </div>
    );
  };

  if (isLoading) return <div className="text-center py-8 text-text-med text-sm">Loading quiz content…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-coral" /> Quiz Content
          </h2>
          <p className="text-text-med text-xs mt-1">
            Edit the visible text and minimum budget shown in the home-page quiz. Saves push live instantly — no deploy needed.
          </p>
        </div>
        <button
          onClick={() => saveAll.mutate()}
          disabled={!isDirty || saveAll.isPending}
          className="flex-shrink-0 flex items-center gap-1.5 bg-forest text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-40"
        >
          <Save className="w-4 h-4" /> {saveAll.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Labels */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4">Section headings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.labels.map(renderField)}
        </div>
      </section>

      {/* CTA & min-budget */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4">CTA & minimum budget</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.cta.map(renderField)}
        </div>
      </section>

      {/* Categories */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold mb-1">Category cards</h3>
        <p className="text-text-light text-[11px] mb-4">The 3 cards under "What do you need?"</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.categories.map(renderField)}
        </div>
      </section>

      {/* Gender */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold mb-1">Gender cards</h3>
        <p className="text-text-light text-[11px] mb-4">The 3 cards under "Baby's gender"</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.gender.map(renderField)}
        </div>
      </section>

      {isDirty && (
        <div className="sticky bottom-4 bg-forest/5 border border-forest/30 rounded-xl p-3 flex items-center justify-between">
          <span className="text-xs text-forest font-semibold">You have unsaved changes</span>
          <button
            onClick={() => saveAll.mutate()}
            disabled={saveAll.isPending}
            className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" /> {saveAll.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
