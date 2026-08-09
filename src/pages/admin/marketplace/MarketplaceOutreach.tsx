import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import {
  fetchOutreachQueue, previewWhatsAppMessage,
  SELLER_OUTREACH_STAGES, BUYER_OUTREACH_STAGES,
  type OutreachRow,
} from "./opsData";
import { OpsHeader, OpsEmpty } from "./opsUi";

type Side = "seller" | "buyer";

interface GroupedPerson {
  personType: Side;
  personId: string;
  personName: string;
  primary: OutreachRow;
  extra: OutreachRow[];
}

/** Groups raw one-row-per-reason rows into one row per PERSON, primary =
 * lowest urgency (most pressing) reason, everything else kept as "also
 * matches" context — the same treatment the source design settled on for a
 * person who matches more than one outreach type, rather than showing them
 * once per type. Sorted urgency ascending, then name for a stable secondary
 * order (the design doesn't specify one beyond urgency). */
function groupByPerson(rows: OutreachRow[]): GroupedPerson[] {
  const byPerson = new Map<string, OutreachRow[]>();
  for (const r of rows) {
    const key = `${r.person_type}:${r.person_id}`;
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key)!.push(r);
  }
  return Array.from(byPerson.values())
    .map((matches): GroupedPerson => {
      const sorted = [...matches].sort((a, b) => a.urgency - b.urgency);
      const primary = sorted[0];
      return {
        personType: primary.person_type,
        personId: primary.person_id,
        personName: primary.person_name || (primary.person_type === "seller" ? "Seller" : "Buyer"),
        primary,
        extra: sorted.slice(1),
      };
    })
    .sort((a, b) => a.primary.urgency - b.primary.urgency || a.personName.localeCompare(b.personName));
}

/**
 * Admin follow-up outreach queue, one place to see and message everyone the
 * system has flagged as needing a nudge, across both sides. Built on the
 * exact same source the per-seller "Suggested outreach" panel already uses
 * (get_seller_nudge_suggestions / get_buyer_nudge_suggestions, via the new
 * get_outreach_queue wrapper) — this is that same system seen queue-wide,
 * not a separate feature with its own idea of what "needs outreach" means.
 * whatsapp_link is always opened verbatim, never rebuilt client side.
 */
export default function MarketplaceOutreach() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["mkt-outreach-queue"],
    staleTime: 15000,
    queryFn: fetchOutreachQueue,
  });

  const [side, setSide] = useState<Side>("seller");
  const [filter, setFilter] = useState<string>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const sellerRows = useMemo(() => (rows ?? []).filter((r) => r.person_type === "seller"), [rows]);
  const buyerRows = useMemo(() => (rows ?? []).filter((r) => r.person_type === "buyer"), [rows]);
  const sideRows = side === "seller" ? sellerRows : buyerRows;
  const stages = side === "seller" ? SELLER_OUTREACH_STAGES : BUYER_OUTREACH_STAGES;

  const countsByStage = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of sideRows) c[r.stage_key] = (c[r.stage_key] || 0) + 1;
    return c;
  }, [sideRows]);

  const filteredRows = filter === "all" ? sideRows : sideRows.filter((r) => r.stage_key === filter);
  const people = useMemo(() => groupByPerson(filteredRows), [filteredRows]);
  const selected = people.find((p) => `${p.personType}:${p.personId}` === selectedKey) || null;

  const totalCount = (rows ?? []).length;

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  // Genuinely nobody anywhere needs a message — the full all-clear, no
  // toggle or chips, matching the design's own F3 (it drops that chrome too
  // since there's nothing left to filter or switch between).
  if (totalCount === 0) {
    return (
      <div>
        <OpsHeader title="Follow up" />
        <div className="mt-10 flex flex-col items-center gap-3 text-center py-16">
          <div className="w-14 h-14 rounded-full flex items-center justify-center font-heading font-bold text-2xl" style={{ background: "#D8EFE5", color: "#1A4A33" }}>✓</div>
          <div className="font-heading font-black text-xl text-foreground">Nobody needs a message right now</div>
          <p className="text-sm text-text-med max-w-sm">Every seller and buyer is either moving along fine or already contacted. Check back later, this list refreshes as things change.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <OpsHeader
        title="Follow up"
        subtitle={`${totalCount} to contact.`}
        right={
          <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: "rgba(26,26,26,0.06)" }}>
            <button onClick={() => { setSide("seller"); setFilter("all"); setSelectedKey(null); }}
              className="font-heading font-extrabold text-xs px-3.5 py-2 rounded-md"
              style={side === "seller" ? { background: "#1A4A33", color: "#FFF8F4" } : { color: "#6B5B54" }}>
              Sellers · {sellerRows.length}
            </button>
            <button onClick={() => { setSide("buyer"); setFilter("all"); setSelectedKey(null); }}
              className="font-heading font-extrabold text-xs px-3.5 py-2 rounded-md"
              style={side === "buyer" ? { background: "#1A4A33", color: "#FFF8F4" } : { color: "#6B5B54" }}>
              Buyers · {buyerRows.length}
            </button>
          </div>
        }
      />

      {/* Filter chips, both sides. The source design only put these on the
          seller side (its own note: "buyers is currently a single empty
          type", a chip that would always just read the same count as the
          toggle isn't worth its own space) — no longer true now that
          buyers has two types, so the same reasoning that earned the
          seller side its chips now applies to buyers too. Every type shows
          even at zero, greyed rather than hidden, so the shape of the
          whole system is visible even when most of it is quiet. */}
      <div className="mt-4 flex gap-1.5 flex-wrap">
        <button onClick={() => { setFilter("all"); setSelectedKey(null); }}
          className="font-heading font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg whitespace-nowrap"
          style={filter === "all" ? { background: "#1A1A1A", color: "#FFF8F4" } : { background: "#fff", border: "1px solid #F0DDD2", color: "#3D3936" }}>
          All {sideRows.length}
        </button>
        {stages.map((s) => {
          const count = countsByStage[s.key] || 0;
          const isUrgent = s.urgency < 0 && count > 0;
          const active = filter === s.key;
          return (
            <button key={s.key} onClick={() => { setFilter(s.key); setSelectedKey(null); }}
              className="font-heading font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg whitespace-nowrap"
              style={
                active ? { background: "#1A1A1A", color: "#FFF8F4" }
                  : isUrgent ? { background: "#FCEBE9", color: "#C0392B" }
                  : count === 0 ? { background: "#fff", border: "1px solid #F0DDD2", color: "#C9B7AD" }
                  : { background: "#fff", border: "1px solid #F0DDD2", color: "#6B5B54" }
              }>
              {s.chipLabel} · {count}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        {/* list */}
        <div className={`flex flex-col gap-2.5 ${selected ? "hidden lg:flex" : ""}`}>
          {people.length === 0 ? (
            side === "buyer" && filter === "all" ? (
              <div className="mt-2 flex flex-col items-center gap-3 text-center py-14">
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-heading font-bold text-lg" style={{ background: "#D8EFE5", color: "#1A4A33" }}>✓</div>
                <div className="font-heading font-black text-lg text-foreground">No buyers need chasing</div>
                <p className="text-sm text-text-med max-w-xs">Nobody's waiting on a delivery, and everyone who got an answer either bought or is still deciding within the window. Nothing sits stale right now, that's the good outcome.</p>
              </div>
            ) : (
              <OpsEmpty title="Nothing here" body="Nobody currently matches this filter. That's a calm, correct result, not a broken one." />
            )
          ) : (
            people.map((p) => <PersonRow key={`${p.personType}:${p.personId}`} person={p}
              selected={selectedKey === `${p.personType}:${p.personId}`}
              onSelect={() => setSelectedKey(`${p.personType}:${p.personId}`)} />)
          )}
        </div>

        {/* detail, desktop sticky, matches Sellers/Buyers/Disputes */}
        <div className={selected ? "lg:sticky lg:top-6 lg:self-start" : "hidden lg:block lg:sticky lg:top-6 lg:self-start"}>
          {selected ? <PersonDetail person={selected} onBack={() => setSelectedKey(null)} />
            : <OpsEmpty title="Pick someone" body="Select a row to see their full message and every reason they're in the queue." />}
        </div>
      </div>
    </div>
  );
}

/** Compact row on desktop (name, primary pill, brief line, small Send),
 * expands to the full inline card with the message preview on mobile —
 * mobile has no separate detail step, everything actionable is already on
 * the card, matching the design's own mobile treatment. */
function PersonRow({ person, selected, onSelect }: { person: GroupedPerson; selected: boolean; onSelect: () => void }) {
  const urgent = person.primary.urgency < 0;
  const preview = previewWhatsAppMessage(person.primary.whatsapp_link);
  const stageLabel = (person.primary.person_type === "seller" ? SELLER_OUTREACH_STAGES : BUYER_OUTREACH_STAGES)
    .find((s) => s.key === person.primary.stage_key)?.chipLabel || person.primary.label;

  return (
    <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={urgent ? { border: "1.5px solid #C0392B", background: "#FCEBE9" } : { border: "1px solid #F0DDD2", background: "#fff" }}>
      <button onClick={onSelect} className="hidden lg:flex items-center gap-3 text-left w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <b className="font-heading font-extrabold text-sm text-foreground">{person.personName}</b>
            <span className="font-heading font-extrabold text-[9.5px] px-1.5 py-0.5 rounded-md" style={urgent ? { background: "#C0392B", color: "#FFF8F4" } : { background: "#EDE6E1", color: "#6B5B54" }}>{stageLabel}</span>
            {person.extra.length > 0 && <span className="font-bold text-[11px]" style={{ color: "#2D6A4F" }}>+{person.extra.length} more</span>}
          </div>
          <div className="text-xs text-text-med mt-0.5 truncate">{person.primary.label}{person.primary.context ? ` · ${person.primary.context}` : ""}</div>
        </div>
        <span className="flex-none flex items-center gap-1.5 font-heading font-extrabold text-xs px-3 py-2 rounded-lg" style={{ background: "#25D366", color: "#fff" }}>
          <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px]" style={{ background: "#fff", color: "#25D366" }}>✆</span>
          Open
        </span>
      </button>

      {/* mobile: full inline card, everything actionable right here */}
      <div className="flex lg:hidden flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <b className="font-heading font-extrabold text-sm text-foreground">{person.personName}</b>
          <span className="font-heading font-extrabold text-[9.5px] px-1.5 py-0.5 rounded-md whitespace-nowrap" style={urgent ? { background: "#C0392B", color: "#FFF8F4" } : { background: "#EDE6E1", color: "#6B5B54" }}>{stageLabel}</span>
        </div>
        <div className="text-xs text-text-med">{person.primary.label}{person.primary.context ? ` · ${person.primary.context}` : ""}</div>
        {person.extra.length > 0 && (
          <button onClick={onSelect} className="text-left font-bold text-[11px]" style={{ color: "#2D6A4F" }}>Also matches {person.extra.length} more, tap to see all</button>
        )}
        {preview && <div className="rounded-lg border p-2.5 text-[11.5px] whitespace-pre-wrap" style={{ borderColor: "#F0DDD2", background: "#fff", color: "#3D3936" }}>{preview}</div>}
        <a href={person.primary.whatsapp_link} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]" style={{ background: "#25D366", color: "#fff" }}>
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ background: "#fff", color: "#25D366" }}>✆</span>
          Send on WhatsApp
        </a>
      </div>
    </div>
  );
}

function PersonDetail({ person, onBack }: { person: GroupedPerson; onBack: () => void }) {
  const all = [person.primary, ...person.extra];
  return (
    <div className="flex flex-col gap-3">
      <button onClick={onBack} className="lg:hidden text-sm font-heading font-bold self-start" style={{ color: "#2D6A4F" }}>‹ All to contact</button>
      <div className="rounded-2xl border bg-white p-4 flex flex-col gap-3" style={{ borderColor: "#F0DDD2" }}>
        <div className="font-heading font-black text-lg text-foreground">{person.personName}</div>
        <div className="flex flex-wrap gap-1.5">
          {all.map((r) => {
            const stageLabel = (r.person_type === "seller" ? SELLER_OUTREACH_STAGES : BUYER_OUTREACH_STAGES).find((s) => s.key === r.stage_key)?.chipLabel || r.label;
            return <span key={r.stage_key} className="font-heading font-extrabold text-[10.5px] px-2 py-1 rounded-md" style={r.urgency < 0 ? { background: "#C0392B", color: "#FFF8F4" } : { background: "#EDE6E1", color: "#6B5B54" }}>{stageLabel}</span>;
          })}
        </div>
        {all.map((r) => {
          const preview = previewWhatsAppMessage(r.whatsapp_link);
          return (
            <div key={r.stage_key} className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "#F0DDD2" }}>
              <div className="text-xs text-text-med">{r.label}{r.context ? ` · ${r.context}` : ""}</div>
              {preview && <div className="rounded-lg border p-3 text-[12.5px] whitespace-pre-wrap" style={{ borderColor: "#F0DDD2", background: "#FFF8F4", color: "#3D3936" }}>{preview}</div>}
              <a href={r.whatsapp_link} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]" style={{ background: "#25D366", color: "#fff" }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ background: "#fff", color: "#25D366" }}>✆</span>
                Send on WhatsApp
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
