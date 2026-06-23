import { useCallback, useEffect, useState } from "react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import {
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  isIosNeedsInstall,
  isPushSupported,
  type PushStatus,
} from "@/lib/push";

/**
 * Shared push state for storefront controls (soft opt-in card + footer/account
 * toggle). Tracks the current PushStatus and exposes subscribe/unsubscribe that
 * link the logged-in customer's email.
 */
export function usePush() {
  const { user } = useCustomerAuth();
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await getPushStatus());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const s = await subscribeToPush(user?.email);
      setStatus(s);
      return s;
    } finally {
      setBusy(false);
    }
  }, [user?.email]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const s = await unsubscribeFromPush();
      setStatus(s);
      return s;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    status,
    busy,
    subscribe,
    unsubscribe,
    refresh,
    supported: isPushSupported(),
    iosNeedsInstall: isIosNeedsInstall(),
  };
}
