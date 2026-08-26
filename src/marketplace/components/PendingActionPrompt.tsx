import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { mdb } from "../data/mdb";
import { deliveryGateChannel, pendingActionChannel } from "../lib/promptVisibility";
import { isPendingActionDismissed, dismissPendingAction } from "../lib/pendingActionDismissed";

/**
 * Someone is waiting on this person, and they do not know unless they check
 * their email. Four sellers right now have a buyer waiting on a video or a
 * question, while those buyers decide whether to bother.
 *
 * my_pending_action() returns AT MOST ONE ROW and already decides priority,
 * covering buyer and seller cases in one call because the same person is
 * often both and should see whichever matters more rather than two
 * competing prompts. Its ordering is used exactly as returned and is
 * deliberately NOT re-ranked here.
 *
 * IMMEDIATE, no engagement delay. That is not the intrusive-interstitial
 * problem: this only ever renders for a signed in person, and Googlebot is
 * never signed in. Same reasoning as the delivery gate.
 *
 * DISMISSIBLE, unlike the gate. The gate asks a ten second question and
 * then never returns; this one could reappear on every visit for days, so
 * it needs an obvious close and a per-item memory, keyed on ref_id + kind.
 * See lib/pendingActionDismissed.ts.
 */

interface PendingAction {
  /** The row id of the thing actually waiting: the video request, the
   * question, the offer, the order. Used to key dismissal per item. */
  ref_id: string;
  kind: string;
  headline: string;
  detail: string;
  cta: string;
  link: string;
  listing_title: string | null;
  image_url: string | null;
}

export default function PendingActionPrompt() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, loading: authLoading } = useCustomerAuth();

  // Yields ONLY to the delivery gate, which is non-dismissible and blocks.
  // It outranks the WhatsApp nudge and the install banner, both of which
  // subscribe to this prompt's own channel and hide while it is up.
  const [gateVisible, setGateVisible] = useState(false);
  useEffect(() => deliveryGateChannel.subscribe(setGateVisible), []);

  const [dismissed, setDismissed] = useState(false);

  // Never pull someone away mid-purchase or mid-listing.
  const onExcludedRoute = pathname.startsWith("/checkout")
    || pathname.startsWith("/sell/new")
    || pathname.startsWith("/sell/listings/");

  const { data: action } = useQuery({
    queryKey: ["mkt-pending-action"],
    enabled: isLoggedIn && !authLoading,
    staleTime: 60_000,
    queryFn: async (): Promise<PendingAction | null> => {
      const { data, error } = await mdb.rpc("my_pending_action");
      if (error) return null;
      return ((data ?? []) as PendingAction[])[0] ?? null;
    },
  });

  const visible = !!action
    && isLoggedIn
    && !authLoading
    && !dismissed
    && !isPendingActionDismissed(action)
    && !gateVisible
    && !onExcludedRoute;

  // Publish so the WhatsApp prompt and the install banner can stand down.
  useEffect(() => {
    pendingActionChannel.set(visible);
    return () => pendingActionChannel.set(false);
  }, [visible]);

  if (!visible || !action) return null;

  const close = () => {
    dismissPendingAction(action);
    setDismissed(true);
  };

  const go = () => {
    // Dismissed on action too: once they have gone to deal with it, the
    // prompt should not greet them again on the way back.
    dismissPendingAction(action);
    setDismissed(true);
    // The RPC returns links prefixed with /marketplace, which is the
    // router's own basename, so it is stripped before navigating.
    navigate(action.link.replace(/^\/marketplace/, "") || "/");
  };

  return (
    <div className="mkt-pending">
      <div className="mkt-pending-card">
        <button type="button" className="x" onClick={close} aria-label="Not now">✕</button>
        <div className="row">
          <div className="th" aria-hidden>
            {action.image_url && <img src={action.image_url} alt="" />}
          </div>
          <div className="body">
            <div className="h">{action.headline}</div>
            <div className="p">{action.detail}</div>
            {action.listing_title && <div className="item">{action.listing_title}</div>}
          </div>
        </div>
        <button type="button" className="cta" onClick={go}>{action.cta}</button>
      </div>
    </div>
  );
}
