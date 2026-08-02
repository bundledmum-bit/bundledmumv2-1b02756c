import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, LISTING_BUCKET, buyerPrice, formatNaira, hasContactLeak } from "./sellData";

interface Category { id: string; name: string }
interface PhotoDraft { file: File; url: string }

const CONDITIONS = ["Like new", "Good", "Fair"];

/**
 * Create listing, guided so a seller does not stall on a blank form. Photos
 * upload to the marketplace-listings storage bucket, the first becomes image_url
 * and the rest gallery_urls. final_price_naira is computed by a DB trigger, we
 * never write it. Description and condition notes are checked for contact
 * details before submit, the same anti-leakage control the admin review uses.
 */
export default function CreateListingPage() {
  const { loading, isLoggedIn, seller } = useSeller();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [condition, setCondition] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) { window.location.assign("/account/login?returnTo=" + encodeURIComponent("/marketplace/sell")); return; }
    if (!seller) navigate("/sell/setup", { replace: true });
  }, [loading, isLoggedIn, seller, navigate]);

  const { data: markupPct = 10 } = useQuery({
    queryKey: ["mkt-markup"],
    queryFn: async () => {
      const { data } = await sdb.from("site_settings").select("value").eq("key", "marketplace_markup_percent").maybeSingle();
      const v = Number((data as { value: unknown } | null)?.value);
      return isFinite(v) ? v : 10;
    },
    staleTime: 60000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["mkt-allowed-categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data } = await sdb.from("marketplace_categories").select("id, name").eq("is_allowed", true).order("name");
      return (data ?? []) as unknown as Category[];
    },
    staleTime: 60000,
  });

  const priceNum = Number(price);
  const preview = useMemo(() => buyerPrice(priceNum, markupPct), [priceNum, markupPct]);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, 8 - photos.length).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((p) => [...p, ...next]);
  }
  function removePhoto(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    if (!seller) return;
    if (photos.length < 1) { setError("Add at least one photo so buyers can see the item."); return; }
    if (!title.trim()) { setError("Give your listing a title."); return; }
    if (!categoryId) { setError("Choose a category."); return; }
    if (!condition) { setError("Choose the condition."); return; }
    if (!conditionNotes.trim()) { setError("Add condition notes. Mention any flaw, buyers cannot ask questions before buying."); return; }
    if (!description.trim()) { setError("Add a description."); return; }
    if (!isFinite(priceNum) || priceNum <= 0) { setError("Enter your asking price."); return; }
    // Anti-leakage: no contact details in the buyer-visible text.
    if (hasContactLeak(description, conditionNotes)) {
      setError("Listings must not contain contact details like a phone number, WhatsApp or a request to call. Buyers and sellers connect after payment.");
      return;
    }

    setBusy(true);
    try {
      // Upload photos to the public marketplace-listings bucket.
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const f = photos[i].file;
        const safe = f.name.replace(/[^a-zA-Z0-9.]/g, "-").toLowerCase();
        const path = `${seller.id}/${Date.now()}-${i}-${safe}`;
        const { error: upErr } = await sdb.storage.from(LISTING_BUCKET).upload(path, f, { cacheControl: "3600", upsert: false, contentType: f.type });
        if (upErr) throw upErr;
        const { data: pub } = sdb.storage.from(LISTING_BUCKET).getPublicUrl(path);
        urls.push(pub.publicUrl);
      }

      const composedNotes = condition ? `${condition}. ${conditionNotes.trim()}` : conditionNotes.trim();
      // Note: final_price_naira and markup_percent are set by the DB trigger.
      const { error: insErr } = await sdb.from("marketplace_listings").insert({
        seller_id: seller.id,
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        condition_notes: composedNotes,
        price_naira: Math.round(priceNum),
        location_state: state.trim() || null,
        location_city: city.trim() || null,
        image_url: urls[0],
        gallery_urls: urls.slice(1),
        status: "pending_review",
      });
      if (insErr) throw insErr;
      setBusy(false);
      setDone(true);
    } catch (e) {
      setBusy(false);
      setError((e as { message?: string })?.message || "Something went wrong. Please try again.");
    }
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  if (done) {
    return (
      <div className="mkt-page">
        <div className="mkt-banner info" style={{ padding: 20 }}>
          <div style={{ fontFamily: "Nunito, sans-serif", fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Sent for review</div>
          Your listing is with our team now. It is not live yet, we check every listing before it appears
          on the marketplace. You will see it move to live on your dashboard once it is approved.
        </div>
        <button className="mkt-primary" style={{ marginTop: 16 }} onClick={() => navigate("/sell/dashboard")}>Go to my dashboard</button>
        <button className="mkt-secondary" style={{ marginTop: 10 }} onClick={() => window.location.reload()}>List another item</button>
      </div>
    );
  }

  return (
    <div className="mkt-page">
      <button className="mkt-linkback" onClick={() => navigate("/sell/dashboard")}>‹ Back</button>
      <h1>New listing</h1>
      <p className="lede">A full, honest listing sells faster. Buyers cannot ask questions before buying, so tell them everything here.</p>

      <div className="mkt-form">
        <div className="mkt-field">
          <label>Photos</label>
          <div className="mkt-photos">
            {photos.map((p, i) => (
              <div className="mkt-photo" key={p.url}>
                <img src={p.url} alt="" />
                {i === 0 && <span className="first">Main</span>}
                <button type="button" className="rm" onClick={() => removePhoto(i)} aria-label="Remove photo">×</button>
              </div>
            ))}
            {photos.length < 8 && (
              <button type="button" className="mkt-photo-add" onClick={() => fileRef.current?.click()} aria-label="Add photo">+</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          <span className="mkt-help">At least one photo. The first is the main photo buyers see. Add a few more to sell faster.</span>
        </div>

        <div className="mkt-field">
          <label>Title</label>
          <input className="mkt-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chicco Bravo stroller, folds flat" />
        </div>

        <div className="mkt-field">
          <label>Category</label>
          <select className="mkt-native-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="mkt-field">
          <label>Location</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="mkt-input" value={state} onChange={(e) => setState(e.target.value)} placeholder="State, e.g. Lagos" />
            <input className="mkt-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Area, e.g. Lekki" />
          </div>
        </div>

        <div className="mkt-field">
          <label>Condition</label>
          <div className="mkt-choices">
            {CONDITIONS.map((c) => (
              <button type="button" key={c} className={condition === c ? "mkt-choice on" : "mkt-choice"} onClick={() => setCondition(c)}>{c}</button>
            ))}
          </div>
          <textarea className="mkt-textarea" value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)}
            placeholder="Describe the condition honestly. Mention any scuff, stain or missing part, and what is included." />
          <span className="mkt-help">Do not add phone numbers or ways to contact you. Buyers and sellers connect after payment.</span>
        </div>

        <div className="mkt-field">
          <label>Description</label>
          <textarea className="mkt-textarea" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What it is, size or age range, how long you used it, why you are selling." />
        </div>

        <div className="mkt-field">
          <label>Your asking price</label>
          <input className="mkt-input" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 45000" inputMode="numeric" />
          <div className="mkt-price-preview">
            <div className="big tnum">{preview > 0 ? `Buyers will see ${formatNaira(preview)}` : "Buyers will see your price plus our markup"}</div>
            <div className="sub">You keep your full asking price. BundledMum adds a {markupPct}% markup, shown to the buyer.</div>
          </div>
        </div>

        {error && <div className="mkt-banner warn">{error}</div>}

        <button className="mkt-primary" onClick={submit} disabled={busy}>
          {busy ? "Sending for review..." : "Submit for review"}
        </button>
        <p className="mkt-help" style={{ textAlign: "center" }}>Every listing is checked by our team before it goes live.</p>
      </div>
    </div>
  );
}
