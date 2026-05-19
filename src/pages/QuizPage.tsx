import { useEffect } from "react";
import Seo from "@/components/Seo";
import { useLocation } from "react-router-dom";
import HomeQuiz, { type HomeQuizInitialState } from "@/components/home/HomeQuiz";

// /quiz route — a standalone page that renders the same 3-screen home
// quiz flow. When arriving from Home's "Build My List" CTA, location state
// contains the answers plus an autoAdvance hint so we skip straight to the
// WhatsApp screen. Direct visits start on screen 1 like before.
export default function QuizPage() {
  const location = useLocation();
  useEffect(() => { document.title = "Build My List | BundledMum"; }, []);

  const state = location.state as {
    answers?: { budget: number; categories: Array<"maternity" | "baby" | "gift">; gender: "boy" | "girl" | "unknown" };
    autoAdvance?: "whatsapp" | "results";
  } | null;

  const initialState: HomeQuizInitialState | undefined = state?.answers
    ? {
        budget: state.answers.budget,
        categories: state.answers.categories,
        gender: state.answers.gender,
        autoAdvance: state.autoAdvance,
      }
    : undefined;

  return (
    <>
      <Seo
        title="Hospital Bag Quiz — Find Your Perfect Bundle | BundledMum"
        description="Answer a few quick questions and get a personalised hospital bag recommendation matched to your budget, baby, and stage."
      />
    <section
      className="min-h-screen pt-20 md:pt-28 pb-12 md:pb-16 flex items-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 55%, #163D2E 100%)" }}
    >
      <div className="absolute w-[700px] h-[700px] rounded-full bg-primary-foreground/[0.025] -top-[250px] -right-[250px] pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] rounded-full bg-coral/[0.04] -bottom-[200px] -left-[200px] pointer-events-none" />

      <div className="max-w-[1200px] mx-auto px-5 md:px-10 w-full relative z-10">
        <div className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center gap-2 bg-coral/[0.18] border border-coral/40 rounded-pill px-4 py-1.5 mb-4">
            <span className="text-coral text-xs font-semibold">Takes under 30 secs</span>
          </div>
          <h1 className="pf text-[26px] md:text-[38px] font-bold text-primary-foreground leading-tight mb-2">
            Find The Right Baby & Mum Products For Your <span className="text-coral italic">Budget</span>
          </h1>
          <p className="text-primary-foreground/70 text-[13px] md:text-[15px] max-w-[520px] mx-auto font-body leading-relaxed">
            Answer three quick questions and we will hand-pick the right items for your budget.
          </p>
        </div>

        <HomeQuiz initialState={initialState} />
      </div>
    </section>
    </>
  );
}
