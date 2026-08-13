import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, formatNaira, fetchListingPhotoAsFile } from "./sellData";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";

interface ShareListing {
  id: string;
  title: string;
  final_price_naira: number;
  image_url: string | null;
  status: string;
}

const SITE_ORIGIN = "https://bundledmum.com";

/**
 * Reached from the "your listing hasn't sold yet" nudge email, and now also
 * from a "Share" action on the seller dashboard for any live listing.
 *
 * WHY THIS PAGE EXISTS: there is no URL scheme for posting to WhatsApp
 * Status, from an email or anywhere. What genuinely works is the Web Share
 * API (navigator.share) carrying an image file plus text to the phone's own
 * share sheet, from which a seller picks WhatsApp then My Status — two taps
 * instead of one, but real. That API only exists on a web page a person is
 * actually standing on, never from inside an email, which is the entire
 * reason this is a page and not just a link in the email itself.
 *
 * Ownership is enforced the same way every other listing-scoped query in
 * this codebase does it: the fetch itself is scoped to `.eq("seller_id",
 * seller!.id)`, backed by RLS, never a client-side id comparison after an
 * unscoped fetch. Someone else's listing id in the URL returns nothing,
 * which reads identically to "not found".
 */
export default function SellerListingSharePage() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const { loading, isLoggedIn, seller } = useSeller();

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) sendToMarketplaceLogin(`/sell/share/${listingId}`, "seller");
  }, [loading, isLoggedIn, listingId]);

  const { data: listing, isLoading } = useQuery({
    queryKey: ["mkt-share-listing", listingId, seller?.id],
    enabled: !!listingId && !!seller,
    queryFn: async (): Promise<ShareListing | null> => {
      const { data } = await sdb
        .from("marketplace_listings")
        .select("id, title, final_price_naira, image_url, status")
        .eq("id", listingId as string)
        .eq("seller_id", seller!.id)
        .maybeSingle();
      return (data as unknown as ShareListing) ?? null;
    },
  });

  // Detected once support is knowable, real feature-detection rather than
  // guessed from the device — see the effect below.
  type ShareMode = "checking" | "files" | "text" | "manual";
  const [mode, setMode] = useState<ShareMode>("checking");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"shared" | "cancelled" | "error" | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const listingUrl = listing ? `${SITE_ORIGIN}/marketplace/listing/${listing.id}` : "";
  const shareText = listing
    ? `Selling this: ${listing.title} for ${formatNaira(listing.final_price_naira)}. Check it out on BundledMum Marketplace: ${listingUrl}`
    : "";

  // Three real cases, checked in order, never assumed from browser/device
  // sniffing: (1) files genuinely shareable — fetch the photo once, build
  // the actual File, and ask canShare with THAT file, since support can
  // depend on the file itself, not just the API's presence; (2) share
  // exists but files don't (or the fetch/canShare check failed) — text and
  // link only; (3) navigator.share doesn't exist at all, overwhelmingly
  // desktop — manual copy and download.
  useEffect(() => {
    if (!listing) return;
    let alive = true;
    (async () => {
      if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
        if (alive) setMode("manual");
        return;
      }
      if (!listing.image_url || typeof navigator.canShare !== "function") {
        if (alive) setMode("text");
        return;
      }
      try {
        const file = await fetchListingPhotoAsFile(listing.image_url, "listing-photo.jpg");
        if (!alive) return;
        if (navigator.canShare({ files: [file] })) {
          setPhotoFile(file);
          setMode("files");
        } else {
          setMode("text");
        }
      } catch {
        if (alive) setMode("text");
      }
    })();
    return () => {
      alive = false;
    };
  }, [listing]);

  async function doShare() {
    if (!listing) return;
    setBusy(true);
    setOutcome(null);
    try {
      if (mode === "files" && photoFile) {
        await navigator.share({ files: [photoFile], text: shareText });
      } else {
        await navigator.share({ text: shareText });
      }
      setOutcome("shared");
    } catch (err) {
      // AbortError is her closing the share sheet without picking anything,
      // not a failure worth reporting.
      const isAbort = err instanceof Error && err.name === "AbortError";
      setOutcome(isAbort ? "cancelled" : "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard permission denied or unavailable — the text is already visible to select by hand */
    }
  }

  async function downloadPhoto() {
    if (!listing?.image_url) return;
    setDownloadBusy(true);
    setDownloadError(false);
    try {
      const file = photoFile ?? (await fetchListingPhotoAsFile(listing.image_url, "listing-photo.jpg"));
      const objectUrl = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "listing-photo.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloadBusy(false);
    }
  }

  if (loading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  if (!listing) {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Listing not found" />
        <div className="mkt-empty-title">Listing not found</div>
        <div className="mkt-empty-sub">It may not exist, or it isn't yours.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  if (listing.status !== "live") {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Not live right now" />
        <div className="mkt-empty-title">This listing isn't live right now</div>
        <div className="mkt-empty-sub">Sharing only helps while it's out there for people to buy. Check your dashboard for what's currently live.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  return (
    <div className="mkt-price-edit-page">
      <MarketplaceTitle title="Share your listing" />
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row">
            <button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button>
            <h1 style={{ flex: 1 }}>Share your listing</h1>
          </div>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-heldbox">
          <div className="hb-line">
            <span className="hb-tick">✓</span>
            Most Nigerian mums' WhatsApp contacts are other mums, exactly who buys used baby things. A Status post reaches all of them at once, for free.
          </div>
        </div>

        {listing.image_url && (
          <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 14, overflow: "hidden", background: "var(--mkt-cream)" }}>
            <img src={listing.image_url} alt={listing.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}

        <div className="mkt-field">
          <span className="mkt-uplabel">What buyers will see</span>
          <div className="mkt-lrow" style={{ cursor: "default" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{listing.title}</div>
              <div className="meta">{formatNaira(listing.final_price_naira)}</div>
            </div>
          </div>
        </div>

        {outcome === "shared" && (
          <div className="mkt-heldbox">
            <div className="hb-line"><span className="hb-tick">✓</span>Sent to your share sheet. Pick WhatsApp, then My Status, to post it.</div>
          </div>
        )}
        {outcome === "error" && (
          <div className="mkt-errbox"><span className="m">!</span><span>Something went wrong opening the share sheet. Try again, or copy the message below and send it yourself.</span></div>
        )}

        {(mode === "files" || mode === "text") && (
          <button
            className="mkt-primary"
            style={{ background: "#25D366", color: "#fff" }}
            onClick={doShare}
            disabled={busy}
          >
            {busy ? "Opening share sheet..." : "Share to WhatsApp"}
          </button>
        )}

        {/* Never a dead end: a share attempt can fail even where it's
            supposed to work (a permission prompt dismissed, a transient
            error), so the same copy fallback manual mode always has is
            offered here too, only once actually needed. */}
        {outcome === "error" && mode !== "manual" && (
          <button type="button" className="mkt-secondary" onClick={copyText}>{copied ? "Copied" : "Copy message"}</button>
        )}

        {mode === "text" && (
          <div className="mkt-help">
            Your phone can't attach the photo automatically here. Save the photo above yourself (press and hold it), and add it to your Status along with the message.
          </div>
        )}

        {mode === "manual" && (
          <>
            <div className="mkt-help">Sharing works best from a phone, where WhatsApp can open directly. From here, copy the message and save the photo, then send them yourself.</div>
            <div className="mkt-field">
              <span className="mkt-uplabel">Message to send</span>
              <div className="mkt-input" style={{ minHeight: 64, whiteSpace: "pre-wrap", background: "var(--mkt-cream)", cursor: "text" }}>{shareText}</div>
              <button type="button" className="mkt-secondary" onClick={copyText}>{copied ? "Copied" : "Copy message"}</button>
            </div>
            <button className="mkt-secondary" onClick={downloadPhoto} disabled={downloadBusy}>{downloadBusy ? "Preparing..." : "Download photo"}</button>
            {downloadError && <div className="mkt-errbox"><span className="m">!</span><span>Could not download the photo, please try again.</span></div>}
          </>
        )}
      </div>
    </div>
  );
}
