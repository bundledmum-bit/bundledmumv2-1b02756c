import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { QuizQuestion, QuizQuestionUiConfig } from "@/hooks/useQuizConfig";

// Extracted verbatim from QuizPage.tsx. The only additional surface is
// the optional `embedded` prop which drops the full-screen wrapper classes
// (min-h-screen + pt-[68px]) so the step can sit inside another layout
// (e.g. the home-page hero). Logic is byte-for-byte identical.
export default function OptionalTextStep({
  question,
  progress,
  onSubmit,
  onSkip,
  onBack,
  embedded = false,
}: {
  question: QuizQuestion;
  progress: number;
  onSubmit: (value?: string) => void;
  onSkip: () => void;
  onBack: () => void;
  embedded?: boolean;
}) {
  const [value, setValue] = useState("");
  const config: QuizQuestionUiConfig = question.ui_config || {};

  // For whatsapp step: no validation, accept all phone numbers
  const isWhatsappStep = question.step_id === "whatsapp";
  const regexStr = isWhatsappStep ? undefined : config.validation_regex;
  const isValid = (val: string) => {
    if (!regexStr) return true;
    const digits = val.replace(/\D/g, "");
    return new RegExp(regexStr).test(digits) || new RegExp(regexStr).test(val);
  };
  const error = value && regexStr && !isValid(value)
    ? (config.validation_error || "Invalid input")
    : "";

  // Dynamic placeholder & CTA for whatsapp step
  const placeholder = isWhatsappStep ? "Enter your Phone Number" : (config.placeholder || "");
  const ctaLabel = isWhatsappStep
    ? (value.trim() ? "Continue" : "Continue without WhatsApp")
    : (value ? (config.primary_button || "Continue →") : (config.skip_label || "Continue →"));

  const outerClass = embedded
    ? "flex flex-col items-center px-4 md:px-10 py-6 md:py-8 w-full"
    : "min-h-screen bg-background pt-[var(--bm-header-h,108px)] flex flex-col items-center px-4 md:px-10 py-10 md:py-14 pb-20 md:pb-12";

  return (
    <div className={outerClass}>
      <div className="w-full max-w-[660px] mb-6">
        <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
          <div className="bg-coral h-1.5 transition-all duration-500 rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between mt-3">
          <div className="text-foreground/50 text-sm font-semibold">{config.page_title || ""}</div>
          <button onClick={onBack} className="text-foreground/50 text-sm flex items-center gap-1 font-body hover:text-foreground min-h-[44px]"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        </div>
      </div>

      <div className="animate-fade-in bg-card rounded-[22px] p-7 md:p-12 shadow-card-hover w-full max-w-[660px]">
        <div className="text-center mb-7">
          {config.eyebrow && <p className="text-foreground/60 text-[11px] font-semibold uppercase tracking-widest mb-2">{config.eyebrow}</p>}
          <h2 className="pf text-xl md:text-[30px] leading-tight text-foreground">{question.question_text}</h2>
          {question.sub_text && <p className="text-foreground/60 text-sm mt-2">{question.sub_text}</p>}
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <input
              type={isWhatsappStep ? "tel" : "text"}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={placeholder}
              className={`w-full rounded-[14px] border-2 px-4 py-3.5 text-sm bg-card font-body outline-none transition-colors ${error ? "border-destructive" : "border-border focus:border-forest"}`}
            />
            {error && <p className="text-destructive text-[11px]">{error}</p>}
            {!isWhatsappStep && config.helper_text && <p className="text-muted-foreground text-[11px]">{config.helper_text}</p>}
          </div>

          <button
            onClick={() => {
              if (value && regexStr && !isValid(value)) return;
              onSubmit(value || undefined);
            }}
            className="w-full rounded-pill bg-forest py-3.5 font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive text-sm"
          >
            {ctaLabel}
          </button>

          {question.is_skippable && (
            <button onClick={onSkip} className="w-full text-muted-foreground text-xs hover:text-forest transition-colors font-body">
              ⏭️ {config.skip_label || "Skip"}
            </button>
          )}
        </div>
      </div>
      {config.footer_text && <p className="text-muted-foreground text-xs mt-4 text-center">{config.footer_text}</p>}
    </div>
  );
}
