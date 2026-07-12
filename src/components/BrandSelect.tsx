import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt } from "@/lib/cart";
import { packCountLabel } from "@/lib/diaperBrand";
import { brandOptionName } from "@/lib/brandOptions";

interface BrandLike {
  id: string;
  label: string;
  price: number;
  inStock?: boolean;
  logoUrl?: string | null;
  compareAtPrice?: number | null;
  [key: string]: any;
}

/**
 * Brand/variant picker as a dropdown — scales cleanly to many options (some
 * products have up to 18 brands) where the old pill row overflowed. Drop-in for
 * both the PDP and the quick-view drawer: it only changes presentation, the
 * caller wires onSelect to the SAME state the pills used (price/image/add-to-cart
 * all keep reacting to the selected brand). Out-of-stock brands are marked and
 * disabled (Radix won't fire onValueChange for them).
 */
export default function BrandSelect({
  brands,
  value,
  onSelect,
  productOos = false,
  label = "Choose Brand",
}: {
  brands: BrandLike[];
  value: string | undefined;
  onSelect: (brand: BrandLike) => void;
  productOos?: boolean;
  label?: string;
}) {
  if (!brands || brands.length === 0) {
    return <p className="text-xs text-muted-foreground">No brands available for this selection.</p>;
  }

  const isOos = (b: BrandLike) => !b.inStock || productOos;
  const optionText = (b: BrandLike) => {
    const pc = packCountLabel(b as any);
    return `${brandOptionName(b, brands)}${pc ? ` ${pc}` : ""} — ${fmt(b.price)}${isOos(b) ? " — Out of stock" : ""}`;
  };

  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <Select
        value={value}
        onValueChange={(id) => {
          const b = brands.find((x) => x.id === id);
          if (b && !isOos(b)) onSelect(b);
        }}
      >
        <SelectTrigger
          aria-label={label}
          className="w-full min-h-[44px] h-auto border-[1.5px] border-border bg-card text-sm font-semibold text-text-dark focus:ring-forest focus:border-forest data-[state=open]:border-forest"
        >
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id} disabled={isOos(b)} className="text-sm">
              <span className="flex items-center gap-2">
                {b.logoUrl && <img src={b.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />}
                <span>{optionText(b)}</span>
                {b.compareAtPrice && b.compareAtPrice > b.price && !isOos(b) && (
                  <span className="line-through text-muted-foreground text-[11px]">{fmt(b.compareAtPrice)}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
