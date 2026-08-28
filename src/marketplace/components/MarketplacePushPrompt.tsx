import { useEffect, useMemo, useState } from "react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { usePush } from "@/hooks/usePush";
import { isStandalone } from "@/lib/pwa";
import { deliveryGateChannel, pendingActionChannel } from "../lib/promptVisibility";

/**
 * Asking for notification permission, in the installed marketplace app only.
 *
 * Three rules, each of which exists because breaking it is expensive:
 *
 * 1. INSTALLED APP ONLY. A browser answers this question once and a refusal
 *    is permanent in that browser, so a badly timed ask burns the chance
 *    forever. Someone who put the app on their home screen has already said
 *    they want it there.
 * 2. SIGNED IN ONLY. A subscription with no email cannot be targeted by any
 *    trigger, so it is not a subscriber. 22 of 28 rows were in that state.
 * 3. NEVER ON FIRST LAUNCH. Someone who just installed has not decided they
 *    trust the app yet. The ask waits for a second, separate launch.
 *
 * Dismissal is permanent, and the whole thing yields to both higher prompts.
 */

const LAUNCH_KEY = "bm-mkt-app-launches";
const SESSION_COUNTED_KEY = "bm-mkt-launch-counted";
const DISMISS_KEY = "bm-mkt-push-dismissed";
/** Second launch onwards. The first one is theirs, not ours. */
const MIN_LAUNCHES = 2;

/** Count one launch per browser session, so reopening the app counts and
 * moving between pages inside it does not. */
function countLaunch(): number {
  try {
    const n = Number(localStorage.getItem(LAUNCH_KEY) || "0");
    if (sessionStorage.getItem(SESSION_COUNTED_KEY)) return n;
    sessionStorage.setItem(SESSION_COUNTED_KEY, "1");
    const next = n + 1;
    localStorage.setItem(LAUNCH_KEY, String(next));
    return next;
  } catch {
    // Storage unavailable: treat as a first launch and stay quiet rather
    // than asking someone we cannot remember having asked.
    return 1;
  }
}

export default function MarketplacePushPrompt() {
  const { isLoggedIn } = useCustomerAuth();
  const { status, busy, subscribe, signedIn } = usePush();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [done, setDone] = useState(false);

  // Only meaningful in the installed app, and only counted there.
  const installed = useMemo(() => isStandalone(), []);
  const launches = useMemo(() => (installed ? countLaunch() : 0), [installed]);

  const [higherPromptUp, setHigherPromptUp] = useState(false);
  useEffect(() => {
    let gate = false, pending = false;
    const push = () => setHigherPromptUp(gate || pending);
    const offGate = deliveryGateChannel.subscribe((v) => { gate = v; push(); });
    const offPending = pendingActionChannel.subscribe((v) => { pending = v; push(); });
    return () => { offGate(); offPending(); };
  }, []);

  const visible =
    installed &&
    isLoggedIn &&
    signedIn &&
    launches >= MIN_LAUNCHES &&
    status === "default" &&
    !dismissed &&
    !done &&
    !higherPromptUp;

  if (!visible) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const allow = async () => {
    const result = await subscribe();
    if (result === "granted-subscribed" || result === "denied") {
      setDone(true);
      dismiss();
    }
  };

  return (
    <div className="mkt-pushprompt" role="dialog" aria-label="Turn on notifications">
      <div className="mkt-pushprompt-card">
        <div className="ic" aria-hidden>🔔</div>
        <div className="body">
          <div className="t">Should we let you know?</div>
          <div className="s">
            We will tell you when a buyer asks about your item, when someone buys,
            and when your money is on the way. Nothing else.
          </div>
        </div>
        <div className="acts">
          <button className="yes" onClick={allow} disabled={busy}>
            {busy ? "One moment..." : "Yes, tell me"}
          </button>
          <button className="no" onClick={dismiss} disabled={busy}>Not now</button>
        </div>
      </div>
    </div>
  );
}
