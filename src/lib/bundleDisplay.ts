// Display-only helper: expand cart lines for LISTING to a human.
//
// A customised bundle is stored as ONE cart line (type:"bundle", price =
// displayPrice) so the discounted/customised price is preserved (commit
// 2b646e8). For DISPLAY — checkout summary, WhatsApp order messages — we must
// list the bundle's INDIVIDUAL items, never the bundle name. This flattens each
// bundle line into its bundleItems; normal lines pass through unchanged.
//
// This is DISPLAY ONLY. It never changes a price or total — the authoritative
// order/checkout total is computed elsewhere and is untouched. Do not sum the
// returned lines to build a total.

export interface DisplayLine {
  name: string;
  brand: string | null;
  qty: number;
  price: number;
  size: string | null;
  color: string | null;
}

export function expandCartForDisplay(cart: any[] | null | undefined): DisplayLine[] {
  const out: DisplayLine[] = [];
  for (const it of cart || []) {
    if (it?.type === "bundle" && Array.isArray(it.bundleItems) && it.bundleItems.length) {
      for (const bi of it.bundleItems) {
        out.push({
          name: bi.productName || bi.name || "Item",
          brand: bi.brandName || null,
          qty: Number(bi.quantity) || 1,
          price: Number(bi.price) || 0,
          size: bi.size || null,
          color: bi.color || null,
        });
      }
      continue;
    }
    out.push({
      name: it?.name || "Item",
      brand: it?.selectedBrand?.label || null,
      qty: Number(it?.qty) || 1,
      price: Number(it?.selectedBrand?.price ?? it?.price ?? 0),
      size: it?.selectedSize || null,
      color: it?.selectedColor || null,
    });
  }
  return out;
}
