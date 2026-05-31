import { useEffect, useMemo, useState } from "react";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import {
  EXIT_POPUP_DEFAULTS,
  readExitPopupSetting,
} from "@/components/admin/AdminQuizExitPopupTab";

interface Props {
  stepsCompleted: number;
  totalSteps: number;
  onContinue: () => void;
}

/**
 * Quiz exit-intent popup. All visual + behavioral values are driven by
 * site_settings keys under the quiz_exit_popup_* namespace, managed via
 * Admin → Settings → Quiz Exit Popup. Falls back to hardcoded defaults
 * if a setting is missing.
 */
export default function ExitIntentPopup({ stepsCompleted, totalSteps, onContinue }: Props) {
  const { data: siteSettings } = useSiteSettings();

  // Resolve all settings with fallbacks
  const s = useMemo(() => {
    const out = {} as typeof EXIT_POPUP_DEFAULTS;
    for (const k of Object.keys(EXIT_POPUP_DEFAULTS) as (keyof typeof EXIT_POPUP_DEFAULTS)[]) {
      (out as any)[k] = readExitPopupSetting(siteSettings, k);
    }
    return out;
  }, [siteSettings]);

  const [show, setShow] = useState(false);
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);

  const enabled = s.quiz_exit_popup_enabled;
  const minSteps = s.quiz_exit_popup_min_steps;
  const oncePerSession = s.quiz_exit_popup_once_per_session;
  const delaySeconds = s.quiz_exit_popup_delay_seconds;
  const triggerMouseY = s.quiz_exit_popup_trigger_mouse_y;
  const triggerPopstate = s.quiz_exit_popup_trigger_popstate;

  // Check session-storage flag when oncePerSession is on
  useEffect(() => {
    if (!enabled) return;
    if (oncePerSession && sessionStorage.getItem("bm-quiz-exit-popup-shown") === "1") {
      setShown(true);
    }
  }, [enabled, oncePerSession]);

  // Arm after delay
  useEffect(() => {
    if (!enabled) return;
    if (delaySeconds <= 0) { setArmed(true); return; }
    const id = window.setTimeout(() => setArmed(true), delaySeconds * 1000);
    return () => window.clearTimeout(id);
  }, [enabled, delaySeconds]);

  const trigger = () => {
    if (shown) return;
    setShow(true);
    setShown(true);
    if (oncePerSession) {
      try { sessionStorage.setItem("bm-quiz-exit-popup-shown", "1"); } catch { /* ignore */ }
    }
  };

  // Mouse exit trigger
  useEffect(() => {
    if (!enabled || !armed) return;
    if (shown || stepsCompleted < minSteps) return;
    if (triggerMouseY <= 0) return;
    const handler = (e: MouseEvent) => {
      if (e.clientY <= triggerMouseY) trigger();
    };
    document.addEventListener("mousemove", handler);
    return () => document.removeEventListener("mousemove", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, armed, shown, stepsCompleted, minSteps, triggerMouseY]);

  // Mobile back-button trigger
  useEffect(() => {
    if (!enabled || !armed) return;
    if (shown || stepsCompleted < minSteps) return;
    if (!triggerPopstate) return;
    const handler = () => trigger();
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, armed, shown, stepsCompleted, minSteps, triggerPopstate]);

  if (!enabled || !show) return null;

  const stepsLeft = Math.max(0, totalSteps - stepsCompleted);
  const renderedMessage = (s.quiz_exit_popup_message || "")
    .replace(/\{stepsLeft\}/g, String(stepsLeft))
    .replace(/\{s\}/g, stepsLeft === 1 ? "" : "s");

  const handlePrimary = () => {
    setShow(false);
    if (s.quiz_exit_popup_primary_cta_action === "link" && s.quiz_exit_popup_primary_cta_link) {
      window.location.href = s.quiz_exit_popup_primary_cta_link;
      return;
    }
    onContinue();
  };

  const handleSecondary = () => {
    setShow(false);
    if (s.quiz_exit_popup_secondary_action === "link" && s.quiz_exit_popup_secondary_link) {
      window.location.href = s.quiz_exit_popup_secondary_link;
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 max-md:items-end max-md:p-0">
      <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" onClick={() => setShow(false)} />
      <div
        className="relative rounded-[22px] shadow-2xl max-w-[420px] w-full p-6 md:p-8 animate-fade-in text-center max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
        style={{
          backgroundColor: s.quiz_exit_popup_bg_color,
          color: s.quiz_exit_popup_text_color,
        }}
      >
        {s.quiz_exit_popup_emoji && <div className="text-4xl mb-3">{s.quiz_exit_popup_emoji}</div>}
        {s.quiz_exit_popup_title && (
          <h2 className="pf text-xl md:text-2xl font-bold mb-2">{s.quiz_exit_popup_title}</h2>
        )}
        {renderedMessage && (
          <p className="text-sm mb-5 opacity-90">{renderedMessage}</p>
        )}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={handlePrimary}
            className="rounded-pill px-6 py-3 font-body font-semibold text-sm interactive hover:opacity-90 transition-opacity"
            style={{
              backgroundColor: s.quiz_exit_popup_primary_cta_bg,
              color: s.quiz_exit_popup_primary_cta_text_color,
            }}
          >
            {s.quiz_exit_popup_primary_cta_text}
          </button>
          {s.quiz_exit_popup_secondary_enabled && s.quiz_exit_popup_secondary_text && (
            <button
              onClick={handleSecondary}
              className="rounded-pill border-2 px-6 py-3 font-body font-semibold text-sm interactive hover:opacity-80 transition-opacity"
              style={{
                borderColor: s.quiz_exit_popup_text_color,
                color: s.quiz_exit_popup_text_color,
              }}
            >
              {s.quiz_exit_popup_secondary_text}
            </button>
          )}
        </div>
        {s.quiz_exit_popup_testimonial_enabled && s.quiz_exit_popup_testimonial_text && (
          <p className="text-[11px] mt-4 italic opacity-70">
            ⭐ "{s.quiz_exit_popup_testimonial_text}"
            {s.quiz_exit_popup_testimonial_author ? ` — ${s.quiz_exit_popup_testimonial_author}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
