import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, X, Check, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

interface Props {
  products: any[];
}

const EXPORT_COLUMNS = [
  "Product ID", "SKU", "Product Name", "Slug", "Description", "Category", "Subcategory", "Priority", "Badge",
  "Pack Info", "Material", "Contents", "Allergen Info", "Safety Info", "Why Mums Love This",
  "Rating", "Review Count", "Gender Relevant", "Multiples Bump", "First Baby",
  "Display Order", "Active", "Emoji", "Image URL",
  "Brand Name", "Brand Tier", "Brand Price", "Compare-at Price", "Cost Price (COGS)", "COGS %",
  "Brand Image URL", "Brand Logo URL", "Size Variant", "Stock Quantity", "In Stock",
  "Sizes", "Colours", "Tags", "Meta Title", "Meta Description",
];

export function ExportButton({ products }: Props) {
  const handleExport = () => {
    const rows: any[][] = [EXPORT_COLUMNS];

    for (const p of products) {
      const brands = p.brands || [];
      const sizes = (p.product_sizes || []).map((s: any) => s.size_label).join(", ");
      const colours = (p.product_colors || []).map((c: any) => `${c.color_name}${c.color_hex ? ` (${c.color_hex})` : ""}`).join(", ");
      const tags = (p.product_tags || []).map((t: any) => `${t.tag_type}:${t.tag_value}`).join(", ");

      if (brands.length === 0) {
        rows.push([
          p.id, p.sku || "", p.name, p.slug, p.description, p.category, p.subcategory || "", p.priority, p.badge || "",
          p.pack_count || "", p.material || "", p.contents || "", p.allergen_info || "",
          p.safety_info || "", p.why_included || "", p.rating, p.review_count,
          p.gender_relevant ? "Yes" : "No", p.multiples_bump, p.first_baby === true ? "Yes" : p.first_baby === false ? "No" : "",
          p.display_order, p.is_active ? "Yes" : "No", p.emoji || "", p.image_url || "",
          "", "", "", "", "", "",
          "", "", "", "", "",
          sizes, colours, tags, p.meta_title || "", p.meta_description || "",
        ]);
      } else {
        for (const b of brands) {
          rows.push([
            p.id, p.sku || "", p.name, p.slug, p.description, p.category, p.subcategory || "", p.priority, p.badge || "",
            p.pack_count || "", p.material || "", p.contents || "", p.allergen_info || "",
            p.safety_info || "", p.why_included || "", p.rating, p.review_count,
            p.gender_relevant ? "Yes" : "No", p.multiples_bump, p.first_baby === true ? "Yes" : p.first_baby === false ? "No" : "",
            p.display_order, p.is_active ? "Yes" : "No", p.emoji || "", p.image_url || "",
            b.brand_name, b.tier, b.price, b.compare_at_price || "", b.cost_price || 0, b.cogs_percent ?? 40,
            b.image_url || "", b.logo_url || "", b.size_variant || "",
            b.stock_quantity ?? "", b.in_stock !== false ? "Yes" : "No",
            sizes, colours, tags, p.meta_title || "", p.meta_description || "",
          ]);
        }
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");

    // Branded header styling
    ws["!cols"] = EXPORT_COLUMNS.map((_, i) => ({ wch: Math.max(14, EXPORT_COLUMNS[i].length + 2) }));

    XLSX.writeFile(wb, `BundledMum_Products_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${products.length} products`);
  };

  return (
    <button onClick={handleExport} className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-sm font-semibold hover:bg-muted">
      <Download className="w-4 h-4" /> Export
    </button>
  );
}

type ImportStep = "upload" | "preview" | "importing" | "done";

interface ImportRow {
  raw: Record<string, any>;
  action: "create" | "update";
  errors: string[];
}

export function ImportButton() {
  const [step, setStep] = useState<ImportStep | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState({ created: 0, updated: 0, errors: 0 });
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const reset = () => { setStep(null); setRows([]); setResults({ created: 0, updated: 0, errors: 0 }); setProgress(0); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json: Record<string, any>[] = XLSX.utils.sheet_to_json(ws);

    if (!json.length) { toast.error("Empty file"); return; }

    // Check which products exist
    const slugs = json.map(r => r["Slug"]).filter(Boolean);
    const ids = json.map(r => r["Product ID"]).filter(Boolean);
    const { data: existing } = await supabase.from("products").select("id, slug").or(`slug.in.(${slugs.map(s => `"${s}"`).join(",")}),id.in.(${ids.map(id => `"${id}"`).join(",")})`);

    const existingMap = new Map<string, string>();
    (existing || []).forEach((p: any) => { existingMap.set(p.slug, p.id); existingMap.set(p.id, p.id); });

    const parsed: ImportRow[] = json.map(raw => {
      const errors: string[] = [];
      if (!raw["Product Name"]) errors.push("Missing Product Name");
      if (!raw["Category"] || !["baby", "mum", "both"].includes(raw["Category"])) errors.push("Invalid Category");
      if (!raw["Priority"] || !["essential", "recommended", "nice-to-have"].includes(raw["Priority"])) errors.push("Invalid Priority");
      const costPrice = parseFloat(raw["Cost Price (COGS)"]);
      const brandPrice = parseFloat(raw["Brand Price"]);
      if (costPrice && brandPrice && costPrice > brandPrice) errors.push("COGS > Price");
      const hasMatch = existingMap.has(raw["Slug"]) || existingMap.has(raw["Product ID"]);
      return { raw, action: hasMatch ? "update" : "create", errors };
    });

    setRows(parsed);
    setStep("preview");
    if (fileRef.current) fileRef.current.value = "";
  };

  const runImport = async () => {
    setStep("importing");
    let created = 0, updated = 0, errors = 0;

    // Group rows by product (slug)
    const bySlug = new Map<string, ImportRow[]>();
    for (const row of rows) {
      if (row.errors.length) { errors++; continue; }
      const slug = row.raw["Slug"] || row.raw["Product Name"]?.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug)!.push(row);
    }

    const entries = Array.from(bySlug.entries());
    for (let i = 0; i < entries.length; i++) {
      const [slug, pRows] = entries[i];
      const first = pRows[0].raw;
      setProgress(Math.round(((i + 1) / entries.length) * 100));

      try {
        const productData: any = {
          name: first["Product Name"], slug,
          description: first["Description"] || "",
          category: first["Category"], priority: first["Priority"],
          badge: first["Badge"] || null,
          subcategory: first["Subcategory"] || null,
          pack_count: first["Pack Info"] || null, material: first["Material"] || null,
          contents: first["Contents"] || null, allergen_info: first["Allergen Info"] || null,
          safety_info: first["Safety Info"] || null, why_included: first["Why Mums Love This"] || null,
          rating: parseFloat(first["Rating"]) || 4.5, review_count: parseInt(first["Review Count"]) || 0,
          gender_relevant: first["Gender Relevant"] === "Yes",
          multiples_bump: parseFloat(first["Multiples Bump"]) || 1.0,
          first_baby: first["First Baby"] === "Yes" ? true : first["First Baby"] === "No" ? false : null,
          display_order: parseInt(first["Display Order"]) || 0,
          is_active: first["Active"] !== "No",
          emoji: first["Emoji"] || null, image_url: first["Image URL"] || null,
          meta_title: first["Meta Title"] || null, meta_description: first["Meta Description"] || null,
        };

        // Check if product exists
        const { data: existingProd } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
        let productId: string;

        if (existingProd) {
          await supabase.from("products").update(productData).eq("id", existingProd.id);
          productId = existingProd.id;
          updated++;
        } else {
          const { data: newProd, error } = await supabase.from("products").insert(productData).select("id").single();
          if (error) throw error;
          productId = newProd.id;
          created++;
        }

        // Upsert brands from all rows for this product
        const brandRows = pRows.filter(r => r.raw["Brand Name"]).map((r, idx) => ({
          product_id: productId,
          brand_name: r.raw["Brand Name"],
          tier: r.raw["Brand Tier"] || "standard",
          price: parseInt(r.raw["Brand Price"]) || 0,
          compare_at_price: parseInt(r.raw["Compare-at Price"]) || null,
          cost_price: parseInt(r.raw["Cost Price (COGS)"]) || 0,
          cogs_percent: parseFloat(r.raw["COGS %"]) || 40,
          image_url: r.raw["Brand Image URL"] || null,
          logo_url: r.raw["Brand Logo URL"] || null,
          size_variant: r.raw["Size Variant"] || null,
          stock_quantity: r.raw["Stock Quantity"] === "" ? null : parseInt(r.raw["Stock Quantity"]) ?? null,
          in_stock: r.raw["In Stock"] !== "No",
          display_order: idx,
        }));

        if (brandRows.length) {
          // Reconcile by (product_id, brand_name) instead of the old
          // delete-then-insert pattern, which silently doubled rows
          // every time the DELETE failed (RLS, FK touch, etc.). The
          // same bug took out Baby Wipes with 27 phantom brand rows
          // — see b4f64ab for the matching fix on AdminProductForm.
          const { data: existing, error: fetchErr } = await supabase
            .from("brands")
            .select("id, brand_name")
            .eq("product_id", productId);
          if (fetchErr) throw fetchErr;
          const byName: Record<string, string> = {};
          ((existing as any[]) || []).forEach((r) => {
            byName[String(r.brand_name || "").toLowerCase().trim()] = r.id;
          });

          const incomingNames = new Set(
            brandRows.map((b) => String(b.brand_name || "").toLowerCase().trim()),
          );
          // Drop any brand that the import dropped.
          const removedIds = (existing as any[] || [])
            .filter((r) => !incomingNames.has(String(r.brand_name || "").toLowerCase().trim()))
            .map((r) => r.id);
          if (removedIds.length > 0) {
            const { error: delErr } = await supabase.from("brands").delete().in("id", removedIds);
            if (delErr) throw delErr;
          }
          // Per-row UPDATE for existing brand names, INSERT for new ones.
          for (const row of brandRows) {
            const key = String(row.brand_name || "").toLowerCase().trim();
            const existingId = byName[key];
            if (existingId) {
              const { error: upErr } = await (supabase.from("brands") as any).update(row).eq("id", existingId);
              if (upErr) throw upErr;
            } else {
              const { error: insErr } = await (supabase.from("brands") as any).insert(row);
              if (insErr) throw insErr;
            }
          }
        }
      } catch (err) {
        console.error("[excel-import] product save failed:", err);
        errors++;
      }
    }

    setResults({ created, updated, errors });
    setStep("done");
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  return (
    <>
      <button onClick={() => { setStep("upload"); }} className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-sm font-semibold hover:bg-muted">
        <Upload className="w-4 h-4" /> Import
      </button>
      <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" onChange={handleFile} className="hidden" />

      {step && (
        <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center" onClick={reset}>
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">Import Products from Excel</h3>
              <button onClick={reset}><X className="w-5 h-5" /></button>
            </div>

            {step === "upload" && (
              <div className="p-8 text-center">
                <p className="text-muted-foreground text-sm mb-4">Upload an .xlsx or .csv file with product data</p>
                <button onClick={() => fileRef.current?.click()}
                  className="bg-forest text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-forest-deep">
                  Choose File
                </button>
                <p className="text-muted-foreground text-xs mt-3">Matching products by Slug or Product ID will be updated. Includes COGS fields.</p>
              </div>
            )}

            {step === "preview" && (
              <div className="p-4">
                <div className="flex gap-3 mb-4">
                  <div className="bg-green-50 text-green-700 px-3 py-1.5 rounded text-xs font-semibold">
                    {rows.filter(r => r.action === "create" && !r.errors.length).length} new
                  </div>
                  <div className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded text-xs font-semibold">
                    {rows.filter(r => r.action === "update" && !r.errors.length).length} update
                  </div>
                  {rows.some(r => r.errors.length > 0) && (
                    <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded text-xs font-semibold">
                      {rows.filter(r => r.errors.length > 0).length} errors
                    </div>
                  )}
                </div>
                <div className="max-h-[400px] overflow-y-auto border border-border rounded-lg">
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-left">Brand</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-right">COGS</th>
                        <th className="px-3 py-2 text-left">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((r, i) => (
                        <tr key={i} className={`border-t border-border ${r.errors.length ? "bg-red-50/50" : r.action === "create" ? "bg-green-50/30" : "bg-amber-50/30"}`}>
                          <td className="px-3 py-2">
                            {r.errors.length ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> : <Check className="w-3.5 h-3.5 text-green-600" />}
                          </td>
                          <td className="px-3 py-2 font-semibold">{r.raw["Product Name"]}</td>
                          <td className="px-3 py-2">{r.raw["Brand Name"] || "—"}</td>
                          <td className="px-3 py-2 text-right">₦{parseInt(r.raw["Brand Price"] || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">₦{parseInt(r.raw["Cost Price (COGS)"] || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-red-600">{r.errors.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={reset} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-semibold">Cancel</button>
                  <button onClick={runImport} disabled={!rows.some(r => !r.errors.length)}
                    className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
                    Import {rows.filter(r => !r.errors.length).length} rows
                  </button>
                </div>
              </div>
            )}

            {step === "importing" && (
              <div className="p-8 text-center">
                <div className="w-full bg-muted rounded-full h-3 mb-4">
                  <div className="bg-forest h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-sm text-muted-foreground">Importing... {progress}%</p>
              </div>
            )}

            {step === "done" && (
              <div className="p-8 text-center">
                <Check className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <h3 className="font-bold text-lg mb-2">Import Complete</h3>
                <div className="flex gap-4 justify-center text-sm">
                  <span className="text-green-700">{results.created} created</span>
                  <span className="text-amber-700">{results.updated} updated</span>
                  {results.errors > 0 && <span className="text-red-700">{results.errors} errors</span>}
                </div>
                <button onClick={reset} className="mt-4 bg-forest text-primary-foreground px-6 py-2 rounded-lg font-semibold">Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
