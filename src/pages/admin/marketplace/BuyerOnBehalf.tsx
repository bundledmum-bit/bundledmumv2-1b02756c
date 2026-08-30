import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { detectBypassAttempt } from "@/marketplace/questions";
import {
  formatNaira, fetchListingsForBuyerAction,
  adminAskQuestionForBuyer, adminMakeOfferForBuyer, adminRequestVideoForBuyer,
  type BuyerActionListing,
} from "./opsData";
import {
  NoteField, noteReady, OnBehalfErr, OnBehalfDone, OnBehalfPanel, Blocked,
  onBehalfBtn, useOnBehalfSubmit,
} from "./onBehalf";
import { listingBlockedReason, offerPriceProblem } from "./buyerActionGuards";

/**
 * The three things a buyer can do that an admin can now do for them.
 *
 * These live on the BUYER'S OWN RECORD rather than beside the outreach
 * nudge, and not by preference: all three functions need a listing as well
 * as a buyer, and an outreach row carries person_id and stage_key and no
 * listing_id at all. A buyer plus a listing is only knowable here.
 *
 * Every refusal these functions can make is visible on the row BEFORE the
 * choice, because finding out by clicking that a listing already has a
 * video is a bad way to learn it.
 */

type Action = "ask" | "offer" | "video";

const ACTIONS: Array<{ key: Action; label: string }> = [
  { key: "ask", label: "Ask the seller something" },
  { key: "offer", label: "Offer a lower price" },
  { key: "video", label: "Ask for a video" },
];

export default function BuyerOnBehalf({ buyerId, buyerName }: { buyerId: string; buyerName: string | null }) {
  const [action, setAction] = useState<Action | null>(null);
  const [search, setSearch] = useState("");
  const [listing, setListing] = useState<BuyerActionListing | null>(null);

  const { data: listings, isLoading } = useQuery({
    queryKey: ["admin-buyer-action-listings", search],
    enabled: !!action && !listing,
    queryFn: () => fetchListingsForBuyerAction(search),
    staleTime: 15000,
  });

  function reset() { setAction(null); setListing(null); setSearch(""); }

  if (!action) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[11px] text-text-med">
          For when {buyerName || "this buyer"} told you on WhatsApp instead of doing it in the app.
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ACTIONS.map((a) => (
            <button key={a.key} onClick={() => setAction(a.key)}
              className="font-heading font-extrabold text-[11.5px] rounded-lg px-2.5 py-1.5 border"
              style={{ borderColor: "#E3D4CB", background: "#fff" }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!listing) {
    const rows = listings ?? [];
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading font-black text-[12.5px]">Which item?</span>
          <button onClick={reset} className="text-[11px] underline" style={{ color: "#8A7A72" }}>Cancel</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search live items by name"
          className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
        {isLoading && <span className="text-[11px] text-text-med">Looking...</span>}
        {!isLoading && rows.length === 0 && (
          <span className="text-[11px] text-text-med">No live items match that. Only items still on sale can be asked about.</span>
        )}
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {rows.map((l) => {
            // The two refusals, read off the row rather than discovered by
            // clicking. A blocked row stays visible and says why, because
            // "it is not here" is a worse answer than "it cannot, and here
            // is the reason".
            const blocked = listingBlockedReason(action, l);
            return (
              <button key={l.id} type="button" disabled={!!blocked} onClick={() => setListing(l)}
                className="text-left rounded-lg border px-2.5 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ borderColor: "#E3D4CB", background: "#fff" }}>
                <div className="font-heading font-extrabold text-[12px]">{l.title || "Item"}</div>
                <div className="text-[10.5px] tabular-nums" style={{ color: "#8A7A72" }}>
                  {formatNaira(l.final_price_naira)} · {l.seller_name || "Seller"}
                </div>
                {blocked && <div className="text-[10.5px] mt-0.5" style={{ color: "#8A5A2B" }}>{blocked}</div>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const back = (
    <button onClick={reset} className="self-start text-[11px] underline" style={{ color: "#8A7A72" }}>
      Choose a different item
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5">
      {action === "ask" && <AskForBuyer l={listing} buyerId={buyerId} onDone={reset} />}
      {action === "offer" && <OfferForBuyer l={listing} buyerId={buyerId} onDone={reset} />}
      {action === "video" && <RequestVideoForBuyer l={listing} buyerId={buyerId} onDone={reset} />}
      {back}
    </div>
  );
}

function ItemLine({ l }: { l: BuyerActionListing }) {
  return (
    <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FDE8DF", color: "#8C4A34" }}>
      <b className="font-heading font-extrabold">{l.title || "Item"}</b> · {formatNaira(l.final_price_naira)} · {l.seller_name || "Seller"}
    </div>
  );
}

/* ── Ask a question ───────────────────────────────────────────────────── */

function AskForBuyer({ l, buyerId, onDone }: { l: BuyerActionListing; buyerId: string; onDone: () => void }) {
  const [question, setQuestion] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, done, submit } = useOnBehalfSubmit();

  if (done) return <OnBehalfDone msg={done} />;

  // The same filter the buyer's own question goes through, run here so it
  // is caught while they can still edit it rather than thrown back as a
  // database error. The function runs it again server side regardless.
  const bypass = question.trim().length >= 3 ? detectBypassAttempt(question) : null;
  const ready = question.trim().length >= 3 && !bypass && noteReady(note);

  return (
    <OnBehalfPanel title="Ask the seller, for the buyer" foot="The seller sees this exactly as if the buyer asked it themselves.">
      <ItemLine l={l} />
      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>What did they want to know?</span>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2}
          placeholder="For example: does it still have the original box"
          className="rounded-lg border px-2.5 py-2 text-[13px] resize-y" style={{ borderColor: "#E3D4CB" }} />
      </label>
      {bypass && <Blocked>{bypass}</Blocked>}
      <NoteField value={note} onChange={setNote}
        prompt="Where did the buyer ask you this?"
        placeholder="For example: she asked on WhatsApp this morning" />
      <OnBehalfErr msg={error} />
      <button type="button" disabled={!ready || busy}
        onClick={async () => {
          const ok = await submit(() => adminAskQuestionForBuyer({ listingId: l.id, buyerId, question, note }), "The seller has been told.");
          if (ok) onDone();
        }}
        className="self-start font-heading font-extrabold text-[12px] rounded-lg px-3 py-2" style={onBehalfBtn(ready && !busy)}>
        {busy ? "Sending..." : "Ask the seller"}
      </button>
    </OnBehalfPanel>
  );
}

/* ── Make an offer ────────────────────────────────────────────────────── */

function OfferForBuyer({ l, buyerId, onDone }: { l: BuyerActionListing; buyerId: string; onDone: () => void }) {
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, done, submit } = useOnBehalfSubmit();

  if (done) return <OnBehalfDone msg={done} />;
  if (!l.is_negotiable) return <Blocked>The seller has set a firm price on this item, so no offer can be made on it.</Blocked>;

  const n = price.trim() ? Number(price.replace(/[^0-9]/g, "")) : NaN;
  // Stated before the click, not discovered after it.
  const priceProblem = price.trim() ? offerPriceProblem(n, l.final_price_naira) : null;
  const ready = !!price.trim() && !priceProblem && noteReady(note);

  return (
    <OnBehalfPanel title="Offer a lower price, for the buyer" foot="The seller is told, and answers it as a normal offer.">
      <ItemLine l={l} />
      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>What did they offer?</span>
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric"
          placeholder={`Less than ${formatNaira(l.final_price_naira)}`}
          className="rounded-lg border px-2.5 py-2 text-[13px] tabular-nums" style={{ borderColor: "#E3D4CB" }} />
        <span className="text-[10.5px]" style={{ color: "#8A7A72" }}>
          Asking price is {formatNaira(l.final_price_naira)}.
        </span>
      </label>
      {priceProblem && <Blocked>{priceProblem === "What price did the buyer offer?" ? priceProblem : `That is not lower than the asking price of ${formatNaira(l.final_price_naira)}, so there would be nothing to accept.`}</Blocked>}
      <NoteField value={note} onChange={setNote}
        prompt="Where did the buyer tell you their offer?"
        placeholder="For example: she offered this on WhatsApp this afternoon" />
      <OnBehalfErr msg={error} />
      <button type="button" disabled={!ready || busy}
        onClick={async () => {
          const ok = await submit(() => adminMakeOfferForBuyer({ listingId: l.id, buyerId, buyerPriceNaira: n, note }), "The seller has been told.");
          if (ok) onDone();
        }}
        className="self-start font-heading font-extrabold text-[12px] rounded-lg px-3 py-2" style={onBehalfBtn(ready && !busy)}>
        {busy ? "Sending..." : "Send the offer"}
      </button>
    </OnBehalfPanel>
  );
}

/* ── Ask for a video ──────────────────────────────────────────────────── */

function RequestVideoForBuyer({ l, buyerId, onDone }: { l: BuyerActionListing; buyerId: string; onDone: () => void }) {
  const [buyerNote, setBuyerNote] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, done, submit } = useOnBehalfSubmit();

  if (done) return <OnBehalfDone msg={done} />;
  if (l.has_video) return <Blocked>This listing already has a video the buyer can watch, so there is nothing to ask for.</Blocked>;

  const ready = noteReady(note);

  return (
    <OnBehalfPanel title="Ask for a video, for the buyer" foot="The seller is told, and it appears in their queue like any other request.">
      <ItemLine l={l} />
      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>What do they want to see?</span>
        <textarea value={buyerNote} onChange={(e) => setBuyerNote(e.target.value)} rows={2}
          placeholder="Optional. For example: whether the wheels still turn freely"
          className="rounded-lg border px-2.5 py-2 text-[13px] resize-y" style={{ borderColor: "#E3D4CB" }} />
        <span className="text-[10.5px]" style={{ color: "#8A7A72" }}>The seller reads this and films to it, so it is worth filling in.</span>
      </label>
      <NoteField value={note} onChange={setNote}
        prompt="Where did the buyer ask you?"
        placeholder="For example: she asked on WhatsApp this morning" />
      <OnBehalfErr msg={error} />
      <button type="button" disabled={!ready || busy}
        onClick={async () => {
          const ok = await submit(() => adminRequestVideoForBuyer({ listingId: l.id, buyerId, buyerNote, note }), "The seller has been told.");
          if (ok) onDone();
        }}
        className="self-start font-heading font-extrabold text-[12px] rounded-lg px-3 py-2" style={onBehalfBtn(ready && !busy)}>
        {busy ? "Sending..." : "Ask for a video"}
      </button>
    </OnBehalfPanel>
  );
}
