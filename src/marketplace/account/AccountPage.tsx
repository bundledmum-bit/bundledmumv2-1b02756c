import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { mdb } from "../data/mdb";
import { getBuyerState, setBuyerStateLocal, fetchAllowedStates } from "../lib/buyerState";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";

/**
 * The buyer's own settings.
 *
 * Built because a buyer could SET their state at checkout and then never
 * change it. Someone who moved, or picked the wrong one once, was told which
 * items could and could not reach them based on a state they had no way to
 * correct.
 *
 * Clearing is a legitimate choice, not a mistake. When we do not know
 * someone's state nothing is blocked, which is deliberate: better to let
 * them buy and settle delivery with the seller than to block them on our own
 * ignorance.
 */
export default function AccountPage() {
  const navigate = useNavigate();
  const { isLoggedIn, loading, user } = useCustomerAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isLoggedIn) sendToMarketplaceLogin("/account", "account");
  }, [loading, isLoggedIn]);

  // The account is the source of truth for a signed in buyer; the local copy
  // is what every deliverability check actually reads, so the two are kept in
  // step here.
  const stateQ = useQuery({
    queryKey: ["mkt-my-delivery-state"],
    enabled: isLoggedIn,
    staleTime: 30_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error: e } = await mdb.rpc("my_delivery_state");
      if (e) return getBuyerState();
      return (data as string | null) || null;
    },
  });

  const { data: states = [] } = useQuery({
    queryKey: ["mkt-allowed-states"],
    staleTime: 5 * 60_000,
    queryFn: fetchAllowedStates,
  });

  const current = stateQ.data ?? null;

  async function change(next: string) {
    if (!next || next === current) return;
    setSaving(true); setError(null); setSaved(null);
    const { error: e } = await mdb.rpc("set_my_delivery_state", { p_state: next });
    setSaving(false);
    if (e) { setError(e.message || "That could not be saved. Please try again."); return; }
    // Local copy AND the event bus, which is what makes a listing answer
    // differently straight away rather than on a reload: every deliverability
    // query is keyed on the buyer state and re-runs when this fires. See
    // DeliveryTermsBlock and CartPage, both already subscribed.
    setBuyerStateLocal(next);
    await stateQ.refetch();
    setSaved(`Saved. We will use ${next} from now on.`);
  }

  async function clear() {
    setSaving(true); setError(null); setSaved(null);
    const { error: e } = await mdb.rpc("clear_my_delivery_state");
    setSaving(false);
    if (e) { setError(e.message || "That could not be saved. Please try again."); return; }
    setBuyerStateLocal(null);
    await stateQ.refetch();
    setSaved("Cleared. We will stop telling you which items can reach you.");
  }

  if (loading || (isLoggedIn && stateQ.isLoading)) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  }
  if (!isLoggedIn) return null;

  return (
    <div className="mkt-account-page">
      <MarketplaceTitle title="Your account" />

      <div className="mkt-acct-head">
        <button className="mkt-back" onClick={() => navigate("/")} aria-label="Back">‹</button>
        <h1>Your account</h1>
      </div>

      <div className="mkt-acct-card">
        <div className="lbl">Signed in as</div>
        <div className="val">{user?.email}</div>
      </div>

      <div className="mkt-acct-card">
        <div className="lbl">Where you are</div>
        <div className="val">{current || "Not set"}</div>
        {/* One line, before they change it, saying what it actually does. */}
        <p className="mkt-help">
          This changes which items we tell you cannot reach you, on a listing and at checkout.
        </p>

        <label className="mkt-acct-field">
          <span className="mkt-uplabel">Change your state</span>
          <select
            className="mkt-native-select"
            value={current || ""}
            disabled={saving}
            onChange={(e) => void change(e.target.value)}
          >
            <option value="">Choose your state</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
        {saved && <div className="mkt-acct-ok"><span>✓</span><span>{saved}</span></div>}

        {current && (
          <>
            <button className="mkt-acct-clear" onClick={() => void clear()} disabled={saving}>
              Clear my state
            </button>
            {/* Not framed as a mistake: an unknown state blocks nothing. */}
            <p className="mkt-help">
              We will stop telling you which items can reach you. Nothing gets blocked, you would just
              arrange delivery with the seller yourself.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
