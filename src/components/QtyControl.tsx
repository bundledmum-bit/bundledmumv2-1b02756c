import { Minus, Plus } from "lucide-react";

interface QtyControlProps {
  qty: number;
  onUpdate: (newQty: number) => void;
  maxQty?: number;
  size?: "sm" | "md";
  accentColor?: "forest" | "coral";
}

export default function QtyControl({ qty, onUpdate, maxQty, size = "sm", accentColor = "forest" }: QtyControlProps) {
  const isForest = accentColor === "forest";
  // The small variant draws a 36px circle, which is under the 44px minimum
  // touch target. Rather than grow the control (it sits in tight card
  // layouts), an invisible ::after pad extends the tappable box to 44x44.
  // The 24px number between the two buttons keeps the pads from meeting.
  const hitPad = size === "sm" ? "relative after:absolute after:content-[''] after:-inset-1" : "";
  const btnBase = size === "sm"
    ? `w-9 h-9 rounded-full flex items-center justify-center transition-colors ${hitPad}`
    : "w-11 h-11 rounded-full flex items-center justify-center transition-colors";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const textSize = size === "sm" ? "text-sm" : "text-base";

  const borderColor = isForest ? "border-forest" : "border-coral";
  const bgLight = isForest ? "bg-forest-light" : "bg-coral/10";
  const textColor = isForest ? "text-forest" : "text-coral";
  const bgSolid = isForest ? "bg-forest hover:bg-forest-deep" : "bg-coral hover:bg-coral-dark";

  const atMax = maxQty != null && qty >= maxQty;

  return (
    // No overflow-hidden: it would clip the buttons' invisible touch pads.
    // The children are rounded-full circles that already sit inside the
    // pill, so nothing needs clipping.
    <div className={`flex items-center gap-0 rounded-pill border ${borderColor} ${bgLight}`}>
      <button
        onClick={() => onUpdate(qty - 1)}
        className={`${btnBase} ${textColor} hover:bg-foreground/5`}
        aria-label="Decrease quantity"
      >
        <Minus className={iconSize} />
      </button>
      <span className={`${textSize} font-bold ${textColor} min-w-[24px] text-center select-none`}>{qty}</span>
      <button
        onClick={() => { if (!atMax) onUpdate(qty + 1); }}
        className={`${btnBase} ${atMax ? "bg-border cursor-not-allowed text-muted-foreground" : `${bgSolid} text-primary-foreground`}`}
        aria-label="Increase quantity"
        disabled={atMax}
      >
        <Plus className={iconSize} />
      </button>
    </div>
  );
}