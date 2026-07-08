import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Shared editors for the two jsonb variant columns used by the
// approve-pending-product backend:
//   pending_sizes  → { size_code, size_label }
//   pending_colors → { color_name, color_hex|null }
// Rendered on the vendor submission form (AdminVendors) and the admin
// review/apply modal (AdminApprovals) so both write the exact same shapes.

export interface SizeRow { size_code: string; size_label: string }
export interface ColorRow { color_name: string; color_hex: string | null }

// Drop empty rows and trim before persisting. size_label falls back to the
// code so a lone code still produces a usable label.
export function normalizeSizes(rows: SizeRow[]): SizeRow[] {
  return rows
    .map((r) => ({ size_code: (r.size_code || "").trim(), size_label: (r.size_label || "").trim() }))
    .filter((r) => r.size_code || r.size_label)
    .map((r) => ({ size_code: r.size_code || r.size_label, size_label: r.size_label || r.size_code }));
}

export function normalizeColors(rows: ColorRow[]): ColorRow[] {
  return rows
    .map((r) => ({ color_name: (r.color_name || "").trim(), color_hex: (r.color_hex || "").trim() }))
    .filter((r) => r.color_name)
    .map((r) => ({ color_name: r.color_name, color_hex: r.color_hex ? r.color_hex : null }));
}

export function SizesEditor({ value, onChange }: { value: SizeRow[]; onChange: (v: SizeRow[]) => void }) {
  const update = (i: number, patch: Partial<SizeRow>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => onChange([...value, { size_code: "", size_label: "" }]);

  return (
    <div className="space-y-2">
      {value.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row.size_code}
            onChange={(e) => update(i, { size_code: e.target.value })}
            placeholder="Code (e.g. 0-3M, M, EU 38)"
            className="flex-1"
          />
          <Input
            value={row.size_label}
            onChange={(e) => update(i, { size_label: e.target.value })}
            placeholder="Label (e.g. 0-3 Months, Medium)"
            className="flex-1"
          />
          <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} aria-label="Remove size">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="w-4 h-4 mr-1" /> Add size
      </Button>
    </div>
  );
}

export function ColorsEditor({ value, onChange }: { value: ColorRow[]; onChange: (v: ColorRow[]) => void }) {
  const update = (i: number, patch: Partial<ColorRow>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => onChange([...value, { color_name: "", color_hex: null }]);

  const isValidHex = (h: string) => /^#[0-9a-fA-F]{6}$/.test(h);

  return (
    <div className="space-y-2">
      {value.map((row, i) => {
        const hex = row.color_hex || "";
        return (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={row.color_name}
              onChange={(e) => update(i, { color_name: e.target.value })}
              placeholder="Colour name (e.g. Blue)"
              className="flex-1"
            />
            {/* Native swatch picker — writes a #rrggbb hex; optional. */}
            <input
              type="color"
              value={isValidHex(hex) ? hex : "#000000"}
              onChange={(e) => update(i, { color_hex: e.target.value })}
              className="h-9 w-9 rounded border border-input bg-background p-0.5 cursor-pointer"
              aria-label="Pick colour hex"
            />
            <Input
              value={hex}
              onChange={(e) => update(i, { color_hex: e.target.value })}
              placeholder="#3b82f6 (optional)"
              className="w-32"
            />
            <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} aria-label="Remove colour">
              <X className="w-4 h-4" />
            </Button>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="w-4 h-4 mr-1" /> Add colour
      </Button>
    </div>
  );
}
