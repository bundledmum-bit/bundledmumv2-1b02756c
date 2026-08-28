import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { stageListingVideo, useListingVideoNotice, useListingVideo, LISTING_VIDEO_MAX_MB } from "../listingVideo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller, hasCompleteDeliveryPrefs } from "./useSeller";
import {
  sdb, LISTING_BUCKET, buyerPrice, formatNaira, hasContactLeak, processListingImage, describeUploadError, genericErrorMessage, parseListingEditError, UnsupportedImageError, ImageTimeoutError, ImageTooLargeError, IMAGE_UPLOAD_TIMEOUT_MS,
  LISTING_VIDEO_BUCKET, processListingVideo, describeVideoUploadError, readVideoMetadata, VideoTooLongError,
  shouldSkipVideoCompression, VideoTooLargeError, VideoTimeoutError, withTimeout, VIDEO_UPLOAD_TIMEOUT_MS,
} from "./sellData";
import AreaCombobox from "./AreaCombobox";
import DeliveryHandoverChoice from "./DeliveryHandoverChoice";
import { logUploadFailure } from "../lib/uploadFailureLog";
import { useSellerListingInfo } from "./useSellerListingInfo";
import { saveSellerDeliveryPrefs, type LocalHandover } from "./deliveryPrefs";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";
import MarketplaceInstallCta from "../components/MarketplaceInstallCta";
import DelistToEditSheet from "./DelistToEditSheet";
import { useMarketplaceVideoEnabled } from "../videoSettings";

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

/** One of the six universal condition questions (marketplace_condition_questions,
 * already deployed, admin-managed but fixed content today). A follow-up text box
 * appears only when the chosen option is in followup_required_for, and is then
 * itself required, e.g. picking "Yes, noticeable" for marks requires saying what
 * and where. Answers are written to condition_answers as {question_key: option,
 * [question_key]_detail: text}; the database derives condition_notes from this
 * itself (sync_condition_notes_from_answers), so this form never writes
 * condition_notes directly. */
interface ConditionQuestion {
  id: string;
  question_key: string;
  label: string;
  options: string[];
  is_required: boolean;
  help_text: string | null;
  sort_order: number;
  followup_required_for: string[];
  followup_label: string | null;
  followup_placeholder: string | null;
}
// The blob is the processed photo (square, watermarked, compressed). We process
// on add so the seller sees exactly what will be stored, and upload the same blob.
// null blob means an already-uploaded photo carried over from the existing
// listing being edited — url is its real public URL, nothing to upload again.
interface PhotoDraft { blob: Blob | null; url: string }
/** blob/posterBlob null means "already uploaded" (edit mode carrying over an
 * existing video, url/posterUrl already live public URLs) — the exact same
 * null-means-existing convention PhotoDraft uses above. */
interface VideoDraft { blob: Blob | null; posterBlob: Blob | null; url: string; posterUrl: string; durationSeconds: number; mimeType: string }

interface ExistingListing {
  id: string;
  status: string;
  title: string;
  description: string | null;
  condition: string | null;
  condition_notes: string | null;
  condition_answers: Record<string, string> | null;
  category_id: string | null;
  location_state: string | null;
  location_city: string | null;
  attributes: Record<string, AnswerValue> | null;
  price_naira: number;
  original_price_naira: number | null;
  quantity: number;
  is_negotiable: boolean;
  image_url: string | null;
  gallery_urls: string[] | null;
  rejection_reason: string | null;
  video_url: string | null;
  video_poster_url: string | null;
  video_duration_seconds: number | null;
}

const CONDITIONS = ["Almost new", "Good", "Fair"];
// Maps the picker's display label to the structured `condition` enum column, the
// reliable source used by the browse condition filter and the display tag.
const CONDITION_VALUE: Record<string, string> = { "Almost new": "almost_new", "Good": "good", "Fair": "fair" };
const MIN_PHOTOS = 4;
const MAX_PHOTOS = 8;

/**
 * Create listing AND full edit (rejected/delisted/pending_review), reskinned
 * to the approved design (create) and design 21a (edit reuses this same
 * form, per its own instruction: "Full create-listing form reused as-is").
 * Edit mode is entered at /sell/listings/:id/edit; create mode at /sell/new
 * has no :id and behaves exactly as before.
 *
 * Photos upload to the marketplace-listings bucket (compressed client-side
 * first), the first becomes image_url and the rest gallery_urls. In edit
 * mode, existing photos are carried over as-is (PhotoDraft.blob null, url
 * already a live public URL) — only newly added ones go through the
 * upload pipeline. final_price_naira and markup_percent are DB trigger
 * owned, never written here. Description and condition notes are blocked
 * for contact details before submit. State and area are admin-controlled
 * dependent dropdowns, but the chosen names are still written into the
 * existing location_state and location_city columns so browse keeps
 * working.
 *
 * Edit mode always submits with status: 'pending_review' — the database
 * (guard_seller_listing_edits) is the actual source of truth for what a
 * seller may change and when; this mirrors those rules for a good
 * experience, it never re-implements them as authoritative. A seller can
 * never reach this form for a 'live' or 'sold' listing (redirected back to
 * the dashboard), those are handled by SellerPriceEditPage.tsx instead.
 */
export default function CreateListingPage() {
  const { loading, isLoggedIn, seller, user, refresh } = useSeller();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = useParams<{ id?: string }>();
  const isEditMode = !!editId;

  // The YouTube-hosted listing video. Only offered when EDITING, because
  // seller_stage_listing_video needs a listing id and on create there is
  // not one yet. Entirely separate from the paused compression pipeline
  // below, which stays gated behind marketplace_video_enabled.
  const listingVideoNotice = useListingVideoNotice();
  const { data: existingListingVideo } = useListingVideo(editId);
  const ytFileRef = useRef<HTMLInputElement | null>(null);
  const [ytBusy, setYtBusy] = useState(false);
  const [ytProgress, setYtProgress] = useState(0);
  const [ytStaged, setYtStaged] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);

  async function addListingVideo(files: FileList | null) {
    const f = files?.[0];
    if (!f || !editId || !user?.id) return;
    // file.size is the ONLY thing read from the file. No duration, no
    // <video> element, no canvas, no compression. Reading a video hangs
    // indefinitely on iPhone and that is what killed this feature the
    // first time (handoff 87 to 92).
    if (f.size > LISTING_VIDEO_MAX_MB * 1024 * 1024) {
      setYtError(`That file is larger than ${LISTING_VIDEO_MAX_MB}MB. Please record a shorter clip.`);
      return;
    }
    setYtBusy(true); setYtError(null); setYtProgress(0);
    const res = await stageListingVideo({
      listingId: editId, sellerAuthUid: user.id, file: f, onProgress: setYtProgress,
    });
    setYtBusy(false);
    if (!res.ok) { setYtError(res.message ?? "That could not be saved."); return; }
    setYtStaged(true);
  }
  const fileRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);
  // A seller landing here directly for a LIVE listing (bookmark, back button,
  // the dashboard's old "Edit" affordance before this pass) used to be
  // silently bounced to the dashboard with no explanation — see the
  // live-specific render branch below instead.
  const [liveDelistOpen, setLiveDelistOpen] = useState(false);

  // Master switch, paused as of §91 (video couldn't be made reliable on
  // iPhone) — defaults to false while loading and on any read failure, so
  // this section never flashes into view and then vanishes. When this is
  // false a seller must never see any control, hint, or mention that video
  // exists at all, not just an empty/disabled one.
  const videoEnabled = useMarketplaceVideoEnabled();

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const videoFileRef = useRef<HTMLInputElement | null>(null);
  const [video, setVideo] = useState<VideoDraft | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  // True only while the slow real-time re-encode path is actually running —
  // distinct from videoBusy, which covers the instant skip-compression path
  // too. Drives which processing message/UI is shown, so we never claim a
  // long compress is happening when the file just uploads as-is.
  const [videoCompressing, setVideoCompressing] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stateId, setStateId] = useState("");
  const [areaName, setAreaName] = useState("");
  const [condition, setCondition] = useState("");
  // The six universal condition questions, keyed by question_key, plus
  // "{key}_detail" for a follow-up's free text. The database derives
  // condition_notes from this itself once it is non-empty, this form never
  // writes condition_notes directly.
  const [conditionAnswers, setConditionAnswers] = useState<Record<string, string>>({});
  const [conditionInvalidKeys, setConditionInvalidKeys] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [identicalOk, setIdenticalOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [contactBlocked, setContactBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // ENTRY POINT 2 — the same-state handover question as the FIRST STEP of
  // this form, for a seller who has not answered and has NO listings yet.
  // A seller who already has listings is caught by the blocking modal
  // instead (SellerDeliveryGate), so exactly one of the two ever fires.
  // Inline, and it cannot be skipped: the form itself does not render
  // until it is answered.
  const { data: sellerListingInfo } = useSellerListingInfo(seller?.id);
  const askDelivery = !!seller
    && !hasCompleteDeliveryPrefs(seller)
    && !isEditMode
    && sellerListingInfo?.count === 0;
  const [handoverStep, setHandoverStep] = useState<1 | 2>(1);
  const [handoverNationwide, setHandoverNationwide] = useState<boolean | null>(null);
  // Pre-seeded below from anything already answered, so a seller re-asked
  // only because sells_nationwide is missing never re-picks a handover
  // they already gave us.
  const [localHandover, setLocalHandover] = useState<LocalHandover | null>(null);
  const handoverSeeded = useRef(false);
  useEffect(() => {
    if (handoverSeeded.current || !seller) return;
    handoverSeeded.current = true;
    if (seller.local_handover) setLocalHandover(seller.local_handover as LocalHandover);
    if (seller.sells_nationwide !== null) setHandoverNationwide(seller.sells_nationwide);
  }, [seller]);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);

  const { data: existingListing, isLoading: existingLoading } = useQuery({
    queryKey: ["mkt-edit-listing", editId],
    enabled: isEditMode && !!seller,
    queryFn: async (): Promise<ExistingListing | null> => {
      const { data } = await sdb.from("marketplace_listings")
        .select("id, status, title, description, condition, condition_notes, condition_answers, category_id, location_state, location_city, attributes, price_naira, original_price_naira, quantity, is_negotiable, image_url, gallery_urls, rejection_reason, video_url, video_poster_url, video_duration_seconds")
        .eq("id", editId as string)
        .eq("seller_id", seller!.id)
        .maybeSingle();
      return (data as unknown as ExistingListing) ?? null;
    },
  });

  // Per-category questions (design 16a). Answers are keyed by field_key and reset
  // whenever the category changes, since a different category's field_keys carry
  // different meaning (or don't exist at all) — never submit an answer under a key
  // that belongs to a different category than the one being submitted.
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());
  const [recovery, setRecovery] = useState<{ labels: string[]; keys: string[] } | null>(null);
  const questionsRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const conditionQuestionsRef = useRef<HTMLDivElement | null>(null);
  const conditionFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Client-side mirror of the DB's enforce_listing_location trigger (only
  // fires at status='live', which this form never sets directly — a draft
  // or pending listing may still be incomplete). Checked here so a seller
  // is told upfront rather than only ever finding out from an admin
  // rejection or, on an eventual live-write path, the raw trigger error.
  const [locationInvalid, setLocationInvalid] = useState<{ state: boolean; area: boolean }>({ state: false, area: false });
  const locationRef = useRef<HTMLDivElement | null>(null);

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
    if (!isLoggedIn) { sendToMarketplaceLogin("/sell", "sell"); return; }
    if (!seller) navigate("/sell/setup", { replace: true });
  }, [loading, isLoggedIn, seller, navigate]);

  // No fallback: a guessed markup would show the seller a wrong "buyers see"
  // price, so the price card shows a loading placeholder instead below.
  const { data: markupPct } = useQuery({
    queryKey: ["mkt-markup"],
    queryFn: async () => {
      const { data } = await sdb.from("site_settings").select("value").eq("key", "marketplace_markup_percent").maybeSingle();
      const v = Number((data as { value: unknown } | null)?.value);
      return isFinite(v) ? v : null;
    },
    staleTime: 60000,
  });

  // The same limit enforce_listing_video_limits itself reads server side —
  // read live, never a second hardcoded "15" that could quietly drift from
  // the database's own number. Falls back to 15 only while this is still
  // loading (matches the trigger's own coalesce(v_max, 15) default), not a
  // separately-chosen number.
  const { data: videoMaxSeconds = 15 } = useQuery({
    queryKey: ["mkt-video-max-seconds"],
    queryFn: async () => {
      const { data } = await sdb.from("site_settings").select("value").eq("key", "marketplace_video_max_seconds").maybeSingle();
      const v = Number((data as { value: unknown } | null)?.value);
      return isFinite(v) && v > 0 ? v : 15;
    },
    staleTime: 60000,
  });

  // Same live-read pattern, for the storage bucket's own MB cap — used to
  // decide whether a picked file can skip the slow real-time re-encode
  // entirely (see shouldSkipVideoCompression), never a hardcoded "8".
  const { data: videoMaxMb = 8 } = useQuery({
    queryKey: ["mkt-video-max-mb"],
    queryFn: async () => {
      const { data } = await sdb.from("site_settings").select("value").eq("key", "marketplace_video_max_mb").maybeSingle();
      const v = Number((data as { value: unknown } | null)?.value);
      return isFinite(v) && v > 0 ? v : 8;
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

  // The six universal condition questions (already deployed, same shape as
  // category questions but not category-scoped, always relevant). Ordered by
  // sort_order, the same stable shape create-listing already uses elsewhere.
  const { data: conditionQuestions = [] } = useQuery({
    queryKey: ["mkt-condition-questions"],
    queryFn: async (): Promise<ConditionQuestion[]> => {
      const { data } = await sdb.from("marketplace_condition_questions")
        .select("id, question_key, label, options, is_required, help_text, sort_order, followup_required_for, followup_label, followup_placeholder")
        .order("sort_order");
      return (data ?? []) as unknown as ConditionQuestion[];
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

  // A SOLD listing has nothing left to resubmit, so this form still isn't
  // the right place for it — back to the dashboard, same as before. A LIVE
  // listing used to be redirected away here too, silently, with no
  // explanation of why or what to do instead; it now gets its own render
  // branch below (explain, offer to delist right there) rather than being
  // bounced before the seller can even read why.
  useEffect(() => {
    if (!isEditMode || !existingListing) return;
    if (existingListing.status === "sold") {
      navigate("/sell/dashboard", { replace: true });
    }
  }, [isEditMode, existingListing, navigate]);

  // Hydrate the form once from the existing listing, once states have
  // loaded (needed to resolve location_state's name back to a stateId for
  // the dependent selects). Guarded so a background refetch of either query
  // never overwrites what the seller has since typed.
  useEffect(() => {
    if (!isEditMode || hydratedRef.current) return;
    if (!existingListing || states.length === 0) return;
    if (existingListing.status === "live" || existingListing.status === "sold") return;
    hydratedRef.current = true;

    const conditionLabel = CONDITIONS.find((c) => CONDITION_VALUE[c] === existingListing.condition) || "";
    setTitle(existingListing.title || "");
    setCategoryId(existingListing.category_id || "");
    setStateId(states.find((s) => s.name === existingListing.location_state)?.id || "");
    setAreaName(existingListing.location_city || "");
    setCondition(conditionLabel);
    setConditionAnswers(existingListing.condition_answers || {});
    setDescription(existingListing.description || "");
    setPrice(existingListing.price_naira ? String(Math.round(existingListing.price_naira)) : "");
    setOriginalPrice(existingListing.original_price_naira ? String(Math.round(existingListing.original_price_naira)) : "");
    setIsNegotiable(!!existingListing.is_negotiable);
    setQuantity(Math.max(1, existingListing.quantity || 1));
    setIdenticalOk((existingListing.quantity || 1) > 1);
    setAnswers(existingListing.attributes || {});
    const existingPhotos: PhotoDraft[] = [existingListing.image_url, ...(existingListing.gallery_urls || [])]
      .filter((u): u is string => !!u)
      .map((url) => ({ blob: null, url }));
    setPhotos(existingPhotos);
    // Deliberately NOT gated on videoEnabled: this only sets in-memory form
    // state, never rendered while the field itself is hidden (below), so a
    // seller still never sees or is told about it. Gating this too would
    // mean submit()'s payload sends video_url: null for a listing that
    // already has one, silently deleting real data on an unrelated edit —
    // §91 is a rendering pause, not a data change, and nothing here should
    // touch the database on its own.
    if (existingListing.video_url) {
      setVideo({
        blob: null,
        posterBlob: null,
        url: existingListing.video_url,
        posterUrl: existingListing.video_poster_url || existingListing.video_url,
        durationSeconds: existingListing.video_duration_seconds || 0,
        mimeType: "video/webm",
      });
    }
  }, [isEditMode, existingListing, states]);

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

  // A generic reason, always, never the field's own help_text: that now
  // renders on its own right above this (see QuestionField), so reusing it
  // here would just repeat the same line twice when a field goes invalid.
  function fieldErrorText(f: CategoryField): string {
    return "This is required. Buyers cannot ask before buying.";
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

  function setConditionAnswer(key: string, value: string) {
    setConditionAnswers((a) => ({ ...a, [key]: value }));
    setConditionInvalidKeys((s) => { if (!s.has(key)) return s; const n = new Set(s); n.delete(key); return n; });
  }

  /** Every condition question with no option chosen yet, or with a required
   * follow-up (its answer is in followup_required_for) left blank. */
  function missingConditionAnswers(): ConditionQuestion[] {
    return conditionQuestions.filter((q) => {
      const v = conditionAnswers[q.question_key];
      if (!v) return q.is_required;
      if (q.followup_required_for.includes(v)) {
        return !conditionAnswers[`${q.question_key}_detail`]?.trim();
      }
      return false;
    });
  }

  /** How many of the six condition questions are genuinely done (an option
   * picked, and its follow-up filled in if that option needs one) — drives
   * the step count pill, progress bar, and the desktop summary rail. */
  const conditionAnsweredCount = conditionQuestions.filter((q) => {
    const v = conditionAnswers[q.question_key];
    if (!v) return false;
    if (q.followup_required_for.includes(v)) return !!conditionAnswers[`${q.question_key}_detail`]?.trim();
    return true;
  }).length;

  /** condition_answers payload: only questions actually answered, plus their
   * follow-up detail when one was given. The database derives condition_notes
   * from this itself once it is non-empty; this form never writes
   * condition_notes directly. */
  function buildConditionAnswers(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const q of conditionQuestions) {
      const v = conditionAnswers[q.question_key];
      if (!v) continue;
      out[q.question_key] = v;
      const detail = conditionAnswers[`${q.question_key}_detail`]?.trim();
      if (detail) out[`${q.question_key}_detail`] = detail;
    }
    return out;
  }

  const priceNum = Number(price);
  const preview = useMemo(() => (markupPct != null ? buyerPrice(priceNum, markupPct) : null), [priceNum, markupPct]);
  // Optional, what it cost new. The database trigger compares this against
  // final_price_naira (the buyer-facing price, markup included), not the
  // seller's raw asking price, so the client check mirrors that exactly
  // rather than comparing against price_naira, which would let through a
  // number the server then rejects.
  const originalPriceNum = Number(originalPrice);
  const originalPriceTooLow = originalPrice.trim() !== "" && isFinite(originalPriceNum) && preview != null && originalPriceNum <= preview;
  const filled = [photos.length >= MIN_PHOTOS, !!title.trim(), !!categoryId, !!condition, missingConditionAnswers().length === 0, !!description.trim(), priceNum > 0];
  const progress = Math.round((filled.filter(Boolean).length / filled.length) * 100);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const chosen = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    if (chosen.length === 0) return;
    setPhotoBusy(true); setPhotoError(null);
    try {
      // Process each photo now (square crop to fill + watermark + compress) so the
      // preview shows exactly what gets stored, and the same blob is uploaded. A
      // file that cannot be decoded as an image at all (a PDF renamed to .jpg, for
      // instance) is skipped with a clear message rather than added as a broken
      // tile or silently carried through to the upload step.
      const next: PhotoDraft[] = [];
      // Every failure now carries its OWN message, written for the actual
      // cause, rather than being flattened into one "did not look like a
      // photo" line that was wrong for most of them. Nothing here can fail
      // silently: each branch either adds a photo or sets an error.
      const problems: string[] = [];
      for (const file of chosen) {
        try {
          const blob = await processListingImage(file);
          next.push({ blob, url: URL.createObjectURL(blob) });
        } catch (e) {
          if (e instanceof UnsupportedImageError || e instanceof ImageTimeoutError || e instanceof ImageTooLargeError) {
            problems.push(e.message);
          } else {
            // Genuinely unexpected: still shown, still logged, never swallowed.
            logUploadFailure("compress", String((e as Error)?.message || e), file);
            problems.push(`"${file.name || "That photo"}" could not be added. Please try again, or choose a different photo.`);
          }
        }
      }
      setPhotos((p) => [...p, ...next]);
      if (problems.length) {
        // Deduplicated: three photos hitting the same cause should read as
        // one piece of advice, not the same sentence three times.
        setPhotoError(Array.from(new Set(problems)).join(" "));
      }
    } finally {
      setPhotoBusy(false);
    }
  }
  function removePhoto(i: number) {
    setPhotos((p) => {
      const target = p[i];
      // Only a newly added photo has an object URL to release — an existing
      // one carried over from the listing is a real remote URL, nothing to
      // revoke, and doing so would break its preview if re-added.
      if (target?.blob) URL.revokeObjectURL(target.url);
      return p.filter((_, idx) => idx !== i);
    });
  }

  async function addVideo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setVideoError(null);
    setVideoBusy(true);
    setVideoProgress(0);
    setVideoCompressing(false);
    try {
      // Cheap metadata read first, so a clip that's too long is rejected
      // upfront rather than after spending a slow compression pass on it.
      const meta = await readVideoMetadata(file);
      if (meta.duration > videoMaxSeconds + 1) {
        throw new VideoTooLongError(videoMaxSeconds, meta.duration);
      }
      // Most clips already fit under the bucket's cap and skip compression
      // entirely (processListingVideo decides this the same way) — only
      // show the "this takes a while" messaging when it's actually true.
      setVideoCompressing(!shouldSkipVideoCompression(file.size, videoMaxMb));
      const processed = await processListingVideo(file, videoMaxMb, setVideoProgress);
      setVideo((prev) => {
        if (prev?.blob) { URL.revokeObjectURL(prev.url); URL.revokeObjectURL(prev.posterUrl); }
        return {
          blob: processed.blob,
          posterBlob: processed.posterBlob,
          url: URL.createObjectURL(processed.blob),
          posterUrl: URL.createObjectURL(processed.posterBlob),
          durationSeconds: processed.durationSeconds,
          mimeType: processed.mimeType,
        };
      });
    } catch (e) {
      setVideoError(
        e instanceof VideoTooLongError || e instanceof VideoTooLargeError || e instanceof VideoTimeoutError
          ? e.message
          : describeVideoUploadError(e),
      );
    } finally {
      setVideoBusy(false);
      setVideoCompressing(false);
    }
  }

  function removeVideo() {
    setVideo((prev) => {
      // Same "only a newly-processed draft owns an object URL" rule as
      // removePhoto — an existing video carried over in edit mode is a real
      // remote URL, nothing to revoke.
      if (prev?.blob) { URL.revokeObjectURL(prev.url); URL.revokeObjectURL(prev.posterUrl); }
      return null;
    });
    setVideoError(null);
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

    // Required client side even though the database only blocks this at
    // status='live' (this form always writes 'pending_review') — a buyer
    // judging whether a purchase is even workable needs both, so asking
    // upfront beats letting it slip to admin review or, eventually, a
    // live-write path hitting the raw trigger instead.
    if (!stateId || !areaName.trim()) {
      setLocationInvalid({ state: !stateId, area: !!stateId && !areaName.trim() });
      setError(!stateId ? "Choose the state this item is in." : "Choose the area or city this item is in.");
      locationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setLocationInvalid({ state: false, area: false });

    if (!condition) { setError("Choose the condition."); return; }

    // The six condition questions, same "cannot ask questions later" reasoning
    // as everything else here. Not database-enforced (only the category
    // questions are, via enforce_required_category_fields), this check exists
    // for a good experience and to make sure condition_answers is never sent
    // half-empty, since a genuinely honest listing answers all six.
    const missingCondition = missingConditionAnswers();
    if (missingCondition.length > 0) {
      setConditionInvalidKeys(new Set(missingCondition.map((q) => q.question_key)));
      setError(missingCondition.length === 1
        ? `${missingCondition[0].label} still needs an answer. Buyers cannot ask before buying.`
        : `A few more condition answers are needed: ${missingCondition.map((q) => q.label).join(", ")}.`);
      conditionQuestionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

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
    if (originalPriceTooLow) { setError("The original price should be higher than what you are selling it for, otherwise there is no saving to show."); return; }
    if (quantity > 1 && !identicalOk) { setError(`Please confirm all ${quantity} items are identical, or set the quantity back to 1.`); return; }
    const conditionDetailTexts = conditionQuestions.map((q) => conditionAnswers[`${q.question_key}_detail`]);
    if (hasContactLeak(description, ...conditionDetailTexts)) { setContactBlocked(true); return; }

    // The handover answer is already saved and confirmed by this point:
    // askDelivery gates the whole form below, so submit() is unreachable
    // until saveLocalHandover() has succeeded and refresh() has flipped
    // delivery_prefs_set_at. That ordering is required — a database trigger
    // rejects a listing insert from a seller whose delivery_prefs_set_at is
    // still null, so the preference must land first, every time.
    setBusy(true);

    // Upload only the newly added photos (blob present); an existing photo
    // carried over from the listing being edited already has a real URL,
    // nothing to upload again. Order is preserved either way, so the first
    // photo stays image_url / cover exactly as arranged on screen.
    const urls: string[] = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        const draft = photos[i];
        if (!draft.blob) { urls.push(draft.url); continue; }
        const path = `${user.id}/${Date.now()}-${i}.jpg`;
        // Bounded, so a stalled connection surfaces as a message rather
        // than a submit button that never comes back.
        const { error: upErr } = await withTimeout(
          sdb.storage.from(LISTING_BUCKET).upload(path, draft.blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" }),
          IMAGE_UPLOAD_TIMEOUT_MS,
          "The upload is taking too long. Please check your connection and try again.",
          ImageTimeoutError,
        );
        if (upErr) {
          logUploadFailure("storage_upload", String(upErr.message || upErr), { size: draft.blob.size, type: "image/jpeg" });
          throw upErr;
        }
        const { data: pub } = sdb.storage.from(LISTING_BUCKET).getPublicUrl(path);
        urls.push(pub.publicUrl);
      }
    } catch (e) {
      setBusy(false);
      if (e instanceof ImageTimeoutError) {
        logUploadFailure("storage_upload_timeout", `upload exceeded ${IMAGE_UPLOAD_TIMEOUT_MS}ms`, null);
        setError(e.message);
      } else {
        setError(describeUploadError(e));
      }
      return;
    }

    // The video, optional, up to one. blob/posterBlob present means a fresh
    // draft needing upload (same shape as photos above); null means it was
    // carried over from the listing being edited and already lives in
    // storage, nothing to re-upload.
    let videoUrl: string | null = null;
    let videoPosterUrl: string | null = null;
    let videoDurationSeconds: number | null = null;
    if (video) {
      try {
        if (video.blob && video.posterBlob) {
          const ext = video.mimeType.includes("webm") ? "webm" : video.mimeType.includes("quicktime") ? "mov" : "mp4";
          const videoPath = `${user.id}/${Date.now()}-video.${ext}`;
          // video.mimeType is already bare (no codec parameters, see sellData's
          // bareMime) so it matches marketplace-videos' allowed_mime_types exactly.
          const { error: vErr } = await withTimeout(
            sdb.storage.from(LISTING_VIDEO_BUCKET).upload(videoPath, video.blob, { cacheControl: "3600", upsert: false, contentType: video.mimeType }),
            VIDEO_UPLOAD_TIMEOUT_MS,
            "The video upload is taking too long. Please check your connection and try again.",
          );
          if (vErr) throw vErr;
          const { data: vPub } = sdb.storage.from(LISTING_VIDEO_BUCKET).getPublicUrl(videoPath);
          videoUrl = vPub.publicUrl;

          // The poster is a JPEG — marketplace-videos only accepts
          // video/mp4, video/webm and video/quicktime, so an image upload
          // there is rejected outright. It belongs with the other listing
          // images: LISTING_BUCKET (marketplace-listings) already accepts
          // image/jpeg with a 5MB cap, comfortably more than a poster needs.
          const posterPath = `${user.id}/${Date.now()}-video-poster.jpg`;
          const { error: pErr } = await withTimeout(
            sdb.storage.from(LISTING_BUCKET).upload(posterPath, video.posterBlob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" }),
            VIDEO_UPLOAD_TIMEOUT_MS,
            "The video's poster image is taking too long to upload. Please check your connection and try again.",
          );
          if (pErr) throw pErr;
          const { data: pPub } = sdb.storage.from(LISTING_BUCKET).getPublicUrl(posterPath);
          videoPosterUrl = pPub.publicUrl;
          videoDurationSeconds = video.durationSeconds;
        } else {
          videoUrl = video.url;
          videoPosterUrl = video.posterUrl;
          videoDurationSeconds = video.durationSeconds;
        }
      } catch (e) {
        setBusy(false);
        setError(e instanceof VideoTimeoutError ? e.message : describeVideoUploadError(e));
        return;
      }
    }

    try {
      const stateName = states.find((s) => s.id === stateId)?.name ?? null;
      const payload = {
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        // condition_notes is NOT sent, the database derives it from
        // condition_answers itself (sync_condition_notes_from_answers).
        condition_answers: buildConditionAnswers(),
        condition: CONDITION_VALUE[condition] ?? null,
        price_naira: Math.round(priceNum),
        original_price_naira: originalPrice.trim() !== "" && originalPriceNum > 0 ? Math.round(originalPriceNum) : null,
        is_negotiable: isNegotiable,
        quantity: Math.max(1, Math.round(quantity)),
        location_state: stateName,
        location_city: areaName || null,
        attributes: buildAttributes(),
        image_url: urls[0],
        gallery_urls: urls.slice(1),
        video_url: videoUrl,
        video_poster_url: videoPosterUrl,
        video_duration_seconds: videoDurationSeconds,
        status: "pending_review",
      };
      // Resubmitting a rejected/delisted/pending listing is a direct UPDATE
      // (no RPC — the seller UPDATE policy + guard_seller_listing_edits own
      // this), never an insert; seller_id/quantity_sold/reviewed_by are
      // never touched, and status is always exactly 'pending_review', never
      // 'live' — only BundledMum can do that.
      const { error: writeErr } = isEditMode
        ? await sdb.from("marketplace_listings").update(payload).eq("id", editId as string)
        : await sdb.from("marketplace_listings").insert({ ...payload, seller_id: seller.id });
      if (writeErr) throw writeErr;
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
      // enforce_listing_location only fires at status='live', which this
      // form never writes directly — should not be reachable given the
      // check above, but this form must never be the only guard (the same
      // reasoning as every other trigger handled here). Shown exactly as
      // written rather than mapped to a generic message: it already says
      // precisely what to do.
      if (msg === "Choose the state this item is in before it can go live" || msg === "Choose the area or city this item is in before it can go live") {
        setLocationInvalid({ state: msg.startsWith("Choose the state"), area: msg.startsWith("Choose the area") });
        setError(msg);
        locationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      // enforce_listing_video_limits, same "should not be reachable given
      // the upfront readVideoMetadata check, but never the only guard"
      // reasoning — shown exactly as written, it already says what to do.
      // Covers all three of the trigger's own messages: too long, a
      // duration that never made it into video_duration_seconds, and one
      // that read as zero or negative.
      if (
        /^Videos must be \d+ seconds or shorter$/.test(msg)
        || msg === "We could not read how long that video is, please try recording it again"
        || msg === "That video appears to be empty, please try recording it again"
      ) {
        setVideoError(msg);
        return;
      }
      // A known listing-edit rejection (should not normally be reachable,
      // this form only opens for rejected/delisted/pending listings, but
      // handled defensively regardless) — never raw, anything else unknown
      // falls through to the generic message with the real detail logged.
      const known = parseListingEditError(msg);
      setError(known || genericErrorMessage(isEditMode ? "edit listing" : "create listing", e));
    }
  }

  if (loading || (isEditMode && existingLoading)) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  // A LIVE listing lands here explained, not bounced: photos, category,
  // title, description, anything about the item is locked while it's live
  // (only the price screen can touch it, and only the price), and this is
  // where a seller would otherwise conclude that's simply impossible. The
  // same delist-then-edit action as the dashboard and price screen, right
  // here — confirming just refetches this exact query, which flips
  // existingListing.status to "delisted" and falls straight through into
  // the real, fully editable form below on the very next render, no
  // navigate needed.
  if (isEditMode && !existingLoading && existingListing && existingListing.status === "live") {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Listing is live" />
        <div className="mkt-empty-title">This listing is live</div>
        <div className="mkt-empty-sub">
          Photos, category, title, description and everything else about it are locked while it's live, that's what stops an approved listing quietly turning into something else.
          Only the price can change without a new check.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 280 }}>
          <button className="mkt-secondary" onClick={() => navigate(`/sell/listings/${existingListing.id}/price`)}>Lower the price instead</button>
          <button className="mkt-secondary" style={{ borderColor: "var(--mkt-error)", color: "var(--mkt-error)" }} onClick={() => setLiveDelistOpen(true)}>Make changes</button>
          <button className="mkt-primary" style={{ background: "transparent", color: "var(--mkt-muted)" }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
        </div>
        {liveDelistOpen && (
          <DelistToEditSheet
            listing={existingListing}
            onCancel={() => setLiveDelistOpen(false)}
            onDelisted={() => { setLiveDelistOpen(false); queryClient.invalidateQueries({ queryKey: ["mkt-edit-listing", editId] }); }}
          />
        )}
      </div>
    );
  }

  // Edit mode: not found, not this seller's, sold (nothing left to
  // resubmit), or already redirected away — the redirect effect above will
  // navigate for sold, this is just the frame shown for the instant before
  // that happens, and the genuine not-found case (bad id, or listing
  // belongs to someone else).
  if (isEditMode && !existingLoading && (!existingListing || existingListing.status === "sold")) {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Listing not found" />
        <div className="mkt-empty-title">Listing not found</div>
        <div className="mkt-empty-sub">It may not exist, or cannot be edited from here.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  // S3c awaiting review / resubmitted (design 21a E6)
  if (done) {
    return (
      <div className="mkt-success">
        <MarketplaceTitle title={isEditMode ? "Sent back for review" : "Sent for review"} />
        <div className="inner">
          <div className="check">✓</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h1>{isEditMode ? "Sent back for review" : "Well done, it is with our team"}</h1>
            <p>{isEditMode
              ? "Your changes are with our team now, usually reviewed within a few hours. It is not live yet, we will let you know either way."
              : "Your item is not live yet. Someone from BundledMum is checking the photos and details, usually within a few hours. We will let you know the moment it is approved."}</p>
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
          {!isEditMode && (
            <MarketplaceInstallCta
              title="Never miss when it sells"
              body="Install the app and we will let you know the moment someone buys this or asks you a question."
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <button className="mkt-primary" onClick={() => window.location.reload()}>List another item</button>
            <button className="mkt-outline-light" onClick={() => navigate("/sell/dashboard")}>Go to my dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  // ENTRY POINT 2 (design 43a, S9-S11). A first-time seller answers BOTH
  // delivery questions before the form itself exists on screen — that is
  // what makes them genuinely unskippable, rather than fields they could
  // scroll past. Both are needed: seller_needs_delivery_prefs() and
  // listing_delivery_terms.is_set each require sells_nationwide AND
  // local_handover, so answering one leaves the seller still flagged and
  // every listing still blank to buyers. Saved and confirmed here, so by
  // the time the form can be submitted, delivery_prefs_set_at is set and
  // the listing insert cannot be rejected by the trigger requiring it.
  if (askDelivery) {
    async function saveBothPrefs() {
      if (handoverNationwide === null || localHandover === null || !seller) return;
      setHandoverBusy(true); setHandoverError(null);
      // One write, both answers. seller_set_delivery_prefs stamps
      // delivery_prefs_set_at itself.
      const res = await saveSellerDeliveryPrefs({ sellsNationwide: handoverNationwide, localHandover });
      setHandoverBusy(false);
      if (!res.ok) {
        setHandoverError(res.message ?? "We could not save that just now. Please try again.");
        return;
      }
      // Drops askDelivery and reveals the form. Nothing is inserted until
      // after this has succeeded.
      await refresh();
    }
    return (
      <>
        <MarketplaceTitle title="List an item" />
        <div className="mkt-sell-head">
          <div className="inner">
            <div className="row">
              <button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button>
              <h1 style={{ flex: 1 }}>List an item</h1>
            </div>
            <div className="mkt-prog"><i style={{ width: handoverStep === 1 ? "5%" : "10%" }} /></div>
            <p className="sub">First, two quick questions about how buyers get your items.</p>
          </div>
        </div>
        <div className="mkt-sell-body mkt-handover-step">
          <div className="mkt-handover-step-head">
            <div className="h">
              {handoverStep === 1
                ? "Would you sell only in your own state, or anywhere in Nigeria?"
                : "For buyers in your state, how do they get it?"}
            </div>
            <div className="p">
              {handoverStep === 1
                ? "Buyers further away need to know before they pay whether you would send to them."
                : "This only covers same-state buyers, anyone further away always gets it shipped."}
            </div>
            <div className="mkt-handover-steps" aria-label={`Step ${handoverStep} of 2`}>
              <span className="on" />
              <span className={handoverStep === 2 ? "on" : ""} />
            </div>
          </div>

          {handoverStep === 1 ? (
            /* Choosing advances on its own, same as the modal — two taps
               total, and a Continue per step would double that for no gain. */
            <div className="mkt-handover-opts grid">
              <button
                type="button"
                className={handoverNationwide === false ? "mkt-handover-opt on" : "mkt-handover-opt"}
                onClick={() => { setHandoverNationwide(false); setHandoverStep(2); }}
                aria-pressed={handoverNationwide === false}
              >
                {handoverNationwide === false && <span className="tick" aria-hidden>✓</span>}
                <span className="body">
                  <span className="lbl">Only in my state</span>
                  <span className="hint">You sell to buyers near you.</span>
                </span>
              </button>
              <button
                type="button"
                className={handoverNationwide === true ? "mkt-handover-opt on" : "mkt-handover-opt"}
                onClick={() => { setHandoverNationwide(true); setHandoverStep(2); }}
                aria-pressed={handoverNationwide === true}
              >
                {handoverNationwide === true && <span className="tick" aria-hidden>✓</span>}
                <span className="body">
                  <span className="lbl">Anywhere in Nigeria</span>
                  <span className="hint">You send to buyers in any state.</span>
                </span>
              </button>
            </div>
          ) : (
            <>
              <DeliveryHandoverChoice value={localHandover} onChange={setLocalHandover} disabled={handoverBusy} layout="grid" />
              <button type="button" className="mkt-handover-back" onClick={() => setHandoverStep(1)} disabled={handoverBusy}>
                ‹ Back
              </button>
            </>
          )}

          {handoverError && (
            <div className="mkt-errbox"><span className="m">!</span><span>{handoverError}</span></div>
          )}
        </div>
        {handoverStep === 2 && (
          <div className="mkt-sell-foot">
            <button className="mkt-primary" onClick={saveBothPrefs} disabled={handoverNationwide === null || localHandover === null || handoverBusy}>
              {handoverBusy ? "Saving..." : "Continue"}
            </button>
          </div>
        )}
      </>
    );
  }

  // Three distinct labels per status (design 21a E1), so the scope of the
  // edit is obvious before the form even loads.
  const pageTitle = !isEditMode ? "List an item"
    : existingListing?.status === "rejected" ? "Fix and resend"
    : "Edit listing";

  return (
    <>
      <MarketplaceTitle title={pageTitle} />
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row">
            <button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button>
            <h1 style={{ flex: 1 }}>{pageTitle}</h1>
          </div>
          <div className="mkt-prog"><i style={{ width: `${progress}%` }} /></div>
          <p className="sub">{isEditMode ? "Changes go back through review before this listing can be live again." : "Buyers cannot ask questions, so tell them everything here."}</p>
        </div>
      </div>

      <div className="mkt-sell-body">
        {/* Rejection reason leads (design 21a E5), the seller is here
            specifically to fix what this says. */}
        {isEditMode && existingListing?.status === "rejected" && existingListing.rejection_reason && (
          <div className="mkt-rejectbanner">
            <div className="head"><span className="ic">i</span><span>What our team said</span></div>
            <p>{existingListing.rejection_reason}</p>
          </div>
        )}

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
          {photoError ? (
            <div className="mkt-errbox"><span className="m">!</span><span>{photoError}</span></div>
          ) : (
            <div className="mkt-help">At least four, take them yourself with the camera or pick from your gallery. Aim for the front, the back, a close up of any flaw, and the item in use or its full view. The first is the main photo buyers see.</div>
          )}

          {/* Placed right where the mistake actually happens, mid photo
              selection, not a banner at the top a seller scrolls past
              before deciding what they're even listing. Distinct coral
              styling from the honesty box further down (green) on purpose,
              so the two read as different moments, not one repeated block
              of advice. Framed as guidance, never a warning: a genuine
              bundle is explicitly still fine, only listing several
              unrelated things as one is the mistake this catches. */}
          <div className="mkt-onelisting">
            <span className="ic">🛍️</span>
            <p><b>One item, one listing.</b> If these photos are actually a few different things, each needs its own listing and its own price. Selling several together on purpose, like a set of six babygrows for one price? That's a bundle, and it's completely fine, just say so below.</p>
          </div>
        </div>

        {/* The video that goes on the listing, hosted by YouTube. Editing
            only, since staging needs a listing id. */}
        {isEditMode && (
          <div className="mkt-field mkt-video-field">
            <div className="mkt-field-head">
              <span className="lbl">Add a video <span className="mkt-video-optional">optional</span></span>
            </div>
            <p className="mkt-help">A few seconds of it folding, rolling or switching on answers the question buyers ask most, whether it actually works, before they even have to message.</p>

            {existingListingVideo ? (
              <div className="mkt-video-preparing"><span>✓</span><span>Your video is on this listing.</span></div>
            ) : ytStaged ? (
              <div className="mkt-video-preparing">
                <span className="sp" aria-hidden />
                <span>We are getting your video ready. It shows on your listing shortly, and buyers see nothing until it is.</span>
              </div>
            ) : ytBusy ? (
              <div className="mkt-video-preparing">
                <span className="sp" aria-hidden />
                <span>Sending your video... {ytProgress}%</span>
              </div>
            ) : (
              <>
                {/* Told, not asked. At the upload itself, not in terms
                    elsewhere, and read live from site_settings. */}
                {listingVideoNotice && (
                  <p className="mkt-help" style={{ color: "#6B5B54" }}>{listingVideoNotice}</p>
                )}
                <button type="button" className="mkt-video-add" onClick={() => ytFileRef.current?.click()}>
                  <span className="ic">▶</span>
                  <span className="t">Record or upload a video</span>
                  <span className="s">Up to {LISTING_VIDEO_MAX_MB}MB. Send it as it is, we do the rest.</span>
                </button>
              </>
            )}
            {ytError && <div className="mkt-errbox"><span className="m">!</span><span>{ytError}</span></div>}
            <input ref={ytFileRef} type="file" accept="video/*" hidden
              onChange={(e) => { void addListingVideo(e.target.files); e.target.value = ""; }} />
          </div>
        )}

        {/* One optional video, design 37a, sits right after photos in the
            seller form too. Genuinely optional: never counted in `filled`
            (the progress bar above), never blocks submit, no validation
            beyond the duration check inside addVideo itself.
            Paused as of §91 (marketplace_video_enabled) — while off, this
            entire block renders nothing at all, not even a disabled
            control or a hint that video exists. */}
        {videoEnabled && (
          <div className="mkt-field mkt-video-field">
            <div className="mkt-field-head">
              <span className="lbl">Add a video <span className="mkt-video-optional">optional</span></span>
            </div>
            <p className="mkt-help">{videoMaxSeconds} seconds of it folding, rolling or switching on answers the question buyers ask most, whether it actually works, before they even have to message.</p>

            {videoBusy ? (
              videoCompressing ? (
                <div className="mkt-video-processing">
                  <div className="frame">
                    <div className="spinner" />
                    <span className="label">Compressing your video…</span>
                  </div>
                  <div className="bar-row">
                    <div className="bar"><i style={{ width: `${videoProgress}%` }} /></div>
                    <span>{videoProgress}%</span>
                  </div>
                  <p className="mkt-help">This one's a bit large, so it takes about as long as the video itself to compress, please hang on. You can carry on filling in the rest of the form while it finishes.</p>
                </div>
              ) : (
                <div className="mkt-video-processing">
                  <div className="frame">
                    <div className="spinner" />
                    <span className="label">Adding your video…</span>
                  </div>
                </div>
              )
            ) : video ? (
              <div className="mkt-video-preview">
                <div className="frame">
                  <img src={video.posterUrl} alt="" />
                  <span className="dur">{Math.round(video.durationSeconds)}s</span>
                </div>
                <button type="button" className="mkt-secondary" onClick={removeVideo}>Remove video</button>
              </div>
            ) : (
              <button type="button" className="mkt-video-add" onClick={() => videoFileRef.current?.click()}>
                <span className="ic">▶</span>
                <span className="t">Record or upload a video</span>
                <span className="s">Up to {videoMaxSeconds} seconds. Large ones get compressed automatically.</span>
              </button>
            )}
            <input ref={videoFileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden onChange={(e) => { addVideo(e.target.files); e.target.value = ""; }} />
            {videoError && <div className="mkt-errbox"><span className="m">!</span><span>{videoError}</span></div>}
            <p className="mkt-help mkt-video-footnote">One video, up to {videoMaxSeconds} seconds. Most upload instantly, we only compress the large ones. Photos are still required either way, this is extra, not a substitute.</p>
          </div>
        )}

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

        <div ref={locationRef} style={{ display: "contents" }}>
          <div className="mkt-field">
            <span className="mkt-uplabel">State</span>
            <select
              className={locationInvalid.state ? "mkt-native-select error" : "mkt-native-select"}
              value={stateId}
              onChange={(e) => { setStateId(e.target.value); setAreaName(""); setLocationInvalid({ state: false, area: false }); }}
            >
              <option value="">Choose state</option>
              {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {locationInvalid.state && <span className="mkt-field-error">Buyers need to know roughly where the item is, so they can judge whether the purchase is even workable.</span>}
          </div>
          <div className="mkt-field">
            <span className="mkt-uplabel">Area</span>
            <AreaCombobox
              key={stateId}
              areas={areas}
              value={areaName}
              onChange={(name) => { setAreaName(name); if (name.trim()) setLocationInvalid((v) => ({ ...v, area: false })); }}
              disabled={!stateId}
              error={locationInvalid.area}
            />
            {locationInvalid.area && <span className="mkt-field-error">This is what tells a nearby buyer the item is actually reachable.</span>}
          </div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">Condition and description</span>
          <div className="mkt-chips">
            {CONDITIONS.map((c) => (
              <button type="button" key={c} className={condition === c ? "mkt-chip on" : "mkt-chip"} onClick={() => setCondition(c)}>{c}</button>
            ))}
          </div>

          {/* Honesty guidance, at the point disclosure actually happens, not a
              banner at the top of the form and not in onboarding. Makes the
              consequence concrete rather than a generic "be honest" line: a
              buyer cannot ask before buying, so an undisclosed flaw becomes a
              dispute, and a seller found at fault is refunded-against, unpaid
              on that order, and struck. Framed as advice on the seller's
              side, not a warning notice. */}
          <div className="mkt-honesty">
            <span className="ic">💡</span>
            <div>
              <p>Buyers cannot ask questions before they buy, so anything left out here, they only find out once the parcel is open.</p>
              <p>Mention every mark, stain, fade or fault, secondhand buyers expect wear, not surprises. If the item does not match your description, you could lose the sale, the payout, and get a strike, three strikes and you can no longer sell here. Be upfront and you will still sell it.</p>
            </div>
          </div>

          <div ref={conditionQuestionsRef} className="mkt-condition-block">
            <div className="mkt-condition-head">
              <div className="mkt-condition-head-top">
                <h3>Tell us the condition</h3>
                <span className="mkt-condition-count">{conditionAnsweredCount} of {conditionQuestions.length}</span>
              </div>
              <div className="mkt-condition-bar"><i style={{ width: `${conditionQuestions.length ? (conditionAnsweredCount / conditionQuestions.length) * 100 : 0}%` }} /></div>
            </div>

            <div className="mkt-condition-grid">
              {[conditionQuestions.slice(0, 3), conditionQuestions.slice(3)].map((half, i) => (
                <div className="mkt-condition-col" key={i}>
                  {half.map((q) => (
                    <ConditionQuestionField
                      key={q.id}
                      question={q}
                      value={conditionAnswers[q.question_key]}
                      detail={conditionAnswers[`${q.question_key}_detail`]}
                      invalid={conditionInvalidKeys.has(q.question_key)}
                      onChange={(v) => setConditionAnswer(q.question_key, v)}
                      onDetailChange={(v) => setConditionAnswer(`${q.question_key}_detail`, v)}
                      setRef={(el) => { conditionFieldRefs.current[q.question_key] = el; }}
                    />
                  ))}
                </div>
              ))}

              {/* Desktop only (CSS-hidden on mobile): a live-updating recap of
                  every answer so far, so the eye has somewhere to land instead
                  of a bare progress bar. Same data the form already holds. */}
              <aside className="mkt-condition-summary">
                <div className="lbl">So far</div>
                <div className="mkt-condition-summary-list">
                  {conditionQuestions.map((q) => {
                    const v = conditionAnswers[q.question_key];
                    const detail = conditionAnswers[`${q.question_key}_detail`]?.trim();
                    return (
                      <div className="mkt-condition-summary-row" key={q.id}>
                        <span className={v ? "dot on" : "dot"}>{v ? "✓" : ""}</span>
                        <div>
                          <div className={v ? "a" : "a muted"}>{v || q.label}</div>
                          {detail && <div className="d">{detail}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="rule" />
                <p className="note">This becomes the condition text buyers read on the listing. Answer honestly, they can't ask you anything before they pay.</p>
              </aside>
            </div>
          </div>
          <div className="mkt-help">Do not add a phone number or way to contact you.</div>
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
              <div className="see">{preview == null ? "…" : preview > 0 ? formatNaira(preview) : "₦0"}</div>
            </div>
          </div>
          <div className="note">You keep {formatNaira(priceNum > 0 ? Math.round(priceNum) : 0)} per item. BundledMum adds {markupPct != null ? `a ${markupPct}% markup` : "its markup"} on top, shown to the buyer, and buyers pay a service fee at checkout.</div>
        </div>

        <div className="mkt-field">
          <div className="mkt-field-head">
            <span className="lbl">What did it cost new?</span>
            <span className="mkt-help">Optional</span>
          </div>
          <input
            className={originalPriceTooLow ? "mkt-input error" : "mkt-input"}
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="e.g. 65,000"
            inputMode="numeric"
          />
          {originalPriceTooLow ? (
            <div className="mkt-errbox"><span className="m">!</span><span>The original price should be higher than what you are selling it for, otherwise there is no saving to show.</span></div>
          ) : (
            <div className="mkt-help">Buyers see exactly how much they are saving, which helps it sell. Leave it blank if you would rather not say.</div>
          )}
        </div>

        <div className="mkt-field">
          <div className="mkt-field-head">
            <span className="lbl">Is this price negotiable?</span>
            <span className="mkt-help">Optional</span>
          </div>
          <div className="mkt-chips">
            <button type="button" className={!isNegotiable ? "mkt-chip on" : "mkt-chip"} onClick={() => setIsNegotiable(false)}>No, firm price</button>
            <button type="button" className={isNegotiable ? "mkt-chip on" : "mkt-chip"} onClick={() => setIsNegotiable(true)}>Yes, buyers can ask for less</button>
          </div>
          <div className="mkt-help">If yes, buyers can ask for a bit off. You always see and choose your own number, never a pressure to accept.</div>
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
        <button className="mkt-primary" onClick={submit} disabled={busy || photoBusy}>{busy ? "Sending for review..." : isEditMode ? "Resend for review" : "Send for review"}</button>
        <div className={contactBlocked ? "helper err" : "helper"}>{contactBlocked ? "Contact details must come out first" : isEditMode ? "Goes back to our review queue, not straight live" : "Our team checks every listing before it goes live"}</div>
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

      {field.help_text && field.field_type !== "select" && <div className="mkt-help">{field.help_text}</div>}
      {invalid && (
        <div className="mkt-help" style={{ color: "var(--mkt-error)", display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
          <span style={{ fontWeight: 800 }}>!</span>{errorText}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A single condition question: an option pick, plus a follow-up text box that
// appears (and becomes required) only when the picked option is one of the
// question's followup_required_for values.
// ─────────────────────────────────────────────────────────────────────────────

function ConditionQuestionField({ question, value, detail, invalid, onChange, onDetailChange, setRef }: {
  question: ConditionQuestion;
  value: string | undefined;
  detail: string | undefined;
  invalid: boolean;
  onChange: (v: string) => void;
  onDetailChange: (v: string) => void;
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const needsDetail = !!value && question.followup_required_for.includes(value);
  const detailMissing = invalid && needsDetail && !detail?.trim();
  const answered = !!value && !detailMissing;
  return (
    <div ref={setRef} className={invalid ? "mkt-condition-q invalid" : "mkt-condition-q"}>
      <div className="mkt-condition-q-label">
        <span className={answered ? "mkt-condition-check on" : "mkt-condition-check"}>{answered ? "✓" : ""}</span>
        <span className="q">{question.label}</span>
      </div>
      {question.help_text && <span className="mkt-condition-hint">{question.help_text}</span>}
      <div className="mkt-condition-chips">
        {question.options.map((o) => (
          <button key={o} type="button" className={value === o ? "mkt-chip on" : "mkt-chip"} onClick={() => onChange(o)}>{o}</button>
        ))}
      </div>
      {needsDetail && (
        <div className="mkt-condition-followup">
          <div className="mkt-condition-followup-body">
            <span className="mkt-condition-followup-label">{question.followup_label || "Tell us more"}<span className="req"> *</span></span>
            <input
              className={detailMissing ? "mkt-input error" : "mkt-input"}
              value={detail || ""}
              onChange={(e) => onDetailChange(e.target.value)}
              placeholder={question.followup_placeholder || `Add ${(question.followup_label || "detail").toLowerCase()}`}
            />
            <span className="mkt-help">A few words is enough, we turn it into a sentence for you.</span>
          </div>
        </div>
      )}
      {invalid && (
        <div className="mkt-help" style={{ color: "var(--mkt-error)", display: "flex", alignItems: "center", gap: 5, paddingLeft: 26 }}>
          <span style={{ fontWeight: 800 }}>!</span>
          {detailMissing ? (question.followup_label || "This detail is needed.") : "This is required. Buyers cannot ask before buying."}
        </div>
      )}
    </div>
  );
}
