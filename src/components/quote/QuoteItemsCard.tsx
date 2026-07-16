import { useState } from "react";
import { ShoppingBag, Minus, Plus, X } from "lucide-react";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import ImageZoomModal from "@/components/ImageZoomModal";
import { fmt } from "@/lib/cart";

// Normalised item shape shared by the quote page and the landing (package) page,
// so both render an identical item list with section grouping. Callers map their
// own row type (quote share items / landing_page_items) onto this.
export interface QuoteViewItem {
  id: string;
  product_id?: string | null;
  product_name: string;
  brand_name?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  section?: string | null;
  display_order?: number | null;
  image_url?: string | null;
  in_stock?: boolean;
}

// Canonical section order/labels. Exported so the package page can build its
// editable "add products" section list from the same source.
export const QUOTE_ITEM_SECTIONS: Array<{ key: string; label: string }> = [
  { key: "baby", label: "Baby Items" },
  { key: "mother", label: "Mother Items" },
  { key: "hospital", label: "Hospital Items" },
  { key: "postpartum", label: "Postpartum Items" },
  { key: "gift", label: "Gift Items" },
];

// Editing callbacks — all optional. When `editable` is true the caller supplies
// these to turn each row into a qty stepper + size select + remove, and each
// section into an "Add products" affordance. QuotePage never passes these, so it
// stays read-only and unchanged.
interface EditHandlers {
  editable?: boolean;
  sizeOptions?: (item: QuoteViewItem) => string[];
  onQtyChange?: (id: string, qty: number) => void;
  onSizeChange?: (id: string, size: string | null) => void;
  onRemove?: (id: string) => void;
  onAddToSection?: (sectionKey: string | null) => void;
}

function ReadOnlyRow({ it }: { it: QuoteViewItem }) {
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 border border-border">
        {it.image_url ? (
          <Zoom zoomMargin={32} wrapElement="div">
            <img
              src={it.image_url}
              alt={it.product_name}
              className="w-full h-full object-cover cursor-zoom-in"
            />
          </Zoom>
        ) : (
          <div className="w-full h-full grid place-items-center text-text-light">
            <ShoppingBag className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{it.product_name}</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-text-med">
          {it.brand_name && <span>Brand: {it.brand_name}</span>}
          {it.size && <span>Size: {it.size}</span>}
          {it.color && <span>Colour: {it.color}</span>}
        </div>
        {it.in_stock === false && (
          <p className="mt-1 text-[11px] font-semibold text-red-700">
            Out of stock, contact us to substitute
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-text-med">{it.quantity} × {fmt(it.unit_price)}</p>
        <p className="text-sm font-bold">{fmt(it.line_total)}</p>
      </div>
    </div>
  );
}

function EditableRow({ it, h }: { it: QuoteViewItem; h: EditHandlers }) {
  const sizes = h.sizeOptions?.(it) ?? [];
  // Tap the thumbnail to enlarge it in the shared lightbox. Image-only trigger,
  // so the qty/size/remove controls are never affected; the placeholder (no
  // image) is not clickable, so it can never open an empty lightbox.
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  return (
    <div className="px-4 sm:px-5 py-3">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 border border-border">
          {it.image_url ? (
            // Explicit fixed px size (not w-full/h-full): iOS Safari fails to
            // resolve an img's percentage height + object-fit inside a flex item,
            // collapsing it to 0. A definite size renders reliably on iOS.
            <button
              type="button"
              onClick={() => setZoomSrc(it.image_url || null)}
              aria-label={`Enlarge ${it.product_name}`}
              className="block w-14 h-14 cursor-zoom-in"
            >
              <img src={it.image_url} alt={it.product_name} className="block w-14 h-14 object-cover" />
            </button>
          ) : (
            <div className="w-14 h-14 grid place-items-center text-text-light">
              <ShoppingBag className="w-5 h-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight">{it.product_name}</p>
            <button
              type="button"
              onClick={() => h.onRemove?.(it.id)}
              aria-label={`Remove ${it.product_name}`}
              className="shrink-0 w-11 h-11 -mt-2 -mr-2 grid place-items-center text-text-light hover:text-red-600 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {it.brand_name && <p className="text-[11px] text-text-med">Brand: {it.brand_name}</p>}

          {/* Size selector (only when the product has sizes) */}
          {sizes.length > 0 && (
            <div className="mt-2">
              <label className="text-[11px] font-semibold text-text-med mr-2">Size</label>
              <select
                value={it.size || ""}
                onChange={(e) => h.onSizeChange?.(it.id, e.target.value || null)}
                className="text-xs border border-input rounded-lg px-2 min-h-[44px] bg-background"
              >
                <option value="">Select size</option>
                {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Qty stepper + line total */}
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => h.onQtyChange?.(it.id, Math.max(1, it.quantity - 1))}
                disabled={it.quantity <= 1}
                aria-label="Decrease quantity"
                className="w-11 h-11 rounded-lg border border-border grid place-items-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-sm font-bold tabular-nums">{it.quantity}</span>
              <button
                type="button"
                onClick={() => h.onQtyChange?.(it.id, it.quantity + 1)}
                aria-label="Increase quantity"
                className="w-11 h-11 rounded-lg border border-border grid place-items-center hover:bg-muted"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-text-med">{it.quantity} × {fmt(it.unit_price)}</p>
              <p className="text-sm font-bold">{fmt(it.line_total)}</p>
            </div>
          </div>
        </div>
      </div>
      <ImageZoomModal src={zoomSrc} alt={it.product_name} caption={it.product_name} onClose={() => setZoomSrc(null)} />
    </div>
  );
}

function AddProductsButton({ sectionKey, onClick }: { sectionKey: string | null; onClick: (k: string | null) => void }) {
  return (
    <div className="px-4 sm:px-5 py-3">
      <button
        type="button"
        onClick={() => onClick(sectionKey)}
        className="w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-pill border border-dashed border-forest/50 text-forest text-sm font-semibold hover:bg-forest-light transition-colors"
      >
        <Plus className="w-4 h-4" /> Add products
      </button>
    </div>
  );
}

/**
 * The shared "Items" card used by both the customer quote page and the public
 * landing (package) page. Read-only by default (QuotePage). When `editable` is
 * set, each row becomes a qty stepper + size select + remove, and each section
 * gets an "Add products" button, all driven by the caller's handlers.
 */
export default function QuoteItemsCard({
  items,
  editable = false,
  sizeOptions,
  onQtyChange,
  onSizeChange,
  onRemove,
  onAddToSection,
  addSections,
}: {
  items: QuoteViewItem[];
  addSections?: Array<{ key: string | null; label: string }>;
} & EditHandlers) {
  const byOrder = (a: QuoteViewItem, b: QuoteViewItem) => (a.display_order || 0) - (b.display_order || 0);
  const h: EditHandlers = { editable, sizeOptions, onQtyChange, onSizeChange, onRemove, onAddToSection };

  const renderRow = (it: QuoteViewItem) =>
    editable ? <EditableRow key={it.id} it={it} h={h} /> : <ReadOnlyRow key={it.id} it={it} />;

  let body: React.ReactNode;

  if (editable) {
    // Editable mode: render every supported section (even when empty, so an
    // emptied section can still be added to) plus an "Other Items" group for
    // ungrouped lines. Sections come from `addSections` (the page's own set);
    // fall back to a single ungrouped group when the page has no sections.
    const groups = (addSections && addSections.length > 0
      ? addSections
      : [{ key: null, label: "Items" }]
    ).map((s) => ({
      key: s.key,
      label: s.label,
      rows: items.filter((it) => (it.section ?? null) === s.key).sort(byOrder),
    }));

    // Ungrouped items that don't belong to any declared section.
    const declared = new Set((addSections || []).map((s) => s.key));
    const orphanRows = items.filter((it) => !declared.has(it.section ?? null)).sort(byOrder);
    if (addSections && addSections.length > 0 && orphanRows.length > 0) {
      groups.push({ key: null, label: "Other Items", rows: orphanRows });
    }

    body = (
      <div>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="bg-forest border-t-4 border-forest-deep px-5 py-2.5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary-foreground">{g.label}</h3>
            </div>
            {g.rows.length > 0 && <div className="divide-y divide-border">{g.rows.map(renderRow)}</div>}
            <AddProductsButton sectionKey={g.key} onClick={(k) => onAddToSection?.(k)} />
          </div>
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = <p className="px-5 py-6 text-text-med text-sm text-center">No items on this list.</p>;
  } else if (!items.some((it) => !!it.section)) {
    body = <div className="divide-y divide-border">{items.map(renderRow)}</div>;
  } else {
    const groups = [
      ...QUOTE_ITEM_SECTIONS.map((s) => ({ label: s.label, rows: items.filter((it) => it.section === s.key).sort(byOrder) })),
      { label: "Other Items", rows: items.filter((it) => !it.section).sort(byOrder) },
    ].filter((g) => g.rows.length > 0);
    body = (
      <div>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="bg-forest border-t-4 border-forest-deep px-5 py-2.5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary-foreground">{g.label}</h3>
            </div>
            <div className="divide-y divide-border">{g.rows.map(renderRow)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-card quote-card border border-border rounded-xl overflow-hidden mb-4">
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-med">Items</h2>
      </div>
      {body}
    </div>
  );
}
