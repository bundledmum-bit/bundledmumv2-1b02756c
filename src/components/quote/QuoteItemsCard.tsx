import { ShoppingBag } from "lucide-react";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import { fmt } from "@/lib/cart";

// Normalised item shape shared by the quote page and the landing (package) page,
// so both render an identical item list with section grouping. Callers map their
// own row type (quote share items / landing_page_items) onto this.
export interface QuoteViewItem {
  id: string;
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

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: "baby", label: "Baby Items" },
  { key: "mother", label: "Mother Items" },
  { key: "hospital", label: "Hospital Items" },
  { key: "postpartum", label: "Postpartum Items" },
  { key: "gift", label: "Gift Items" },
];

function Row({ it }: { it: QuoteViewItem }) {
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

/**
 * The shared "Items" card used by both the customer quote page and the public
 * landing (package) page. Renders a flat list when no item carries a section,
 * otherwise groups into Baby / Mother / Hospital / Postpartum / Gift, Other last.
 */
export default function QuoteItemsCard({ items }: { items: QuoteViewItem[] }) {
  const byOrder = (a: QuoteViewItem, b: QuoteViewItem) => (a.display_order || 0) - (b.display_order || 0);

  let body: React.ReactNode;
  if (items.length === 0) {
    body = <p className="px-5 py-6 text-text-med text-sm text-center">No items on this list.</p>;
  } else if (!items.some((it) => !!it.section)) {
    body = <div className="divide-y divide-border">{items.map((it) => <Row key={it.id} it={it} />)}</div>;
  } else {
    const groups = [
      ...SECTIONS.map((s) => ({ label: s.label, rows: items.filter((it) => it.section === s.key).sort(byOrder) })),
      { label: "Other Items", rows: items.filter((it) => !it.section).sort(byOrder) },
    ].filter((g) => g.rows.length > 0);
    body = (
      <div>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="bg-forest border-t-4 border-forest-deep px-5 py-2.5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary-foreground">{g.label}</h3>
            </div>
            <div className="divide-y divide-border">{g.rows.map((it) => <Row key={it.id} it={it} />)}</div>
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
