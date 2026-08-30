import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { adb } from "./opsData";

/**
 * The shared parts of doing something in someone else's name.
 *
 * Fourteen functions now write to the marketplace as a seller or a buyer,
 * and every one of them takes a note. The note is not paperwork: it is the
 * only answer to "why does my order say something I did not do", which is a
 * question a real seller will eventually ask. So it is asked the same way
 * everywhere, from one component, rather than each screen inventing its own
 * wording and its own minimum.
 *
 * The prompt is written as a question of FACT, never as a reason to justify
 * the action: "Where did they tell you this?" has one correct answer and an
 * operator either has it or does not.
 */

/** Matches the functions' own minimums. The heavier three take 10 because
 * they move money or accuse someone, and a five character note like "phone"
 * is not a record of that. */
export const NOTE_MIN_LIGHT = 5;
export const NOTE_MIN_HEAVY = 10;

/** Is this a read-only design account?
 *
 * Asked of `is_design_viewer()`, the SAME predicate `assert_not_read_only()`
 * uses inside every one of these functions, so the notice and the refusal
 * can never disagree. This is NOT the protection: the protection is the
 * server guard, which runs whatever this returns. It only means a design
 * account reads "this account can look but not change anything" before
 * clicking, instead of a database error afterwards, which looks like a
 * broken screen rather than a deliberate limit.
 */
export function useIsReadOnlyAccount(): boolean {
  const { data } = useQuery({
    queryKey: ["admin-is-design-viewer"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await adb.rpc("is_design_viewer");
      if (error) return false;
      return data === true;
    },
  });
  return data === true;
}

/** Shown beside the controls, to a read-only account only. */
export function ReadOnlyNotice() {
  const readOnly = useIsReadOnlyAccount();
  if (!readOnly) return null;
  return (
    <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#EDE6E1", color: "#6B5B54" }}>
      This account can look but not change anything. The controls are all here to
      look at, and anything you send back will be refused.
    </div>
  );
}

export function NoteField({
  value, onChange, prompt, placeholder, min = NOTE_MIN_LIGHT,
}: {
  value: string;
  onChange: (v: string) => void;
  /** A question of fact about where this came from. */
  prompt: string;
  placeholder: string;
  min?: number;
}) {
  const ok = value.trim().length >= min;
  return (
    <label className="flex flex-col gap-1">
      <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>{prompt}</span>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={min >= NOTE_MIN_HEAVY ? 3 : 2}
        className="rounded-lg border px-2.5 py-2 text-[13px] resize-y" style={{ borderColor: "#E3D4CB" }}
      />
      <span className="text-[10.5px]" style={{ color: ok ? "#8A7A72" : "#C0392B" }}>
        {ok ? "Kept forever, with your name against it." : "Needed. This is the record of where it came from."}
      </span>
    </label>
  );
}

export function noteReady(note: string, min = NOTE_MIN_LIGHT): boolean {
  return note.trim().length >= min;
}

export function OnBehalfErr({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FCEBE9", color: "#8C2A1F" }}>{msg}</div>;
}

export function OnBehalfDone({ msg }: { msg: string }) {
  return <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#D8EFE5", color: "#1A4A33" }}>{msg}</div>;
}

/** Green when the note and everything else is ready, flat grey when not, so
 * an operator can see at a glance that the note is what is missing. */
export function onBehalfBtn(ready: boolean) {
  return ready
    ? { background: "#2D6A4F", color: "#fff" }
    : { background: "#E0DAD5", color: "#8A7A72" };
}

/** A guard the operator reads BEFORE choosing, not an error afterwards.
 * Several of these functions refuse for reasons that are perfectly visible
 * up front: a listing that already has a video, a firm price. Finding that
 * out by clicking is a bad way to learn it. */
export function Blocked({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FFF3E8", color: "#8A5A2B" }}>
      {children}
    </div>
  );
}

export function OnBehalfPanel({ title, children, foot }: { title: string; children: ReactNode; foot?: string }) {
  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2.5" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
      <div className="font-heading font-black text-[12.5px]">{title}</div>
      <ReadOnlyNotice />
      {children}
      {foot && <div className="text-[10.5px]" style={{ color: "#8A7A72" }}>{foot}</div>}
    </div>
  );
}

/** Local state every one of these forms needs: busy, error, done. */
export function useOnBehalfSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(run: () => Promise<{ ok: boolean; message?: string }>, fallbackDone: string) {
    setBusy(true); setError(null);
    const res = await run();
    setBusy(false);
    if (!res.ok) { setError(res.message || "That could not be saved. Please try again."); return false; }
    // The functions each return their own human note ("Opened. The seller
    // has been told and the money stays held until it is resolved."), which
    // says more precisely what happened than anything written here could.
    setDone(res.message || fallbackDone);
    return true;
  }

  return { busy, error, done, setError, submit };
}
