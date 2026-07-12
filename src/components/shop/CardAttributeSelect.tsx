import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AttrOption = { value: string; label: string; disabled?: boolean };

/**
 * Compact, card-sized dropdown for a single product attribute axis (brand,
 * size, colour, or any future axis). One axis == one dropdown, so a product
 * card stays short no matter how many options it carries — the old wrapped
 * pill rows blew the card height up on products with many sizes/brands.
 *
 * Generic on purpose: the caller passes a label, the option list, the current
 * value and an onChange. Wiring a new attribute is just another instance, so
 * future product attributes render the same way with no new component work.
 * Disabled options (e.g. out-of-stock brands) are shown but not selectable —
 * Radix won't fire onValueChange for them.
 */
export default function CardAttributeSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label?: string;
  placeholder?: string;
  options: AttrOption[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  if (!options.length) return null;

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const opt = options.find((o) => o.value === v);
        if (opt && !opt.disabled) onChange(v);
      }}
    >
      <SelectTrigger
        aria-label={label || placeholder}
        className="w-full min-h-[34px] h-auto rounded-pill border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground focus:ring-forest focus:border-forest data-[state=open]:border-forest"
      >
        <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {label && <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium shrink-0">{label}</span>}
          <span className="truncate"><SelectValue placeholder={placeholder || `Select ${(label || "option").toLowerCase()}`} /></span>
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-[280px]">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled} className="text-[12px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
