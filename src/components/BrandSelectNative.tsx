import { ChevronDown } from "lucide-react";
import { fmt } from "@/lib/cart";
import { packCountLabel } from "@/lib/diaperBrand";

interface BrandLike {
  id: string;
  label: string;
  price: number;
  inStock?: boolean;
  compareAtPrice?: number | null;
  [key: string]: any;
}

/**
 * Native-<select> brand picker — used inside the product quick-view drawer.
 * The drawer is a vaul portal and the shadcn/Radix Select (a nested portal)
 * fails to open reliably inside it (pointer/drag + focus-trap + portal stacking
 * conflicts). A native select opens the OS picker with zero portal dependence,
 * works every time, and scrolls any number of options (18+). Mirrors the PDP
 * BrandSelect's option text + out-of-stock handling, wired to the SAME
 * setSelectedBrand handler so price/image/add-to-cart keep reacting.
 */
export default function BrandSelectNative({
  brands,
  value,
  onSelect,
  productOos = false,
  label = "Choose Brand",
  id = "brand-select-native",
}: {
  brands: BrandLike[];
  value: string | undefined;
  onSelect: (brand: BrandLike) => void;
  productOos?: boolean;
  label?: string;
  id?: string;
}) {
  if (!brands || brands.length === 0) {
    return <p className="text-xs text-muted-foreground">No brands available for this selection.</p>;
  }

  const isOos = (b: BrandLike) => !b.inStock || productOos;
  const optionText = (b: BrandLike) => {
    const pc = packCountLabel(b as any);
    return `${b.label}${pc ? ` ${pc}` : ""} — ${fmt(b.price)}${isOos(b) ? " — Out of stock" : ""}`;
  };

  return (
    <div className="mb-3">
      <label htmlFor={id} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value ?? ""}
          aria-label={label}
          onChange={(e) => {
            const b = brands.find((x) => x.id === e.target.value);
            if (b && !isOos(b)) onSelect(b);
          }}
          className="w-full min-h-[44px] appearance-none rounded-md border-[1.5px] border-border bg-card pl-3 pr-9 py-2 text-sm font-semibold text-text-dark focus:border-forest focus:ring-1 focus:ring-forest focus:outline-none"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id} disabled={isOos(b)}>
              {optionText(b)}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}
