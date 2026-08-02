import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, LISTING_BUCKET, buyerPrice, formatNaira, hasContactLeak, compressImage } from "./sellData";
import AreaCombobox from "./AreaCombobox";

interface Category { id: string; name: string }
interface Place { id: string; name: string }
interface PhotoDraft { file: File; url: string }

const CONDITIONS = ["Almost new", "Good", "Fair"];
const MIN_PHOTOS = 4;
const MAX_PHOTOS = 8;

/**
 * Create listing, reskinned to the approved design. Photos upload to the
 * marketplace-listings bucket (compressed client-side first), the first becomes
 * image_url and the rest gallery_urls. final_price_naira and markup_percent are
 * DB trigger owned, never written here. Description and condition notes are
 * blocked for contact details before submit. State and area are admin-controlled
 * dependent dropdowns, but the chosen names are still written into the existing
 * location_state and location_city columns so browse keeps working.
 */
export default function CreateListingPage() {
  const { loading, isLoggedIn, seller } = useSeller();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stateId, setStateId] = useState("");
  const [areaName, setAreaName] = useState("");
  const [condition, setCondition] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [contactBlocked, setContactBlocked] = useState(false);
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

  // Admin-controlled locations. Only is_allowed rows are readable, so disabled
  // states and areas never reach the seller.
  const { data: states = [] } = useQuery({
    queryKey: ["mkt-allowed-states"],
    queryFn: async (): Promise<Place[]> => {
      const { data } = await sdb.from("marketplace_states").select("id, name").eq("is_allowed", true).order("sort_order");
      return (data ?? []) as unknown as Place[];
    },
    staleTime: 60000,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["mkt-allowed-areas", stateId],
    enabled: !!stateId,
    queryFn: async (): Promise<Place[]> => {
      const { data } = await sdb.from("marketplace_areas").select("id, name").eq("is_allowed", true).eq("state_id", stateId).order("name");
      return (data ?? []) as unknown as Place[];
    },
    staleTime: 60000,
  });

  const priceNum = Number(price);
  const preview = useMemo(() => buyerPrice(priceNum, markupPct), [priceNum, markupPct]);
  const filled = [photos.length >= MIN_PHOTOS, !!title.trim(), !!categoryId, !!condition, !!conditionNotes.trim(), !!description.trim(), priceNum > 0];
  const progress = Math.round((filled.filter(Boolean).length / filled.length) * 100);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, MAX_PHOTOS - photos.length).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((p) => [...p, ...next]);
  }
  function removePhoto(i: number) { setPhotos((p) => p.filter((_, idx) => idx !== i)); }

  async function submit() {
    setError(null); setContactBlocked(false);
    if (!seller) return;
    if (photos.length < MIN_PHOTOS) {
      setError(`Add at least ${MIN_PHOTOS} photos. Buyers cannot ask questions before buying, so different angles do the explaining for you.`);
      return;
    }
    if (!title.trim()) { setError("Give your listing a title."); return; }
    if (!categoryId) { setError("Choose a category."); return; }
    if (!condition) { setError("Choose the condition."); return; }
    if (!conditionNotes.trim()) { setError("Add condition notes. Mention any flaw, buyers cannot ask questions before buying."); return; }
    if (!description.trim()) { setError("Add a description."); return; }
    if (!isFinite(priceNum) || priceNum <= 0) { setError("Enter your asking price."); return; }
    if (hasContactLeak(description, conditionNotes)) { setContactBlocked(true); return; }

    setBusy(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const blob = await compressImage(photos[i].file);
        const path = `${seller.id}/${Date.now()}-${i}.jpg`;
        const { error: upErr } = await sdb.storage.from(LISTING_BUCKET).upload(path, blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const { data: pub } = sdb.storage.from(LISTING_BUCKET).getPublicUrl(path);
        urls.push(pub.publicUrl);
      }
      const composedNotes = condition ? `${condition}. ${conditionNotes.trim()}` : conditionNotes.trim();
      const stateName = states.find((s) => s.id === stateId)?.name ?? null;
      const { error: insErr } = await sdb.from("marketplace_listings").insert({
        seller_id: seller.id,
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        condition_notes: composedNotes,
        price_naira: Math.round(priceNum),
        location_state: stateName,
        location_city: areaName || null,
        image_url: urls[0],
        gallery_urls: urls.slice(1),
        status: "pending_review",
      });
      if (insErr) throw insErr;
      setBusy(false); setDone(true);
    } catch (e) {
      setBusy(false);
      setError((e as { message?: string })?.message || "Something went wrong. Please try again.");
    }
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  // S3c awaiting review
  if (done) {
    return (
      <div className="mkt-success">
        <div className="inner">
          <div className="check">✓</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h1>Well done, it is with our team</h1>
            <p>Your item is not live yet. Someone from BundledMum is checking the photos and details, usually within a few hours. We will let you know the moment it is approved.</p>
          </div>
          <div className="mkt-timeline">
            <div className="mkt-tl"><span className="d done">✓</span><span>Listing received</span></div>
            <div className="mkt-tl"><span className="d now"></span><span>Being reviewed now</span></div>
            <div className="mkt-tl"><span className="d todo"></span><span className="todo">Live in the marketplace</span></div>
          </div>
          <div className="listing">
            <div style={{ width: 48, height: 48, flex: "0 0 48px", borderRadius: 9, overflow: "hidden" }}>
              {photos[0] && <img src={photos[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "400 13px/1.3 Lato, sans-serif" }}>{title}</div>
              <div style={{ font: "400 11px/1.4 Lato, sans-serif", color: "var(--mkt-muted)" }}>Buyers see {formatNaira(preview)}</div>
            </div>
            <span className="mkt-st pending">Pending</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <button className="mkt-primary" onClick={() => window.location.reload()}>List another item</button>
            <button className="mkt-outline-light" onClick={() => navigate("/sell/dashboard")}>Go to my dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row">
            <button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button>
            <h1 style={{ flex: 1 }}>List an item</h1>
          </div>
          <div className="mkt-prog"><i style={{ width: `${progress}%` }} /></div>
          <p className="sub">Buyers cannot ask questions, so tell them everything here.</p>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-field">
          <div className="mkt-field-head">
            <span className="lbl">Photos</span>
            <span className="mkt-help">{photos.length} of {MIN_PHOTOS} minimum</span>
          </div>
          <div className="mkt-photos">
            {photos.map((p, i) => (
              <div className="mkt-photo" key={p.url}>
                <img src={p.url} alt="" />
                {i === 0 && <span className="main">Main</span>}
                <button type="button" className="rm" onClick={() => removePhoto(i)} aria-label="Remove photo">×</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && <button type="button" className="mkt-photo-add" onClick={() => fileRef.current?.click()} aria-label="Add photo">+</button>}
          </div>
          {/* No capture attribute, so the phone offers camera or gallery each tap. */}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          <div className="mkt-help">At least four, take them yourself with the camera or pick from your gallery. Aim for the front, the back, a close up of any flaw, and the item in use or its full view. The first is the main photo buyers see.</div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Title</span>
          <input className="mkt-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chicco Bravo stroller, folds flat" />
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Category</span>
          <select className="mkt-native-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">State</span>
          <select className="mkt-native-select" value={stateId} onChange={(e) => { setStateId(e.target.value); setAreaName(""); }}>
            <option value="">Choose state</option>
            {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="mkt-field">
          <span className="mkt-uplabel">Area</span>
          <AreaCombobox key={stateId} areas={areas} value={areaName} onChange={setAreaName} disabled={!stateId} />
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Condition and description</span>
          <div className="mkt-chips">
            {CONDITIONS.map((c) => (
              <button type="button" key={c} className={condition === c ? "mkt-chip on" : "mkt-chip"} onClick={() => setCondition(c)}>{c}</button>
            ))}
          </div>
          <textarea className="mkt-textarea" value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)}
            placeholder="Describe the condition honestly. Mention any scuff, stain or missing part, and what is included." />
          <div className="mkt-help">Mention any scuff or missing part, honesty prevents disputes. Do not add a phone number or way to contact you.</div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Description</span>
          <textarea className={contactBlocked ? "mkt-textarea error" : "mkt-textarea"} value={description} onChange={(e) => { setDescription(e.target.value); if (contactBlocked) setContactBlocked(false); }}
            placeholder="What it is, size or age range, how long you used it, why you are selling." />
        </div>

        {contactBlocked && (
          <div className="mkt-errbox">
            <span className="m">!</span>
            <div><b>Please take out your contact details</b><span>Listings cannot carry a phone number, WhatsApp, or a request to call. Your buyer gets your details automatically once they have paid, and that is what keeps your money protected.</span></div>
          </div>
        )}
        {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}

        <div className="mkt-pricecard">
          <div className="cols">
            <div style={{ flex: 1 }}>
              <div className="lbl">Your asking price</div>
              <div className="askbox">₦&nbsp;<input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="45,000" inputMode="numeric" /></div>
            </div>
            <div>
              <div className="lbl">Buyers see</div>
              <div className="see">{preview > 0 ? formatNaira(preview) : "₦0"}</div>
            </div>
          </div>
          <div className="note">You keep {formatNaira(priceNum > 0 ? Math.round(priceNum) : 0)}. BundledMum adds a {markupPct}% markup on top, shown to the buyer, and buyers pay a service fee at checkout.</div>
        </div>
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" onClick={submit} disabled={busy}>{busy ? "Sending for review..." : "Send for review"}</button>
        <div className={contactBlocked ? "helper err" : "helper"}>{contactBlocked ? "Contact details must come out first" : "Our team checks every listing before it goes live"}</div>
      </div>
    </>
  );
}
