import type { ReferralGiftOption } from "@/hooks/useReferralGiftOptions";

// Free mum-gift picker shown at checkout only when a valid partner referral code
// is attributed. Single selection, no prices. Brand palette: coral #F4845F is the
// selected accent, green #2D6A4F for the confirmation tick.

interface Props {
  options: ReferralGiftOption[];
  loading: boolean;
  selected: string | null;
  onSelect: (productId: string) => void;
  referrerName?: string | null;
}

export default function ReferralGiftPicker({ options, loading, selected, onSelect, referrerName }: Props) {
  return (
    <div className="bg-card rounded-card shadow-card p-4 md:p-8 border-[1.5px] border-coral/30">
      <h2 className="pf text-lg mb-1">Your free gift 🎁</h2>
      <p className="text-text-light text-sm mb-4">
        {referrerName
          ? `${referrerName} referred you, so pick one free mum gift on us.`
          : "Pick one free mum gift on us."}
      </p>

      {loading ? (
        <div className="text-text-light text-sm py-6 text-center">Loading your gift options...</div>
      ) : options.length === 0 ? (
        <div className="text-text-light text-sm py-4">Gift options are not available right now. You can still place your order.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {options.map((g) => {
            const isSelected = selected === g.productId;
            return (
              <button
                key={g.productId}
                type="button"
                onClick={() => onSelect(g.productId)}
                aria-pressed={isSelected}
                className={`relative flex flex-col rounded-[12px] border-[2px] overflow-hidden text-left bg-card transition-colors ${
                  isSelected ? "border-coral ring-2 ring-coral/30" : "border-border hover:border-coral/50"
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-forest text-primary-foreground text-sm flex items-center justify-center shadow">✓</span>
                )}
                <div className="aspect-square bg-warm-cream flex items-center justify-center overflow-hidden">
                  {g.imageUrl ? (
                    <img src={g.imageUrl} alt={g.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">🎁</span>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="text-xs font-semibold text-foreground leading-snug">{g.name}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
