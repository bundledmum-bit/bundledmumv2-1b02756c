import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Asked once, at the moment she taps Share, so a shared list can say who it
 * is from. One field, first name, and Skip carries straight on to the share.
 *
 * Deliberately not a gate: both buttons complete the share, the field is
 * never required, and the answer (including a skip) is remembered so the
 * question is never asked twice.
 */

const OWNER_LABEL_KEY = "bm_owner_label";

/** null = never asked. "" = asked and skipped. Any string = her name. */
export function storedOwnerLabel(): string | null {
  try {
    return localStorage.getItem(OWNER_LABEL_KEY);
  } catch {
    return null;
  }
}

export function rememberOwnerLabel(name: string) {
  try {
    localStorage.setItem(OWNER_LABEL_KEY, name);
  } catch { /* private mode — she'll be asked again, which is survivable */ }
}

/** True once she has answered either way, so we never ask a second time. */
export function hasBeenAskedForOwnerLabel(): boolean {
  return storedOwnerLabel() !== null;
}

export default function ShareNamePrompt({
  onDone,
}: {
  /** Called with her name, or null if she skipped. Always proceeds. */
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, []);

  const submit = () => {
    const name = value.trim().split(/\s+/)[0] || ""; // first name only
    rememberOwnerLabel(name);
    onDone(name || null);
  };
  const skip = () => {
    rememberOwnerLabel(""); // remembered as "asked, declined"
    onDone(null);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[700] bg-black/50 flex items-end md:items-center justify-center md:p-4"
      onClick={skip}
    >
      <div
        className="bg-card w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="pf font-bold text-[17px] text-foreground leading-tight">
          Who should we say this is from?
        </h3>
        <p className="text-text-med text-[13px] mt-1 leading-snug">
          We will put your name on the list so they know who sent it.
        </p>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="First name"
          aria-label="First name"
          autoComplete="given-name"
          enterKeyHint="done"
          // 16px: anything smaller makes iOS Safari zoom the page on focus.
          className="mt-3.5 w-full rounded-[14px] border-2 border-border bg-background px-3.5 py-3 text-[16px] font-body outline-none transition-colors focus:border-forest"
        />

        <button
          type="button"
          onClick={submit}
          className="mt-3 w-full rounded-pill bg-coral text-primary-foreground min-h-[48px] text-[15px] font-bold hover:bg-coral-dark transition-colors"
        >
          Share
        </button>
        {/* Skip is a peer, not fine print: same width, same tap target. */}
        <button
          type="button"
          onClick={skip}
          className="mt-2 w-full rounded-pill border-[1.5px] border-border text-text-med min-h-[44px] text-[13.5px] font-semibold hover:border-forest hover:text-forest transition-colors"
        >
          Skip, share without my name
        </button>
      </div>
    </div>,
    document.body,
  );
}
