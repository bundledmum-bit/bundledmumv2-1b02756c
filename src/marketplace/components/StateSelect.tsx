import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { fetchAllowedStates, getBuyerState, setBuyerStateLocal, saveBuyerStateToAccount } from "../lib/buyerState";

/**
 * The buyer's state, on the checkout details step (design 45a B1).
 *
 * Country is not shown at all: Nigeria is the only option, so a locked
 * field beside this would be one more thing to read for no decision.
 *
 * Pre-filled for a returning buyer and still changeable, so it reads as
 * already handled rather than a new chore. Saved locally always (guests
 * check out here too) and, for a signed in buyer, onto their account via
 * set_my_delivery_state so it follows them to another device.
 *
 * Shown even when every item is from a seller who has not set terms —
 * another item in the same cart may need it, and it is the one field that
 * lets us say anything at all about whether things reach them.
 */
export default function StateSelect({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const { isLoggedIn } = useCustomerAuth();
  const { data: states = [] } = useQuery({
    queryKey: ["mkt-allowed-states"],
    staleTime: 5 * 60_000,
    queryFn: fetchAllowedStates,
  });
  const [touched, setTouched] = useState(false);

  // Seed once from whatever we already know, without stomping a later choice.
  useEffect(() => {
    if (touched || value) return;
    const stored = getBuyerState();
    if (stored) onChange(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, value]);

  function pick(next: string) {
    setTouched(true);
    onChange(next);
    setBuyerStateLocal(next || null);
    if (next && isLoggedIn) void saveBuyerStateToAccount(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span className="mkt-uplabel">Your state</span>
      <select
        className="mkt-native-select"
        value={value ?? ""}
        onChange={(e) => pick(e.target.value)}
      >
        <option value="">Choose your state</option>
        {states.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-muted-2)" }}>
        So we can tell you if a seller can reach you
      </span>
    </div>
  );
}
