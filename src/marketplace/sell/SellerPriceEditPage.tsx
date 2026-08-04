import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, buyerPrice, formatNaira, genericErrorMessage, parseListingEditError } from "./sellData";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

interface LiveListing { id: string; title: string; image_url: string | null; price_naira: number; status: string; is_negotiable: boolean }

/**
 * Price-only edit for a LIVE listing (design 21a E2/E3). A live listing may
 * only have its price lowered — the database (guard_seller_listing_edits)
 * is the actual source of truth, this mirrors it for a good experience: the
 * raise is caught client side before submit, and the same database
 * rejection is handled gracefully if it ever slips through anyway. The
 * delist-then-edit path sits right on this screen, both in the plain state
 * and the blocked one, never somewhere the seller has to go hunting for it.
 */
export default function SellerPriceEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading, isLoggedIn, seller } = useSeller();

  const [newPrice, setNewPrice] = useState("");
  const [negotiable, setNegotiable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delistOpen, setDelistOpen] = useState(false);
  const [delistBusy, setDelistBusy] = useState(false);
  const [delistError, setDelistError] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) sendToMarketplaceLogin(`/sell/listings/${id}/price`, "seller");
  }, [loading, isLoggedIn, id]);

  const { data: listing, isLoading } = useQuery({
    queryKey: ["mkt-price-edit-listing", id],
    enabled: !!id && !!seller,
    queryFn: async (): Promise<LiveListing | null> => {
      const { data } = await sdb.from("marketplace_listings")
        .select("id, title, image_url, price_naira, status, is_negotiable")
        .eq("id", id as string)
        .eq("seller_id", seller!.id)
        .maybeSingle();
      return (data as unknown as LiveListing) ?? null;
    },
  });

  // Hydrate once from the loaded listing: the price input starts pre-filled at
  // the current price (so saving just the negotiability toggle needs no price
  // edit at all), and the toggle starts at the listing's real value.
  useEffect(() => {
    if (hydratedRef.current || !listing) return;
    hydratedRef.current = true;
    setNewPrice(String(Math.round(listing.price_naira)));
    setNegotiable(listing.is_negotiable);
  }, [listing]);

  const { data: markupPct = 10 } = useQuery({
    queryKey: ["mkt-markup"],
    queryFn: async () => {
      const { data } = await sdb.from("site_settings").select("value").eq("key", "marketplace_markup_percent").maybeSingle();
      const v = Number((data as { value: unknown } | null)?.value);
      return isFinite(v) ? v : 10;
    },
    staleTime: 60000,
  });

  const priceNum = Number(newPrice);
  const preview = useMemo(() => buyerPrice(priceNum, markupPct), [priceNum, markupPct]);
  const isRaise = !!listing && newPrice.trim() !== "" && isFinite(priceNum) && priceNum > listing.price_naira;
  const isValid = newPrice.trim() !== "" && isFinite(priceNum) && priceNum > 0;

  async function save() {
    if (!listing) return;
    setError(null);
    if (!isValid) { setError("Enter a price."); return; }
    if (isRaise) { setError("You can lower the price of a live listing, but not raise it. Delist it first if you need to change the price upward."); return; }
    setBusy(true);
    // is_negotiable is exempt from the live-listing content-change guard (it
    // changes nothing about the item itself), so it saves in the same update
    // as the price, no separate write needed.
    const { error: updErr } = await sdb.from("marketplace_listings")
      .update({ price_naira: Math.round(priceNum), is_negotiable: negotiable ?? listing.is_negotiable })
      .eq("id", listing.id);
    setBusy(false);
    if (updErr) {
      setError(parseListingEditError(updErr.message) || genericErrorMessage("update price", updErr));
      return;
    }
    navigate("/sell/dashboard");
  }

  async function confirmDelist() {
    if (!listing) return;
    setDelistBusy(true); setDelistError(null);
    // Direct status-only update — no other field changes in the same write,
    // so it clears guard_seller_listing_edits' live-price/content check
    // trivially, and track_marketplace_delisting stamps delisted_by='seller'.
    const { error: updErr } = await sdb.from("marketplace_listings").update({ status: "delisted" }).eq("id", listing.id);
    setDelistBusy(false);
    if (updErr) {
      setDelistError(parseListingEditError(updErr.message) || genericErrorMessage("delist listing", updErr));
      return;
    }
    navigate(`/sell/listings/${listing.id}/edit`, { replace: true });
  }

  if (loading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!listing || listing.status !== "live") {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">Listing not found</div>
        <div className="mkt-empty-sub">It may not exist, or is not live right now.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  return (
    <div className="mkt-price-edit-page">
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>Update your price</h1></div></div>
      </div>

      <div className="mkt-sell-body">
        {!isRaise && (
          <div className="mkt-heldbox">
            <div className="hb-line"><span className="hb-tick">✓</span>This listing is live, so only the price can change here. People may already have seen it, lowering it helps a buyer, nothing else about the listing can shift without another check.</div>
          </div>
        )}

        <div className="mkt-field">
          <span className="mkt-uplabel">Your price</span>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ font: "400 15px/1 Lato, sans-serif", color: "var(--mkt-muted-2)", textDecoration: "line-through" }}>{formatNaira(listing.price_naira)}</span>
            <span style={{ font: "400 14px/1 Lato, sans-serif", color: "var(--mkt-muted-2)" }}>current</span>
          </div>
          <input
            className={isRaise ? "mkt-input error" : "mkt-input"}
            style={!isRaise ? { borderColor: "var(--mkt-green)", borderWidth: 1.5 } : undefined}
            value={newPrice}
            onChange={(e) => { setNewPrice(e.target.value.replace(/[^0-9]/g, "")); if (error) setError(null); }}
            placeholder={String(Math.round(listing.price_naira))}
            inputMode="numeric"
          />
          {isRaise && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--mkt-error)", font: "800 11px/1 Lato, sans-serif" }}>!</span>
              <span style={{ font: "400 12px/1.4 Lato, sans-serif", color: "var(--mkt-error)" }}>A live listing can only go down in price, not up</span>
            </div>
          )}
        </div>

        {isValid && !isRaise && (
          <div className="mkt-pricecard" style={{ padding: "11px 13px", gap: 3 }}>
            <span className="lbl">Buyers will now see</span>
            <div className="see" style={{ textAlign: "left" }}>{formatNaira(preview)}</div>
          </div>
        )}

        {/* Unlike everything else on a live listing, this IS allowed to change
            here, it does not touch the item's content. */}
        <div className="mkt-field">
          <span className="mkt-uplabel">Is this price negotiable?</span>
          <div className="mkt-chips">
            <button type="button" className={!negotiable ? "mkt-chip on" : "mkt-chip"} onClick={() => setNegotiable(false)}>No, firm price</button>
            <button type="button" className={negotiable ? "mkt-chip on" : "mkt-chip"} onClick={() => setNegotiable(true)}>Yes, buyers can ask for less</button>
          </div>
        </div>

        {isRaise && (
          <div className="mkt-errbox" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <b>Need to charge more?</b>
            <span>People may already have seen this at {formatNaira(listing.price_naira)}, raising it on them isn't fair. Delist it, change the price freely, and send it back for a quick review before it returns live.</span>
            <button className="mkt-secondary" style={{ borderColor: "var(--mkt-error)", color: "var(--mkt-error)" }} onClick={() => { setDelistError(null); setDelistOpen(true); }}>Delist and edit fully</button>
          </div>
        )}

        <div style={{ height: 1, background: "var(--mkt-border)" }} />
        <div className="mkt-uplabel">Everything else, locked while live</div>
        <div className="mkt-lrow" style={{ opacity: 0.55, cursor: "default" }}>
          <div className="th">{listing.image_url && <img src={listing.image_url} alt="" />}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="title">{listing.title}</div>
            <div className="meta">Photos, title, description, condition, category</div>
          </div>
        </div>
        {!isRaise && (
          <div className="mkt-help">
            Need to change any of that? <button type="button" onClick={() => { setDelistError(null); setDelistOpen(true); }} style={{ background: "none", border: "none", padding: 0, font: "700 11.5px/1.5 'Lato', sans-serif", color: "var(--mkt-coral-dark)", cursor: "pointer" }}>Delist it first</button>, then edit freely.
          </div>
        )}

        {error && !isRaise && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" onClick={save} disabled={busy || isRaise || !isValid}>{busy ? "Saving..." : "Save new price"}</button>
      </div>

      {delistOpen && (
        <div className="mkt-sheet-overlay" onClick={() => !delistBusy && setDelistOpen(false)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Take it off the marketplace to edit?</h3>
            <p>This comes off browse right away. Once you have made your changes, it needs a quick review again before it can go back up, same as any new listing.</p>
            <div className="kv">
              <div className="r"><span>{listing.title}</span><b>{formatNaira(listing.price_naira)}</b></div>
            </div>
            {delistError && <div className="mkt-errbox"><span className="m">!</span><span>{delistError}</span></div>}
            <button className="mkt-primary" style={{ background: "var(--mkt-error)" }} onClick={confirmDelist} disabled={delistBusy}>{delistBusy ? "Delisting..." : "Delist and edit"}</button>
            <button className="back" onClick={() => setDelistOpen(false)} disabled={delistBusy}>Cancel, keep it live for now</button>
          </div>
        </div>
      )}
    </div>
  );
}
