import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, ChevronDown, ChevronUp, Eye, EyeOff, ImageOff } from "lucide-react";
import BrandImageUpload from "@/components/admin/BrandImageUpload";

type DisplayType = "bar" | "popup" | "banner";
type Audience = "all" | "new_visitor" | "returning_visitor" | "cart_not_empty";
type Frequency = "every_visit" | "once_per_session" | "once_ever";
type PopupPosition =
  | "center" | "top" | "bottom"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface AnnouncementRow {
  id: string;
  title: string | null;
  message: string | null;
  display_type: DisplayType;
  image_url: string | null;
  popup_position: PopupPosition;
  bg_color: string | null;
  text_color: string | null;
  emoji: string | null;
  link_url: string | null;
  link_text: string | null;
  is_active: boolean;
  priority: number | null;
  starts_at: string | null;
  ends_at: string | null;
  target_pages: string[] | null;
  excluded_pages: string[] | null;
  target_audience: Audience | null;
  popup_delay_seconds: number | null;
  popup_frequency: Frequency | null;
  show_on_exit_intent: boolean | null;
  linked_product_id: string | null;
  linked_coupon_code: string | null;
  display_order: number | null;
}

const BLANK: Omit<AnnouncementRow, "id"> = {
  title: "",
  message: "",
  display_type: "bar",
  image_url: null,
  popup_position: "center",
  bg_color: "#2D6A4F",
  text_color: "#FFFFFF",
  emoji: "",
  link_url: "",
  link_text: "",
  is_active: false,
  priority: 0,
  starts_at: null,
  ends_at: null,
  target_pages: [],
  excluded_pages: [],
  target_audience: "all",
  popup_delay_seconds: 3,
  popup_frequency: "once_per_session",
  show_on_exit_intent: false,
  linked_product_id: null,
  linked_coupon_code: "",
  display_order: 0,
};

// 3x3 position grid: labels + the value each cell maps to. Center is the
// middle cell; the 4 sides and 4 corners map to the 6 edge/corner values.
const POSITION_GRID: Array<{ value: PopupPosition; label: string } | null> = [
  { value: "top-left", label: "Top left" },
  { value: "top", label: "Top" },
  { value: "top-right", label: "Top right" },
  null,
  { value: "center", label: "Center" },
  null,
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom", label: "Bottom" },
  { value: "bottom-right", label: "Bottom right" },
];

const DISPLAY_TYPE_COLORS: Record<string, string> = {
  bar: "bg-forest/10 text-forest",
  popup: "bg-coral/10 text-coral",
  banner: "bg-blue-100 text-blue-700",
};

const DISPLAY_TYPE_LABELS: Record<string, string> = {
  bar: "Bar",
  popup: "Popup",
  banner: "Banner",
};

function pagesFromString(s: string): string[] {
  return s.split(",").map(p => p.trim()).filter(Boolean);
}

function pagesToString(arr: string[] | null): string {
  return (arr || []).join(", ");
}

function localDate(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

function isoFromLocal(s: string): string | null {
  if (!s) return null;
  return new Date(s).toISOString();
}

function scheduleStatus(a: Pick<AnnouncementRow, "is_active" | "starts_at" | "ends_at">): {
  label: string;
  cls: string;
} {
  if (!a.is_active) return { label: "Draft", cls: "bg-muted text-text-light" };
  const now = Date.now();
  const start = a.starts_at ? new Date(a.starts_at).getTime() : null;
  const end = a.ends_at ? new Date(a.ends_at).getTime() : null;
  if (end !== null && end < now) return { label: "Ended", cls: "bg-muted text-text-light" };
  if (start !== null && start > now) return { label: "Scheduled", cls: "bg-amber-100 text-amber-700" };
  return { label: "Live now", cls: "bg-forest/10 text-forest" };
}

function targetSummary(pages: string[] | null, excluded?: string[] | null): string {
  const n = (pages || []).filter(Boolean).length;
  const ex = (excluded || []).filter(Boolean).length;
  const base = n === 0 ? "All pages" : `${n} page${n === 1 ? "" : "s"}`;
  return ex > 0 ? `${base} except ${ex}` : base;
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function AnnouncementForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Partial<AnnouncementRow>;
  onSave: (data: Omit<AnnouncementRow, "id">) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Omit<AnnouncementRow, "id">>({ ...BLANK, ...initial });
  const [showPreview, setShowPreview] = useState(true);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const isPopup = form.display_type === "popup";

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Preview toggle header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
        <h3 className="text-sm font-bold text-foreground">
          {initial && (initial as any).id ? "Edit announcement" : "New announcement"}
        </h3>
        <button
          onClick={() => setShowPreview(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text-med hover:bg-muted transition-colors"
        >
          {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showPreview ? "Hide" : "Show"} preview
        </button>
      </div>

      <div className={`grid gap-6 ${showPreview ? "lg:grid-cols-[1fr_360px]" : "grid-cols-1"}`}>
        {/* ── Fields column ── */}
        <div className="space-y-4">
      {/* Row 1: title + type + priority */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-text-med block mb-1">Title</label>
          <input
            value={form.title || ""}
            onChange={e => set("title", e.target.value)}
            placeholder="Internal name or headline"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Display Type</label>
          <select
            value={form.display_type}
            onChange={e => set("display_type", e.target.value as DisplayType)}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          >
            <option value="bar">Bar (top strip)</option>
            <option value="popup">Popup (modal)</option>
            <option value="banner">Banner (inline strip)</option>
          </select>
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="text-xs font-semibold text-text-med block mb-1">Message</label>
        <textarea
          value={form.message || ""}
          onChange={e => set("message", e.target.value)}
          rows={2}
          placeholder="Announcement body text"
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none"
        />
      </div>

      {/* Emoji + Colors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Emoji</label>
          <input
            value={form.emoji || ""}
            onChange={e => set("emoji", e.target.value)}
            placeholder="🎉"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Background</label>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={form.bg_color || "#1a2e1a"}
              onChange={e => set("bg_color", e.target.value)}
              className="w-9 h-9 rounded border border-input cursor-pointer"
            />
            <input
              value={form.bg_color || ""}
              onChange={e => set("bg_color", e.target.value)}
              className="flex-1 min-w-0 border border-input rounded-lg px-2 py-2 text-xs bg-background font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Text Color</label>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={form.text_color || "#ffffff"}
              onChange={e => set("text_color", e.target.value)}
              className="w-9 h-9 rounded border border-input cursor-pointer"
            />
            <input
              value={form.text_color || ""}
              onChange={e => set("text_color", e.target.value)}
              className="flex-1 min-w-0 border border-input rounded-lg px-2 py-2 text-xs bg-background font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Priority</label>
          <input
            type="number"
            value={form.priority ?? 0}
            onChange={e => set("priority", Number(e.target.value))}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
      </div>

      {/* Link */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Link URL</label>
          <input
            value={form.link_url || ""}
            onChange={e => set("link_url", e.target.value)}
            placeholder="https://..."
            type="url"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Link Text</label>
          <input
            value={form.link_text || ""}
            onChange={e => set("link_text", e.target.value)}
            placeholder="Shop now →"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Starts At (optional)</label>
          <input
            type="datetime-local"
            value={localDate(form.starts_at)}
            onChange={e => set("starts_at", isoFromLocal(e.target.value))}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Ends At (optional)</label>
          <input
            type="datetime-local"
            value={localDate(form.ends_at)}
            onChange={e => set("ends_at", isoFromLocal(e.target.value))}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
      </div>

      {/* Targeting */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">
            Target Pages <span className="font-normal text-text-light">(blank = all)</span>
          </label>
          <input
            value={pagesToString(form.target_pages)}
            onChange={e => set("target_pages", pagesFromString(e.target.value))}
            placeholder="/cart, /checkout, /shop"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
          {/* Excluded pages: identical control, directly beneath target pages */}
          <label className="text-xs font-semibold text-text-med block mb-1 mt-3">
            Excluded pages <span className="font-normal text-text-light">(optional)</span>
          </label>
          <input
            value={pagesToString(form.excluded_pages)}
            onChange={e => set("excluded_pages", pagesFromString(e.target.value))}
            placeholder="/checkout, /cart"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
          <p className="text-[11px] text-text-light mt-1 leading-relaxed">
            Pages to hide this on, even if it would otherwise show. Leave empty for none.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Target Audience</label>
          <select
            value={form.target_audience || "all"}
            onChange={e => set("target_audience", e.target.value as Audience)}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          >
            <option value="all">Everyone</option>
            <option value="new_visitor">New visitors</option>
            <option value="returning_visitor">Returning visitors</option>
            <option value="cart_not_empty">Cart not empty</option>
          </select>
        </div>
      </div>
      <p className="text-[11px] text-text-light -mt-1 leading-relaxed">
        Empty target pages means all pages. Excluded pages are removed from wherever it would otherwise show.
      </p>

      {/* Popup-specific settings */}
      {isPopup && (
        <div className="bg-muted/40 rounded-lg p-3 space-y-3 border border-border">
          <div className="text-xs font-bold text-text-light uppercase tracking-wider mb-1">Popup Settings</div>

          {/* Optional image */}
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1.5">
              Image <span className="font-normal text-text-light">(optional)</span>
            </label>
            <div className="flex items-start gap-3">
              <BrandImageUpload
                label="Popup image"
                currentUrl={form.image_url}
                onUploaded={(url) => set("image_url", url)}
                onRemove={() => set("image_url", null)}
                bucket="product-images"
                folder="announcements"
              />
              <p className="text-[11px] text-text-light leading-relaxed flex-1 pt-0.5">
                Self-hosted upload. Most popups look best without one. If you skip it,
                the popup still renders as a complete, premium text layout.
              </p>
            </div>
          </div>

          {/* Position picker (3x3 grid) */}
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1.5">Position on screen</label>
            <div className="grid grid-cols-3 gap-1.5 max-w-[220px]">
              {POSITION_GRID.map((cell, i) =>
                cell ? (
                  <button
                    key={cell.value}
                    type="button"
                    onClick={() => set("popup_position", cell.value)}
                    title={cell.label}
                    className={`h-11 rounded-lg border text-[10px] font-semibold transition-colors ${
                      form.popup_position === cell.value
                        ? "bg-forest text-primary-foreground border-forest"
                        : "bg-background border-input text-text-light hover:border-forest"
                    }`}
                  >
                    {cell.label}
                  </button>
                ) : (
                  <div key={`sp-${i}`} className="h-11" />
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Delay (seconds)</label>
              <input
                type="number"
                min={0}
                value={form.popup_delay_seconds ?? 3}
                onChange={e => set("popup_delay_seconds", Number(e.target.value))}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Frequency</label>
              <select
                value={form.popup_frequency || "once_per_session"}
                onChange={e => set("popup_frequency", e.target.value as Frequency)}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
              >
                <option value="every_visit">Every visit</option>
                <option value="once_per_session">Once per session</option>
                <option value="once_ever">Once ever</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.show_on_exit_intent}
                  onChange={e => set("show_on_exit_intent", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium">Exit intent trigger</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Linked coupon / product */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Linked Coupon Code</label>
          <input
            value={form.linked_coupon_code || ""}
            onChange={e => set("linked_coupon_code", e.target.value)}
            placeholder="SAVE10"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Display Order</label>
          <input
            type="number"
            value={form.display_order ?? 0}
            onChange={e => set("display_order", Number(e.target.value))}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={e => set("is_active", e.target.checked)}
            className="rounded"
          />
          <span className="text-sm font-semibold">Active (visible on site)</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.message?.trim()}
          className="px-4 py-2 rounded-lg bg-forest text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-opacity"
        >
          {saving ? "Saving…" : "Save announcement"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border text-sm font-semibold text-text-med hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
        </div>

        {/* ── Live preview column ── */}
        {showPreview && (
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-2">Live preview</div>
            <div className="rounded-xl bg-gradient-to-br from-forest/20 to-coral/20 p-6 border border-border min-h-[400px] flex items-center justify-center">
              {form.message?.trim() || form.title?.trim() ? (
                <AnnouncementPreview form={form} />
              ) : (
                <div className="text-center text-text-light text-xs py-12">
                  <div className="text-3xl mb-2 opacity-40">📣</div>
                  <p>Nothing to preview yet.</p>
                  <p className="mt-1">Enter a title or message to see it here.</p>
                </div>
              )}
            </div>
            <div className="text-[10px] text-text-light mt-2 leading-relaxed">
              Preview reflects unsaved changes in real time. Displayed with example styling
              as it would appear on the live site.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Preview component ───────────────────────────────────────────────────────

function AnnouncementPreview({ form }: { form: Omit<AnnouncementRow, "id"> }) {
  const bg = form.bg_color || "#1a2e1a";
  const fg = form.text_color || "#ffffff";

  // Bar / banner: full-width horizontal strip
  if (form.display_type === "bar" || form.display_type === "banner") {
    return (
      <div className="w-full flex flex-col gap-3 items-center">
        <div
          className="relative w-full rounded-md flex items-center justify-center px-8 py-2.5 shadow-md"
          style={{ backgroundColor: bg, color: fg, minHeight: 40 }}
        >
          <span className="text-[13px] font-medium font-body truncate">
            {form.emoji ? `${form.emoji} ` : ""}
            {form.message || form.title || "(empty)"}
            {form.link_text ? (
              <span className="ml-2 underline font-semibold">{form.link_text}</span>
            ) : null}
          </span>
          <button
            className="absolute right-2 p-1 rounded-full opacity-70"
            aria-label="Dismiss"
            tabIndex={-1}
          >
            <X size={14} style={{ color: fg }} />
          </button>
        </div>
        <p className="text-[10px] text-text-light italic">
          Stacked below the legacy AnnouncementBar at the top of every matching page
        </p>
      </div>
    );
  }

  // Popup: modal card. Renders the same two states as the storefront:
  // WITH image (image at the top) and WITHOUT (clean, balanced text-first card).
  const hasImage = !!form.image_url;
  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div
        className="relative rounded-2xl shadow-2xl max-w-[300px] w-full overflow-hidden text-center"
        style={{ backgroundColor: bg, color: fg }}
      >
        <button
          className="absolute top-2.5 right-2.5 z-10 p-1 rounded-full bg-black/20"
          aria-label="Close"
          tabIndex={-1}
        >
          <X size={16} style={{ color: fg }} />
        </button>

        {hasImage && (
          <img
            src={form.image_url as string}
            alt=""
            className="w-full h-32 object-cover"
          />
        )}

        <div className={hasImage ? "p-5" : "p-6 pt-8"}>
          {form.emoji && <div className="text-4xl mb-3">{form.emoji}</div>}
          {form.title && <h2 className="pf text-lg font-bold mb-2 leading-tight">{form.title}</h2>}
          {form.message && <p className="text-[13px] leading-relaxed mb-4 opacity-90">{form.message}</p>}
          {form.linked_coupon_code && (
            <div className="mb-4">
              <span
                className="inline-block px-4 py-2 rounded-lg border-2 border-dashed font-mono font-bold text-sm tracking-wider"
                style={{ borderColor: fg }}
              >
                {form.linked_coupon_code}
              </span>
            </div>
          )}
          {(form.link_url || form.link_text) && (
            <div
              className="block w-full text-center px-4 py-2.5 rounded-lg font-semibold text-sm"
              style={{ backgroundColor: fg, color: bg }}
            >
              {form.link_text || "Learn more"}
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-text-light italic">
        {hasImage ? "With image" : "No image (text-first)"} · Position: {form.popup_position}
      </p>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function AdminAnnouncementsTab() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: announcements, isLoading } = useQuery<AnnouncementRow[]>({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("announcements")
        .select("*")
        .order("priority", { ascending: false })
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Omit<AnnouncementRow, "id"> }) => {
      // Both page arrays are NOT NULL in the DB (default {}). Always send arrays.
      const payload = {
        ...data,
        target_pages: data.target_pages || [],
        excluded_pages: data.excluded_pages || [],
      };
      if (id) {
        const { error } = await (supabase as any).from("announcements").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("announcements").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setCreating(false);
      setEditingId(null);
      toast.success("Announcement saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("announcements")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setConfirmDeleteId(null);
      toast.success("Announcement deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  if (isLoading) return <div className="py-10 text-center text-text-light text-sm">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-light">
            {announcements?.length ?? 0} announcement{announcements?.length !== 1 ? "s" : ""}
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-forest text-primary-foreground text-xs font-semibold hover:bg-forest/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Announcement
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <AnnouncementForm
          initial={BLANK}
          onSave={data => saveMutation.mutate({ data })}
          onCancel={() => setCreating(false)}
          saving={saveMutation.isPending}
        />
      )}

      {/* List */}
      {(!announcements || announcements.length === 0) && !creating ? (
        <div className="text-center py-16 text-text-light text-sm">
          <div className="text-3xl mb-2">📣</div>
          <p>No announcements yet.</p>
          <p className="text-xs mt-1">Create one to show bars or popups on the storefront.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(announcements || []).map(a => (
            <div key={a.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Collapsed row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Thumbnail (image if set, else a neutral no-image marker) */}
                {a.image_url ? (
                  <img
                    src={a.image_url}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-border"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center border border-border"
                    style={{ backgroundColor: a.bg_color || "#2D6A4F" }}
                    title="No image"
                  >
                    <ImageOff className="w-3.5 h-3.5" style={{ color: a.text_color || "#FFFFFF", opacity: 0.6 }} />
                  </div>
                )}

                {/* Type badge */}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${DISPLAY_TYPE_COLORS[a.display_type] || "bg-muted text-text-med"}`}>
                  {DISPLAY_TYPE_LABELS[a.display_type] || a.display_type}
                </span>

                {/* Title + message */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block">
                    {a.emoji ? `${a.emoji} ` : ""}{a.title || a.message || "Untitled"}
                  </span>
                  <span className="text-xs text-text-light truncate block">
                    {targetSummary(a.target_pages, a.excluded_pages)}
                    {a.priority ? ` · priority ${a.priority}` : ""}
                    {a.title && a.message ? ` · ${a.message}` : ""}
                  </span>
                </div>

                {/* Schedule status */}
                {(() => {
                  const st = scheduleStatus(a);
                  return (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 hidden sm:block ${st.cls}`}>
                      {st.label}
                    </span>
                  );
                })()}

                {/* Active toggle */}
                <button
                  onClick={() => toggleActiveMutation.mutate({ id: a.id, is_active: !a.is_active })}
                  className="flex-shrink-0"
                  title={a.is_active ? "Deactivate" : "Activate"}
                >
                  {a.is_active
                    ? <ToggleRight className="w-5 h-5 text-forest" />
                    : <ToggleLeft className="w-5 h-5 text-text-light" />}
                </button>

                {/* Edit */}
                <button
                  onClick={() => { setEditingId(editingId === a.id ? null : a.id); setCreating(false); }}
                  className="p-1.5 rounded hover:bg-muted transition-colors flex-shrink-0"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5 text-text-med" />
                </button>

                {/* Delete */}
                {confirmDeleteId === a.id ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => deleteMutation.mutate(a.id)}
                      className="px-2 py-1 rounded bg-destructive text-primary-foreground text-[10px] font-semibold"
                    >
                      Confirm
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="p-1 rounded hover:bg-muted">
                      <X className="w-3 h-3 text-text-light" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(a.id)}
                    className="p-1.5 rounded hover:bg-destructive/10 transition-colors flex-shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}

                {/* Expand details */}
                <button
                  onClick={() => toggleExpanded(a.id)}
                  className="p-1.5 rounded hover:bg-muted transition-colors flex-shrink-0"
                >
                  {expanded.has(a.id)
                    ? <ChevronUp className="w-3.5 h-3.5 text-text-light" />
                    : <ChevronDown className="w-3.5 h-3.5 text-text-light" />}
                </button>
              </div>

              {/* Expanded details (read-only summary) */}
              {expanded.has(a.id) && !editingId && (
                <div className="px-4 pb-3 pt-0 grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 border-t border-border text-[11px] text-text-light bg-muted/20">
                  <div><span className="font-semibold text-text-med">Audience:</span> {a.target_audience || "all"}</div>
                  <div><span className="font-semibold text-text-med">Pages:</span> {(a.target_pages || []).join(", ") || "all"}</div>
                  {(a.excluded_pages || []).filter(Boolean).length > 0 && (
                    <div><span className="font-semibold text-text-med">Excluded:</span> {(a.excluded_pages || []).join(", ")}</div>
                  )}
                  <div><span className="font-semibold text-text-med">Priority:</span> {a.priority ?? 0}</div>
                  <div><span className="font-semibold text-text-med">Order:</span> {a.display_order ?? 0}</div>
                  {a.display_type === "popup" && <>
                    <div><span className="font-semibold text-text-med">Position:</span> {a.popup_position || "center"}</div>
                    <div><span className="font-semibold text-text-med">Image:</span> {a.image_url ? "Yes" : "No"}</div>
                    <div><span className="font-semibold text-text-med">Delay:</span> {a.popup_delay_seconds ?? 0}s</div>
                    <div><span className="font-semibold text-text-med">Frequency:</span> {a.popup_frequency || "every_visit"}</div>
                    <div><span className="font-semibold text-text-med">Exit intent:</span> {a.show_on_exit_intent ? "Yes" : "No"}</div>
                  </>}
                  {a.linked_coupon_code && <div><span className="font-semibold text-text-med">Coupon:</span> {a.linked_coupon_code}</div>}
                  {a.link_url && <div className="col-span-2 truncate"><span className="font-semibold text-text-med">Link:</span> {a.link_url}</div>}
                </div>
              )}

              {/* Edit form (inline) */}
              {editingId === a.id && (
                <div className="px-4 pb-4 border-t border-border">
                  <AnnouncementForm
                    initial={a}
                    onSave={data => saveMutation.mutate({ id: a.id, data })}
                    onCancel={() => setEditingId(null)}
                    saving={saveMutation.isPending}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
