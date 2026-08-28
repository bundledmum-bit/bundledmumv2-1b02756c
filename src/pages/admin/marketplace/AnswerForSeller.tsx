import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { detectBypassAttempt } from "@/marketplace/questions";
import { useVideoRequestMaxMb } from "@/marketplace/videoRequests";
import {
  formatNaira, relativeTimeAgo,
  fetchSellerPendingQuestions, fetchSellerPendingVideoRequests, fetchSellerPendingOffers,
  adminAnswerQuestionForSeller, adminUploadVideoForSeller, adminAnswerOfferForSeller,
  type PendingQuestion, type PendingVideoRequest, type PendingOffer,
} from "./opsData";

/**
 * Doing, from the outreach queue, what the seller has already told us on
 * WhatsApp but never did in the app.
 *
 * These sit beside the nudge for the same person on purpose: someone
 * looking at "a buyer is waiting on an answer" can answer it there rather
 * than going to find another screen. Two video requests sat for days before
 * the seller was even emailed.
 *
 * The seller's own screens stay the primary route. Nothing here replaces
 * them, and all three RPCs refuse anything already answered, so the two
 * paths cannot collide.
 */

/** Every one of these is an action taken in someone else's name, so every
 * one of them demands a note saying where they said it. Matches the RPCs'
 * own 5 character minimum. */
const NOTE_MIN = 5;
const NOTE_PROMPT = "Where did the seller tell you this?";
const NOTE_PLACEHOLDER = "For example: she sent it on WhatsApp this morning";

/** Said on all three, because the buyer is notified automatically and sees
 * it as the seller's own words. */
const OWN_WORDS =
  "The buyer is told straight away and sees this as the seller's own words, so use what they actually said, not a tidied up version.";

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ok = value.trim().length >= NOTE_MIN;
  return (
    <label className="flex flex-col gap-1">
      <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>{NOTE_PROMPT}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={NOTE_PLACEHOLDER}
        className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
      <span className="text-[10.5px]" style={{ color: ok ? "#8A7A72" : "#C0392B" }}>
        {ok ? "Kept forever, with your name against it." : "Needed. This is the record of where it came from."}
      </span>
    </label>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2.5" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
      <div className="font-heading font-black text-[12.5px]">{title}</div>
      {children}
      <div className="text-[10.5px]" style={{ color: "#8A7A72" }}>{OWN_WORDS}</div>
    </div>
  );
}

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FCEBE9", color: "#8C2A1F" }}>{msg}</div>;
}

function Done({ msg }: { msg: string }) {
  return <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#D8EFE5", color: "#1A4A33" }}>{msg}</div>;
}

const btn = (ready: boolean) => ready
  ? { background: "#2D6A4F", color: "#fff" }
  : { background: "#E0DAD5", color: "#8A7A72" };

/* ── Questions ────────────────────────────────────────────────────────── */

function AnswerQuestion({ q, onDone }: { q: PendingQuestion; onDone: () => void }) {
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = answer.trim() !== "" && note.trim().length >= NOTE_MIN;

  async function submit() {
    // The SAME bypass filter the seller's own answer goes through. The
    // buyer cannot tell who typed it, so it cannot be a way around the
    // rule that a seller could not have got past themselves.
    const bypass = detectBypassAttempt(answer.trim());
    if (bypass) { setError(bypass); return; }
    setBusy(true); setError(null);
    const res = await adminAnswerQuestionForSeller({ questionId: q.id, answer: answer.trim(), note: note.trim() });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "Could not save that."); return; }
    onDone();
  }

  return (
    <Panel title="Answer this in the seller's name">
      <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FDE8DF", color: "#8C4A34" }}>
        <b className="font-heading font-extrabold">Asked {relativeTimeAgo(q.created_at)}:</b> {q.question}
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>What the seller said</span>
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3}
          placeholder="Type their answer exactly as they gave it"
          className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
      </label>
      <NoteField value={note} onChange={setNote} />
      <Err msg={error} />
      <button onClick={submit} disabled={!ready || busy}
        className="rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]" style={btn(ready && !busy)}>
        {busy ? "Sending..." : "Send this answer"}
      </button>
    </Panel>
  );
}

/* ── Video requests ───────────────────────────────────────────────────── */

function SendVideo({ r, onDone }: { r: PendingVideoRequest; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The live limit from site_settings, the same one the seller's own screen
  // reads, never a hardcoded number.
  const { data: maxMb = 60 } = useVideoRequestMaxMb();

  const ready = !!file && note.trim().length >= NOTE_MIN;

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    // file.size is known the instant it is picked, and it is the ONLY thing
    // read from the file: no duration, no decoding, no video element, no
    // canvas. Reading a video hangs on iPhone and that is what killed the
    // public video feature (handoff 87 to 92).
    if (f.size > maxMb * 1024 * 1024) {
      setFile(null);
      setError("That video is too long, ask for about 30 seconds or less.");
      return;
    }
    setFile(f);
    setError(null);
  }

  async function send() {
    if (!file) return;
    setBusy(true); setError(null); setProgress(0);
    const res = await adminUploadVideoForSeller({
      requestId: r.id, file, note: note.trim(), onProgress: setProgress,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "Could not send that."); return; }
    onDone();
  }

  return (
    <Panel title="Send the video the seller gave you">
      <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FDE8DF", color: "#8C4A34" }}>
        <b className="font-heading font-extrabold">Asked {relativeTimeAgo(r.created_at)}</b>
        {r.note ? `: ${r.note}` : ". No note left."}
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>Their video</span>
        <input type="file" accept="video/*" onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
          className="text-[12px]" />
        {file && <span className="text-[10.5px]" style={{ color: "#8A7A72" }}>{file.name}</span>}
      </label>
      <NoteField value={note} onChange={setNote} />
      <Err msg={error} />
      <button onClick={send} disabled={!ready || busy}
        className="rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]" style={btn(ready && !busy)}>
        {busy ? `Uploading... ${progress}%` : "Send this video"}
      </button>
    </Panel>
  );
}

/* ── Offers ───────────────────────────────────────────────────────────── */

function AnswerOffer({ o, onDone }: { o: PendingOffer; onDone: () => void }) {
  const [decision, setDecision] = useState<"accepted" | "declined" | "countered" | "">("");
  const [counter, setCounter] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counterNum = Number(counter.replace(/[^\d]/g, ""));
  const needsCounter = decision === "countered";
  const ready = decision !== "" && note.trim().length >= NOTE_MIN && (!needsCounter || counterNum > 0);

  async function submit() {
    if (decision === "") return;
    setBusy(true); setError(null);
    const res = await adminAnswerOfferForSeller({
      offerId: o.id, decision,
      counterPriceNaira: needsCounter ? counterNum : null,
      note: note.trim(),
    });
    setBusy(false);
    // A counter below what the seller is owed is refused server side, and
    // the message names the figure, so it is surfaced as given.
    if (!res.ok) { setError(res.message ?? "Could not save that."); return; }
    onDone();
  }

  const choice = (v: "accepted" | "declined" | "countered", label: string) => (
    <button key={v} onClick={() => setDecision(v)} disabled={busy}
      className="flex-1 rounded-lg py-2 font-heading font-extrabold text-[12px] border"
      style={decision === v
        ? { background: "#2D6A4F", color: "#fff", borderColor: "#2D6A4F" }
        : { background: "#fff", color: "#6B5B54", borderColor: "#E3D4CB" }}>
      {label}
    </button>
  );

  return (
    <Panel title="Answer this offer in the seller's name">
      <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FDE8DF", color: "#8C4A34" }}>
        <b className="font-heading font-extrabold">Offered {relativeTimeAgo(o.created_at)}:</b>{" "}
        {formatNaira(o.buyer_price_naira)} from the buyer, {formatNaira(o.seller_amount_naira)} to the seller.
      </div>
      <div className="flex gap-2">
        {choice("accepted", "They said yes")}
        {choice("declined", "They said no")}
        {choice("countered", "They want more")}
      </div>
      {needsCounter && (
        <label className="flex flex-col gap-1">
          <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>What the seller wants to receive</span>
          <input value={counter} onChange={(e) => setCounter(e.target.value)} inputMode="numeric"
            placeholder="Amount in naira"
            className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
        </label>
      )}
      <NoteField value={note} onChange={setNote} />
      <Err msg={error} />
      <button onClick={submit} disabled={!ready || busy}
        className="rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]" style={btn(ready && !busy)}>
        {busy ? "Sending..." : "Send this answer"}
      </button>
    </Panel>
  );
}

/* ── The dispatcher mounted on an outreach row ────────────────────────── */

const STAGE_TITLES: Record<string, string> = {
  unanswered_question: "Answer for them",
  video_request_pending: "Send their video",
  offer_awaiting_response: "Answer their offer",
};

export function canAnswerForSeller(stageKey: string): boolean {
  return stageKey in STAGE_TITLES;
}

export default function AnswerForSeller({ sellerId, stageKey }: { sellerId: string; stageKey: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  // One query for all three stages, so the union is stated once here
  // rather than branching the component three ways.
  type PendingAny = PendingQuestion | PendingVideoRequest | PendingOffer;
  const q = useQuery<PendingAny[]>({
    queryKey: ["admin-answer-for", stageKey, sellerId],
    enabled: open && !done,
    staleTime: 15000,
    queryFn: async (): Promise<PendingAny[]> => {
      if (stageKey === "unanswered_question") return fetchSellerPendingQuestions(sellerId);
      if (stageKey === "video_request_pending") return fetchSellerPendingVideoRequests(sellerId);
      return fetchSellerPendingOffers(sellerId);
    },
  });

  function finish() {
    setDone(true);
    void qc.invalidateQueries({ queryKey: ["mkt-outreach-queue"] });
  }

  if (!canAnswerForSeller(stageKey)) return null;

  if (done) {
    return (
      <Done msg="Sent. The buyer has been told, and it shows as the seller's own reply." />
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="self-start text-[11px] underline" style={{ color: "#2D6A4F" }}>
        {STAGE_TITLES[stageKey]}
      </button>
    );
  }

  const rows: PendingAny[] = q.data ?? [];

  return (
    <div className="flex flex-col gap-2 mt-1">
      {q.isLoading && <span className="text-[11px] text-text-med">Looking...</span>}
      {!q.isLoading && rows.length === 0 && (
        <span className="text-[11px] text-text-med">Nothing outstanding here any more. It may have just been answered.</span>
      )}
      {stageKey === "unanswered_question" && (rows as PendingQuestion[]).map((r) => (
        <AnswerQuestion key={r.id} q={r} onDone={finish} />
      ))}
      {stageKey === "video_request_pending" && (rows as PendingVideoRequest[]).map((r) => (
        <SendVideo key={r.id} r={r} onDone={finish} />
      ))}
      {stageKey === "offer_awaiting_response" && (rows as PendingOffer[]).map((r) => (
        <AnswerOffer key={r.id} o={r} onDone={finish} />
      ))}
      <button onClick={() => setOpen(false)} className="self-start text-[11px] underline" style={{ color: "#8A7A72" }}>
        Close
      </button>
    </div>
  );
}
