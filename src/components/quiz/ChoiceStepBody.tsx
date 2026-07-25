import { Check } from "lucide-react";
import type { QuizQuestion, QuizOption } from "@/hooks/useQuizConfig";

/**
 * Shared option-card styling for every single-choice quiz step. Defined here
 * (and imported by the hardcoded budget / category / gender steps in
 * HomeQuiz) so the DB-driven steps render pixel-identically instead of
 * inventing a second look.
 */
export const quizOptionCardClass = (selected: boolean) =>
  `w-full flex items-center gap-3 px-3.5 py-3 rounded-[14px] border-2 text-left transition-all ${
    selected ? "bg-[#FFF0EB] border-coral" : "bg-card border-border hover:border-coral/40"
  }`;

/** Active options for a question, in the admin-configured display order. */
export function activeOptions(question: QuizQuestion): QuizOption[] {
  return (question.quiz_options || [])
    .filter((o) => o.is_active !== false)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

/**
 * Body of a single_choice quiz step, rendered inside the wizard card that
 * already carries the progress bar and the Back / Next controls. Every piece
 * of copy — question, sub-text, option labels, emoji and descriptions —
 * comes from quiz_questions / quiz_options; nothing here is hardcoded.
 */
export default function ChoiceStepBody({
  question,
  value,
  onChange,
}: {
  question: QuizQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const options = activeOptions(question);

  // Some options carry more than one glyph ("👶👶👶" on the twins/triplets
  // step). Shrink those so the badge stays a single line inside the 40px
  // circle instead of wrapping and stretching the row.
  const emojiSize = (emoji: string | null) => {
    const glyphs = emoji ? Array.from(emoji).length : 1;
    if (glyphs >= 3) return "text-[11px]";
    if (glyphs === 2) return "text-[15px]";
    return "text-xl";
  };

  return (
    <div>
      <h2 className="pf text-[20px] md:text-[24px] font-bold leading-tight mb-1">{question.question_text}</h2>
      {question.sub_text && <p className="text-muted-foreground text-[13px] mb-4">{question.sub_text}</p>}
      <div className={`space-y-2 ${question.sub_text ? "" : "mt-4"}`}>
        {options.map((o) => {
          const selected = value === o.option_value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.option_value)}
              className={quizOptionCardClass(selected)}
            >
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center leading-none whitespace-nowrap ${emojiSize(o.option_emoji)} ${selected ? "bg-coral/15" : "bg-warm-cream"}`}>
                {o.option_emoji || "•"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="pf font-bold text-[15px] text-foreground leading-tight">{o.option_label}</div>
                {o.option_description && (
                  <div className="text-text-med text-[12px] mt-0.5 leading-tight">{o.option_description}</div>
                )}
              </div>
              {selected && (
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-coral flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
