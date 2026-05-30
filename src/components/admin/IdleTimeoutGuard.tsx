import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Best-practice session policy for back-office tools handling PII:
//  - 20 min idle auto-logout
//  - 60s warning modal before logout (chance to stay signed in)
//  - 12h absolute session cap regardless of activity
//  - Cross-tab sync: signing out / staying in one tab applies to all tabs
const IDLE_TIMEOUT = 20 * 60 * 1000;       // 20 min
const WARNING_LEAD = 60 * 1000;            // show warning 60s before logout
const ABSOLUTE_TIMEOUT = 12 * 60 * 60 * 1000; // 12h
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "click"];
const SESSION_START_KEY = "admin_session_start";
const BROADCAST_CHANNEL = "admin-session";

export default function IdleTimeoutGuard() {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const absoluteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const doLogout = useCallback(async (reason: "idle" | "absolute") => {
    channelRef.current?.postMessage({ type: "logout" });
    sessionStorage.removeItem(SESSION_START_KEY);
    toast.info(
      reason === "absolute"
        ? "Session expired — please sign in again"
        : "You've been signed out due to inactivity",
    );
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }, []);

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  }, []);

  const scheduleTimers = useCallback(() => {
    clearTimers();
    warnTimer.current = setTimeout(() => {
      setSecondsLeft(Math.floor(WARNING_LEAD / 1000));
      setWarningOpen(true);
      countdownTimer.current = setInterval(() => {
        setSecondsLeft(s => (s > 0 ? s - 1 : 0));
      }, 1000);
    }, IDLE_TIMEOUT - WARNING_LEAD);
    idleTimer.current = setTimeout(() => {
      setWarningOpen(false);
      doLogout("idle");
    }, IDLE_TIMEOUT);
  }, [clearTimers, doLogout]);

  const handleActivity = useCallback(() => {
    if (warningOpen) return; // don't silently dismiss the warning
    scheduleTimers();
    channelRef.current?.postMessage({ type: "activity" });
  }, [warningOpen, scheduleTimers]);

  const stayActive = useCallback(() => {
    setWarningOpen(false);
    scheduleTimers();
    channelRef.current?.postMessage({ type: "activity" });
  }, [scheduleTimers]);

  // Absolute session cap
  useEffect(() => {
    let start = Number(sessionStorage.getItem(SESSION_START_KEY));
    if (!start || Number.isNaN(start)) {
      start = Date.now();
      sessionStorage.setItem(SESSION_START_KEY, String(start));
    }
    const elapsed = Date.now() - start;
    const remaining = ABSOLUTE_TIMEOUT - elapsed;
    if (remaining <= 0) {
      doLogout("absolute");
      return;
    }
    absoluteTimer.current = setTimeout(() => doLogout("absolute"), remaining);
    return () => {
      if (absoluteTimer.current) clearTimeout(absoluteTimer.current);
    };
  }, [doLogout]);

  // Cross-tab sync
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(BROADCAST_CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (e) => {
      if (e.data?.type === "logout") {
        clearTimers();
        window.location.href = "/admin/login";
      } else if (e.data?.type === "activity") {
        if (!warningOpen) scheduleTimers();
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [clearTimers, scheduleTimers, warningOpen]);

  // Idle activity listeners
  useEffect(() => {
    scheduleTimers();
    ACTIVITY_EVENTS.forEach(ev =>
      window.addEventListener(ev, handleActivity, { passive: true }),
    );
    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handleActivity));
    };
  }, [handleActivity, scheduleTimers, clearTimers]);

  // Auto-logout when countdown hits zero (in case main timer drifts)
  useEffect(() => {
    if (warningOpen && secondsLeft <= 0) {
      setWarningOpen(false);
      doLogout("idle");
    }
  }, [warningOpen, secondsLeft, doLogout]);

  return (
    <AlertDialog open={warningOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll be signed out in <span className="font-semibold text-foreground">{secondsLeft}s</span> due to inactivity.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => doLogout("idle")}>Sign out now</AlertDialogCancel>
          <AlertDialogAction onClick={stayActive} className="bg-coral hover:bg-coral/90">
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
