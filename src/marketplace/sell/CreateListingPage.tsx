import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sdb, LISTING_BUCKET, buyerPrice, formatNaira, hasContactLeak, processListingImage } from "./sellData";
import AreaCombobox from "./AreaCombobox";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

interface Category { id: string; name: string }
interface Place { id: string; name: string }
type FieldType = "select" | "text" | "number" | "boolean";
interface CategoryField {
  id: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  is_required: boolean;
  help_text: string | null;
  sort_order: number;
}
type AnswerValue = string | number | boolean;
// The blob is the processed photo (square, watermarked, compressed). We process
// on add so the seller sees exactly what will be stored, and upload the same blob.
interface PhotoDraft { blob: Blob; url: string }

const CONDITIONS = ["Almost new", "Good", "Fair"];
// Maps the picker's display label to the structured `condition` enum column, the
// reliable source used by the browse condition filter. condition_notes stays free
// text, written alongside as before.
const CONDITION_VALUE: Record<string, string> = { "Almost new": "almost_new", "Good": "good", "Fair": "fair" };
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
  const { loading, isLoggedIn, seller, user } = useSeller();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stateId, setStateId] = useState("");
  const [areaName, setAreaName] = useState("");
  const [condition, setCondition] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [identicalOk, setIdenticalOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactBlocked, setContactBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Per-category questions (design 16a). Answers are keyed by field_key and reset
  // whenever the category changes, since a different category's field_keys carry
  // different meaning (or don't exist at all) — never submit an answer under a key
  // that belongs to a different category than the one being submitted.
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());
  const [recovery, setRecovery] = useState<{ labels: string[]; keys: string[] } | null>(null);
  const questionsRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function changeCategory(id: string) {
    setCategoryId(id);
    setAnswers({});
    setInvalidKeys(new Set());
    setRecovery(null);
  }
  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setInvalidKeys((s) => { if (!s.has(key)) return s; const n = new Set(s); n.delete(key); return n; });
  }

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) { sendToMarketplaceLogin("/sell"); return; }
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

  // Category-specific questions (marketplace_category_fields, admin-managed).
  // Ordered by sort_order, field_key as a stable tiebreaker for rows an admin gave
  // the same sort_order (e.g. two bulk-applied questions land on the same number).
  const { data: categoryFields = [], isLoading: fieldsLoading } = useQuery({
    queryKey: ["mkt-category-fields", categoryId],
    enabled: !!categoryId,
    queryFn: async (): Promise<CategoryField[]> => {
      const { data } = await sdb.from("marketplace_category_fields")
        .select("id, field_key, label, field_type, options, is_required, help_text, sort_order")
        .eq("category_id", categoryId)
        .order("sort_order")
        .order("field_key");
      return (data ?? []) as unknown as CategoryField[];
    },
    staleTime: 60000,
  });
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "";

  function fieldErrorText(f: CategoryField): string {
    return f.help_text || "This is required. Buyers cannot ask before buying.";
  }

  /** Every required question with no real answer yet: text/select need a non-empty
   * trimmed string, number needs a value that parses, boolean needs an EXPLICIT
   * true or false (an unanswered boolean must never default to false, or a
   * required yes/no could silently pass with no seller input at all). */
  function missingRequiredFields(): CategoryField[] {
    return categoryFields.filter((f) => {
      if (!f.is_required) return false;
      const v = answers[f.field_key];
      if (f.field_type === "boolean") return v !== true && v !== false;
      if (f.field_type === "number") return v === undefined || v === "" || !isFinite(Number(v));
      return v === undefined || String(v).trim() === "";
    });
  }

  /** attributes payload for the insert: real JSON types per field_type, so the
   * database trigger's null/empty check (which only special-cases the STRING
   * type as "empty" when blank) reads every answer correctly, a boolean false or
   * a number 0 both count as answered, never as missing. */
  function buildAttributes(): Record<string, AnswerValue> {
    const out: Record<string, AnswerValue> = {};
    for (const f of categoryFields) {
      const v = answers[f.field_key];
      if (v === undefined || v === "") continue;
      out[f.field_key] = f.field_type === "number" ? Number(v) : v;
    }
    return out;
  }

  const priceNum = Number(price);
  const preview = useMemo(() => buyerPrice(priceNum, markupPct), [priceNum, markupPct]);
  const filled = [photos.length >= MIN_PHOTOS, !!title.trim(), !!categoryId, !!condition, !!conditionNotes.trim(), !!description.trim(), priceNum > 0];
  const progress = Math.round((filled.filter(Boolean).length / filled.length) * 100);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const chosen = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    if (chosen.length === 0) return;
    setPhotoBusy(true);
    try {
      // Process each photo now (square crop to fill + watermark + compress) so the
      // preview shows exactly what gets stored, and the same blob is uploaded.
      const next: PhotoDraft[] = [];
      for (const file of chosen) {
        const blob = await processListingImage(file);
        next.push({ blob, url: URL.createObjectURL(blob) });
      }
      setPhotos((p) => [...p, ...next]);
    } finally {
      setPhotoBusy(false);
    }
  }
  function removePhoto(i: number) {
    setPhotos((p) => {
      const target = p[i];
      if (target) URL.revokeObjectURL(target.url);
      return p.filter((_, idx) => idx !== i);
    });
  }

  function goToQuestions() {
    const firstKey = recovery?.keys[0];
    const target = (firstKey && fieldRefs.current[firstKey]) || questionsRef.current;
    setRecovery(null);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submit() {
    setError(null); setContactBlocked(false); setRecovery(null);
    if (!seller || !user) return;
    if (photos.length < MIN_PHOTOS) {
      setError(`Add at least ${MIN_PHOTOS} photos. Buyers cannot ask questions before buying, so different angles do the explaining for you.`);
      return;
    }
    if (!title.trim()) { setError("Give your listing a title."); return; }
    if (!categoryId) { setError("Choose a category."); return; }
    if (!condition) { setError("Choose the condition."); return; }
    if (!conditionNotes.trim()) { setError("Add condition notes. Mention any flaw, buyers cannot ask questions before buying."); return; }

    // Required category questions, same "cannot ask questions later" reasoning as
    // photos and condition notes. The database enforces this too (a trigger on
    // marketplace_listings), this check exists for a good experience, not because
    // the backend needs it, so it must never be treated as the only guard.
    const missing = missingRequiredFields();
    if (missing.length > 0) {
      setInvalidKeys(new Set(missing.map((f) => f.field_key)));
      setError(missing.length === 1
        ? `${missing[0].label} still needs an answer. Buyers cannot ask before buying.`
        : `A few more answers are needed: ${missing.map((f) => f.label).join(", ")}.`);
      questionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!description.trim()) { setError("Add a description."); return; }
    if (!isFinite(priceNum) || priceNum <= 0) { setError("Enter your asking price."); return; }
    if (quantity > 1 && !identicalOk) { setError(`Please confirm all ${quantity} items are identical, or set the quantity back to 1.`); return; }
    if (hasContactLeak(description, conditionNotes)) { setContactBlocked(true); return; }

    setBusy(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        // Already processed on add (square, watermarked, compressed) — upload as is.
        const blob = photos[i].blob;
        const path = `${user.id}/${Date.now()}-${i}.jpg`;
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
        condition: CONDITION_VALUE[condition] ?? null,
        price_naira: Math.round(priceNum),
        quantity: Math.max(1, Math.round(quantity)),
        location_state: stateName,
        location_city: areaName || null,
        attributes: buildAttributes(),
        image_url: urls[0],
        gallery_urls: urls.slice(1),
        status: "pending_review",
      });
      if (insErr) throw insErr;
      setBusy(false); setDone(true);
    } catch (e) {
      setBusy(false);
      const msg = (e as { message?: string })?.message || "";
      // The required-fields trigger raises "Missing required details: Label, Label".
      // Client validation should already catch this every normal time, this is the
      // rare-recovery path (design C4) for whatever slipped past it, e.g. a category
      // question added by an admin between page load and submit. Never show the raw
      // database error for this case, name the field(s) and offer one tap back.
      const dbMatch = /^Missing required details:\s*(.+)$/.exec(msg.trim());
      if (dbMatch) {
        const labels = dbMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
        const keys = categoryFields.filter((f) => labels.includes(f.label)).map((f) => f.field_key);
        setInvalidKeys(new Set(keys));
        setRecovery({ labels, keys });
        return;
      }
      setError(msg || "Something went wrong. Please try again.");
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
            {photos.length < MAX_PHOTOS && <button type="button" className="mkt-photo-add" onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Add photo">{photoBusy ? "…" : "+"}</button>}
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
          <select className="mkt-native-select" value={categoryId} onChange={(e) => changeCategory(e.target.value)}>
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

        {/* Category questions (design 16a), sits between condition and description.
            Nothing renders until a category is chosen and its questions have loaded. */}
        {categoryId && !fieldsLoading && categoryFields.length > 0 && (
          <div className="mkt-field" ref={questionsRef}>
            <div className="mkt-cq-head">
              <span className="mkt-uplabel">
                {categoryName}{categoryFields.length === 1 ? ", one quick thing" : ", a couple more details"}
              </span>
              {categoryFields.length > 1 && (
                <p className="mkt-help" style={{ marginTop: 2 }}>Buyers cannot ask you questions, so these help them decide with confidence.</p>
              )}
            </div>

            {categoryFields.length === 1 ? (
              <>
                {/* The single default question, then a short reassurance instead of a
                    sparse or seemingly-broken empty section (design C2). */}
                <QuestionField field={categoryFields[0]} value={answers[categoryFields[0].field_key]} invalid={invalidKeys.has(categoryFields[0].field_key)}
                  onChange={(v) => setAnswer(categoryFields[0].field_key, v)} setRef={(el) => { fieldRefs.current[categoryFields[0].field_key] = el; }} errorText={fieldErrorText(categoryFields[0])} />
                <div className="mkt-reassure">
                  <div className="mkt-reassure-tick">✓</div>
                  <div className="mkt-reassure-text">That is everything specific to {categoryName}. On to description and price.</div>
                </div>
              </>
            ) : (
              categoryFields.map((f) => (
                <QuestionField key={f.id} field={f} value={answers[f.field_key]} invalid={invalidKeys.has(f.field_key)}
                  onChange={(v) => setAnswer(f.field_key, v)} setRef={(el) => { fieldRefs.current[f.field_key] = el; }} errorText={fieldErrorText(f)} />
              ))
            )}
          </div>
        )}

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
          <div className="note">You keep {formatNaira(priceNum > 0 ? Math.round(priceNum) : 0)} per item. BundledMum adds a {markupPct}% markup on top, shown to the buyer, and buyers pay a service fee at checkout.</div>
        </div>

        {/* Quantity. Invisible weight for the one-off case, defaults to 1. */}
        <div className="mkt-field">
          <div className="mkt-field-head">
            <span className="lbl">How many</span>
            <span className="mkt-help">Optional</span>
          </div>
          <div className="mkt-qty">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Fewer">−</button>
            <span className="n">{quantity}</span>
            <button type="button" onClick={() => setQuantity((q) => Math.min(99, q + 1))} aria-label="More">+</button>
          </div>
          <div className="mkt-help">Leave it at 1 if you have just the one, which is the usual thing. The price is per item, so buyers see {preview > 0 ? formatNaira(preview) : "the buyer price"} for each, not for all {quantity} together.</div>

          {quantity > 1 && (
            <div className={identicalOk ? "mkt-identical ok" : "mkt-identical"}>
              <div className="head"><span className="m">!</span><b>Are all {quantity} exactly the same?</b></div>
              <p>Same size, same colour, same condition, same everything. Buyers cannot ask you questions before they pay, so whoever buys the last one must get what the photos show, just like the first.</p>
              <label className="chk">
                <input type="checkbox" checked={identicalOk} onChange={(e) => setIdenticalOk(e.target.checked)} />
                <span>Yes, all {quantity} are identical</span>
              </label>
              {priceNum > 0 && <div className="tot">Sell all {quantity} and you receive {formatNaira(Math.round(priceNum) * quantity)}. Each one is bought separately.</div>}
            </div>
          )}
        </div>
      </div>

      <div className="mkt-sell-foot">
        <button className="mkt-primary" onClick={submit} disabled={busy || photoBusy}>{busy ? "Sending for review..." : "Send for review"}</button>
        <div className={contactBlocked ? "helper err" : "helper"}>{contactBlocked ? "Contact details must come out first" : "Our team checks every listing before it goes live"}</div>
      </div>

      {/* Server-side rejection recovery (design C4). Client validation should always
          catch this first, this is the rare path for whatever slipped past it, e.g.
          a category question added by an admin between page load and submit. */}
      {recovery && (
        <div className="mkt-sheet-overlay" onClick={() => setRecovery(null)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3 style={{ color: "var(--mkt-error)" }}>
              {recovery.labels.length === 1 ? "One answer did not go through" : "A few answers did not go through"}
            </h3>
            <p>
              We could not save your listing because {recovery.labels.join(", ")} {recovery.labels.length === 1 ? "was" : "were"} left empty.
              Nothing else was lost, your photos and price are still here.
            </p>
            <div className="mkt-errbox" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              {recovery.labels.map((l) => (
                <div key={l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <b style={{ marginBottom: 0 }}>{l}</b>
                  <span className="mkt-qpill req">Required</span>
                </div>
              ))}
            </div>
            <button className="mkt-primary" onClick={goToQuestions}>
              {recovery.labels.length === 1 ? `Take me to ${recovery.labels[0]}` : "Take me to those fields"}
            </button>
            <div style={{ textAlign: "center", font: "400 11.5px/1 Lato, sans-serif", color: "var(--mkt-muted)" }}>
              Everything else you entered stays exactly as it was
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A single category question, all four field types (design 16a).
// ─────────────────────────────────────────────────────────────────────────────

function QuestionField({ field, value, invalid, onChange, setRef, errorText }: {
  field: CategoryField;
  value: AnswerValue | undefined;
  invalid: boolean;
  onChange: (v: AnswerValue) => void;
  setRef: (el: HTMLDivElement | null) => void;
  errorText: string;
}) {
  return (
    <div className="mkt-field" ref={setRef} style={{ gap: 6 }}>
      <div className="mkt-field-head">
        <span className="lbl" style={invalid ? { color: "var(--mkt-error)" } : undefined}>{field.label}</span>
        <span className={field.is_required ? "mkt-qpill req" : "mkt-qpill opt"}>{field.is_required ? "Required" : "Optional"}</span>
      </div>

      {field.field_type === "select" && (
        <select className={invalid ? "mkt-native-select error" : "mkt-native-select"} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose {field.label.toLowerCase()}</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {field.field_type === "text" && (
        <input className={invalid ? "mkt-input error" : "mkt-input"} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder={`Add ${field.label.toLowerCase()}`} />
      )}

      {field.field_type === "number" && (
        <input className={invalid ? "mkt-input error" : "mkt-input"} value={value === undefined ? "" : String(value)} inputMode="numeric"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} placeholder={`Add ${field.label.toLowerCase()}`} />
      )}

      {field.field_type === "boolean" && (
        <div className={invalid ? "mkt-chips error" : "mkt-chips"}>
          <button type="button" className={value === true ? "mkt-chip on" : "mkt-chip"} onClick={() => onChange(true)}>Yes</button>
          <button type="button" className={value === false ? "mkt-chip on" : "mkt-chip"} onClick={() => onChange(false)}>No</button>
        </div>
      )}

      {field.help_text && field.field_type !== "select" && !invalid && <div className="mkt-help">{field.help_text}</div>}
      {invalid && (
        <div className="mkt-help" style={{ color: "var(--mkt-error)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontWeight: 800 }}>!</span>{errorText}
        </div>
      )}
    </div>
  );
}
