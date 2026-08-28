import { useCallback, useEffect, useState } from "react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import {
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  syncPushEmail,
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

  // The recovery path for a row that already exists without an email.
  // Signing in is the moment this browser stops being anonymous, so that is
  // when the email gets attached. Silent: it never asks for permission and
  // does nothing unless a subscription is already there.
  useEffect(() => {
    if (user?.email) void syncPushEmail(user.email);
  }, [user?.email]);

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
    signedIn: !!user?.email,
    supported: isPushSupported(),
    iosNeedsInstall: isIosNeedsInstall(),
  };
}
