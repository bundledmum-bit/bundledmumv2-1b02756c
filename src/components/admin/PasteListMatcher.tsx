import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ClipboardPaste, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { fmtN, QUOTE_SECTIONS } from "@/components/admin/PackageItemsBuilder";

// "Paste the list" fast quote builder. The admin pastes the customer's whole
// list; bulk_match_hospital_list() (already live, tested) returns ONE ROW PER
// INPUT LINE — matches AND misses — which we surface in a review table. Nothing
// is auto-accepted: partial / no-match rows are flagged and unchecked by
// default so a human confirms every line before it enters the quote.

const VALID_SECTIONS = new Set<string>(QUOTE_SECTIONS.map((s) => s.key));

interface Alternative {
  brand_id: string;
  brand_name: string;
  price: number;
}

interface MatchRow {
  out_line_no: number;
  out_raw_line: string;
  out_query: string;
  out_quantity: number;
  out_product_id: string | null;
  out_product_name: string | null;
  out_brand_id: string | null;
  out_brand_name: string | null;
  out_price: number | null;
  out_section: string | null;
  out_confidence: "high" | "partial" | "none" | string;
  out_alternatives: Alternative[] | null;
  out_matched: boolean;
}

// Local editable row derived from a MatchRow.
interface ReviewRow {
  lineNo: number;
  rawLine: string;
  matched: boolean;
  confidence: "high" | "partial" | "none" | string;
  productId: string | null;
  productName: string | null;
  section: string | null;
  // Editable / selectable:
  quantity: number;
  brandId: string | null;
  brandName: string | null;
  price: number;
  include: boolean;
  // All brand options for this product's SAME product (matched brand + alts).
  brandOptions: Alternative[];
}

export interface PasteAddPayload {
  productId: string;
  productName: string;
  brandId: string;
  brandName: string;
  price: number;
  quantity: number;
  section: string | null;
}

function toReviewRow(r: MatchRow): ReviewRow {
  const alts = Array.isArray(r.out_alternatives) ? r.out_alternatives : [];
  // Brand options = the matched brand first, then alternatives for the SAME
  // product, de-duplicated by brand_id. Never invents a brand or price.
  const options: Alternative[] = [];
  const seen = new Set<string>();
  if (r.out_brand_id) {
    options.push({ brand_id: r.out_brand_id, brand_name: r.out_brand_name || "Brand", price: Number(r.out_price) || 0 });
    seen.add(r.out_brand_id);
  }
  for (const a of alts) {
    if (a?.brand_id && !seen.has(a.brand_id)) {
      options.push({ brand_id: a.brand_id, brand_name: a.brand_name, price: Number(a.price) || 0 });
      seen.add(a.brand_id);
    }
  }
  return {
    lineNo: r.out_line_no,
    rawLine: r.out_raw_line,
    matched: !!r.out_matched,
    confidence: r.out_confidence,
    productId: r.out_product_id,
    productName: r.out_product_name,
    section: r.out_section && VALID_SECTIONS.has(r.out_section) ? r.out_section : null,
    quantity: Math.max(1, Number(r.out_quantity) || 1),
    brandId: r.out_brand_id,
    brandName: r.out_brand_name,
    price: Number(r.out_price) || 0,
    // Default: only auto-include confidently matched lines. Partial/none stay
    // unchecked so the admin opts in deliberately.
    include: !!r.out_matched,
    brandOptions: options,
  };
}

const confidenceStyle = (c: string, matched: boolean) => {
  if (!matched || c === "none") return { label: "No match", cls: "bg-destructive/10 text-destructive border-destructive/30" };
  if (c === "partial") return { label: "Check this", cls: "bg-amber-100 text-amber-800 border-amber-300" };
  return { label: "High", cls: "bg-forest-light text-forest border-forest/30" };
};
// The whole row gets a subtle wash so misses/partials are impossible to miss.
const rowWash = (c: string, matched: boolean) => {
  if (!matched || c === "none") return "bg-destructive/5";
  if (c === "partial") return "bg-amber-50";
  return "";
};

export default function PasteListMatcher({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  // Inserts the checked rows using the quote builder's existing insert path.
  onAdd: (rows: PasteAddPayload[]) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [adding, setAdding] = useState(false);

  const runMatch = async () => {
    if (!raw.trim()) { toast.error("Paste the customer's list first."); return; }
    setMatching(true);
    try {
      const { data, error } = await (supabase as any).rpc("bulk_match_hospital_list", { p_raw: raw });
      if (error) throw error;
      const parsed = ((data || []) as MatchRow[])
        .slice()
        .sort((a, b) => (a.out_line_no || 0) - (b.out_line_no || 0))
        .map(toReviewRow);
      setRows(parsed);
      if (parsed.length === 0) toast("No lines were parsed from the pasted text.");
    } catch (e: any) {
      toast.error(e?.message || "Could not match the list.");
    } finally {
      setMatching(false);
    }
  };

  const patchRow = (lineNo: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev?.map((r) => (r.lineNo === lineNo ? { ...r, ...patch } : r)) ?? prev);

  const onPickBrand = (lineNo: number, brandId: string) =>
    setRows((prev) =>
      prev?.map((r) => {
        if (r.lineNo !== lineNo) return r;
        const opt = r.brandOptions.find((o) => o.brand_id === brandId);
        if (!opt) return r;
        return { ...r, brandId: opt.brand_id, brandName: opt.brand_name, price: opt.price };
      }) ?? prev,
    );

  const includedRows = useMemo(() => (rows || []).filter((r) => r.include), [rows]);
  const includedTotal = useMemo(
    () => includedRows.reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.quantity) || 0), 0),
    [includedRows],
  );
  // Only rows that are actually addable (checked, and have a product + brand).
  const addableRows = useMemo(
    () => includedRows.filter((r) => r.productId && r.brandId),
    [includedRows],
  );

  const handleAdd = async () => {
    if (addableRows.length === 0) { toast.error("Tick at least one matched line to add."); return; }
    setAdding(true);
    try {
      await onAdd(
        addableRows.map((r) => ({
          productId: r.productId as string,
          productName: r.productName || "",
          brandId: r.brandId as string,
          brandName: r.brandName || "",
          price: Number(r.price) || 0,
          quantity: Math.max(1, Number(r.quantity) || 1),
          section: r.section,
        })),
      );
      toast.success(`Added ${addableRows.length} item${addableRows.length === 1 ? "" : "s"} to the quote.`);
      // Clear the matched rows we just added; keep any the admin left unchecked
      // (e.g. no-match lines they still want to handle manually).
      setRows((prev) => (prev ? prev.filter((r) => !addableRows.some((a) => a.lineNo === r.lineNo)) : prev));
    } catch (e: any) {
      toast.error(e?.message || "Could not add items to the quote.");
    } finally {
      setAdding(false);
    }
  };

  const matchedCount = (rows || []).filter((r) => r.matched).length;
  const flaggedCount = (rows || []).filter((r) => !r.matched || r.confidence === "partial" || r.confidence === "none").length;

  return (
    <section className="bg-card border border-border rounded-xl p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <ClipboardPaste className="w-4 h-4 text-forest" />
        <h2 className="text-sm font-bold flex-1">Paste the list (fast match)</h2>
        {rows && <span className="text-[11px] text-text-med">{matchedCount} matched · {flaggedCount} to check</span>}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {disabled && (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Save the quote first, then paste and match the customer's list.
            </p>
          )}

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold text-text-med mb-1">
              Customer's list (one item per line)
            </label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={6}
              disabled={disabled}
              placeholder={"2 packs of newborn diapers\nMaternity pads\nDettol\nBaby wipes x3"}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background font-mono disabled:opacity-50"
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={runMatch}
                disabled={disabled || matching || !raw.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
              >
                {matching ? <><Loader2 className="w-4 h-4 animate-spin" /> Matching…</> : "Match items"}
              </button>
              {rows && (
                <button
                  type="button"
                  onClick={() => { setRows(null); }}
                  className="text-xs text-text-med hover:underline"
                >
                  Clear results
                </button>
              )}
            </div>
          </div>

          {rows && rows.length > 0 && (
            <>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-muted/50 text-text-med text-left">
                      <th className="p-2 w-8"></th>
                      <th className="p-2">Line</th>
                      <th className="p-2 w-16">Qty</th>
                      <th className="p-2">Match</th>
                      <th className="p-2">Brand</th>
                      <th className="p-2 text-right">Price</th>
                      <th className="p-2 text-right">Line total</th>
                      <th className="p-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const badge = confidenceStyle(r.confidence, r.matched);
                      return (
                        <tr key={r.lineNo} className={`border-t border-border align-top ${rowWash(r.confidence, r.matched)}`}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={r.include}
                              disabled={!r.matched && !r.productId}
                              onChange={(e) => patchRow(r.lineNo, { include: e.target.checked })}
                              className="w-4 h-4 accent-forest disabled:opacity-40"
                            />
                          </td>
                          <td className="p-2 max-w-[220px]">
                            <div className="text-foreground break-words">{r.rawLine}</div>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={1}
                              value={r.quantity}
                              onChange={(e) => patchRow(r.lineNo, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                              className="w-14 border border-input rounded-md px-1.5 py-1 text-[12px] bg-background"
                            />
                          </td>
                          <td className="p-2 max-w-[200px]">
                            {r.productId ? (
                              <span className="text-foreground break-words">{r.productName}</span>
                            ) : (
                              <span className="text-destructive font-semibold">No match</span>
                            )}
                          </td>
                          <td className="p-2">
                            {r.brandOptions.length > 0 ? (
                              <select
                                value={r.brandId || ""}
                                onChange={(e) => onPickBrand(r.lineNo, e.target.value)}
                                className="border border-input rounded-md px-1.5 py-1 text-[12px] bg-background max-w-[180px]"
                              >
                                {r.brandOptions.map((o) => (
                                  <option key={o.brand_id} value={o.brand_id}>
                                    {o.brand_name} · {fmtN(o.price)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-text-med">—</span>
                            )}
                          </td>
                          <td className="p-2 text-right font-mono-price">{r.productId ? fmtN(r.price) : "—"}</td>
                          <td className="p-2 text-right font-mono-price">
                            {r.productId ? fmtN((Number(r.price) || 0) * (Number(r.quantity) || 0)) : "—"}
                          </td>
                          <td className="p-2">
                            <span className={`inline-block rounded-pill px-2 py-0.5 text-[10px] font-bold border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="text-text-med">Included: </span>
                  <span className="font-semibold text-foreground">{addableRows.length}</span>
                  <span className="text-text-med"> line{addableRows.length === 1 ? "" : "s"} · </span>
                  <span className="font-mono-price text-forest font-bold">{fmtN(includedTotal)}</span>
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={disabled || adding || addableRows.length === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
                >
                  {adding ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : `Add ${addableRows.length || ""} to quote`}
                </button>
              </div>
              <p className="text-[11px] text-text-med italic">
                Amber "Check this" and red "No match" rows are not auto-included. Confirm the product,
                brand and price before ticking them. Nothing is added until you press Add to quote.
              </p>
            </>
          )}

          {rows && rows.length === 0 && (
            <p className="text-sm text-text-med">No lines were parsed. Check the pasted text and try again.</p>
          )}
        </div>
      )}
    </section>
  );
}
