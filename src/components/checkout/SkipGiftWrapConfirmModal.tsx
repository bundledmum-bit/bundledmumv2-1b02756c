import { useEffect } from "react";

// Confirmation dialog shown when a user (customer on checkout, or admin
// inside the quote editor) unchecks gift wrap WHILE the auto-rule is
// firing. ESC and outside-click both mean "Keep gift wrapping" — i.e.
// no-op. The "Skip anyway" button is the destructive secondary.
//
// Copy is identical across surfaces — do not fork it.

interface Props {
  onKeep: () => void;
  onSkip: () => void;
}

export default function SkipGiftWrapConfirmModal({ onKeep, onSkip }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onKeep(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeep]);
  return (
    <div
      className="fixed inset-0 z-[200] bg-foreground/60 flex items-center justify-center p-4 max-md:items-end max-md:p-0"
      onClick={onKeep}
      role="dialog"
      aria-modal="true"
      aria-labelledby="skip-gift-wrap-title"
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-[440px] p-5 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="skip-gift-wrap-title" className="font-bold text-base mb-2">Skip gift wrapping?</h3>
        <p className="text-sm text-text-med">
          Your cart contains gift items, so we've added gift wrapping. If you skip it,
          your items will be delivered in our regular packaging, not as a gift.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted"
          >
            Skip anyway
          </button>
          <button
            type="button"
            autoFocus
            onClick={onKeep}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep"
          >
            Keep gift wrapping
          </button>
        </div>
      </div>
    </div>
  );
}
