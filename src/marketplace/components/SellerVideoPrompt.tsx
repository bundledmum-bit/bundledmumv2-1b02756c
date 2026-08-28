import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { mdb } from "../data/mdb";
import { useSeller } from "../sell/useSeller";
import { deliveryGateChannel, pendingActionChannel, sellerVideoChannel } from "../lib/promptVisibility";

/**
 * Asking a seller to add video to listings that have none.
 *
 * ONE PROMPT FOR EVERYTHING THEY HAVE. One seller has 23 listings; 23
 * prompts would be intolerable and a prompt naming only one of them would
 * misrepresent the job. So it leads with the listing that most needs it,
 * from seller_listing_needing_video (required category first, then most
 * viewed, because a listing people look at and do not buy is where doubt
 * lives), and says how many others there are.
 *
 * PRECEDENCE: below PendingActionPrompt, because someone waiting on a reply
 * matters more than a video that can wait, and below the delivery gate.
 * Above the WhatsApp nudge and the install banner, which subscribe to this
 * prompt's channel. Dismissible, unlike the gate.
 */

interface NeedsVideo {
  listing_id: string;
  title: string | null;
  is_required: boolean;
  reason: string | null;
  views: number | null;
}

const DISMISS_KEY = "bm-mkt-video-prompt-dismissed";
/** Long enough not to nag, short enough to still matter. */
const DISMISS_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || "0");
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86400_000;
  } catch { return false; }
}

export default function SellerVideoPrompt() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { seller, isLoggedIn } = useSeller();
  const [dismissed, setDismissed] = useState(dismissedRecently);
  const [higherUp, setHigherUp] = useState(false);

  useEffect(() => {
    let gate = false, pending = false;
    const push = () => setHigherUp(gate || pending);
    const offGate = deliveryGateChannel.subscribe((v) => { gate = v; push(); });
    const offPending = pendingActionChannel.subscribe((v) => { pending = v; push(); });
    return () => { offGate(); offPending(); };
  }, []);

  // Never pull someone away mid-purchase or mid-listing.
  const onExcludedRoute = pathname.startsWith("/checkout")
    || pathname.startsWith("/sell/new")
    || pathname.startsWith("/sell/listings/");

  const { data: rows } = useQuery({
    queryKey: ["mkt-seller-needs-video", seller?.id],
    enabled: !!seller?.id && isLoggedIn,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<NeedsVideo[]> => {
      const { data, error } = await mdb.rpc("seller_listing_needing_video", { p_seller_id: seller!.id });
      if (error) return [];
      return (data ?? []) as NeedsVideo[];
    },
  });

  const lead = rows?.[0] ?? null;
  const others = Math.max(0, (rows?.length ?? 0) - 1);
  const requiredCount = useMemo(() => (rows ?? []).filter((r) => r.is_required).length, [rows]);

  const visible = !!lead && !dismissed && !higherUp && !onExcludedRoute;

  useEffect(() => {
    sellerVideoChannel.set(visible);
    return () => sellerVideoChannel.set(false);
  }, [visible]);

  if (!visible || !lead) return null;

  const close = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  const go = () => {
    close();
    navigate(`/sell/listings/${lead.listing_id}/edit`);
  };

  return (
    <div className="mkt-videoprompt" role="dialog" aria-label="Add a video to your listings">
      <div className="card">
        <button className="x" onClick={close} aria-label="Close">×</button>
        <div className="ic" aria-hidden>🎥</div>
        <div className="body">
          <div className="t">
            {others === 0
              ? "Your listing would sell faster with a video"
              : `${rows!.length} of your listings have no video`}
          </div>
          <div className="s">
            {/* The lead item's own reason, written per category, never a
                sentence built from a category name. */}
            {lead.is_required && lead.reason
              ? lead.reason
              : "A few seconds of it working answers the question buyers ask most, before they even have to message."}
          </div>
          {/* Two short lines rather than one long one. At 320px the single
              sentence ran to three lines and the count trailed off the end
              of it; as its own element the count cannot be lost in a wrap. */}
          <div className="lead">
            Start with <b>{lead.title || "your listing"}</b>
            {lead.views ? `, ${lead.views} ${lead.views === 1 ? "person has" : "people have"} looked at it` : ""}.
          </div>
          {others > 0 && (
            <div className="count">
              {others} more after that{requiredCount > 1 ? `, ${requiredCount} of them really need one` : ""}.
            </div>
          )}
        </div>
        <div className="acts">
          <button className="go" onClick={go}>Add a video</button>
          <button className="no" onClick={close}>Not now</button>
        </div>
      </div>
    </div>
  );
}
