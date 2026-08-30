import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { formatDateTime, fetchOnBehalfLog, type OnBehalfLogRow } from "./opsData";
import { OpsHeader, OpsEmpty } from "./opsUi";

/**
 * Everything ever done in someone else's name, newest first.
 *
 * This is what you open when a seller asks why their order says something
 * they did not do. It is the reason every one of the fourteen on-behalf
 * functions refuses without a note: the note is the answer to that
 * question, and it is worthless if it cannot be found afterwards.
 *
 * Deliberately a plain list, not a queue. Nothing here is work to clear and
 * nothing can be acted on, so there are no buttons and no filters that
 * would suggest otherwise. Search exists only because the one real use is
 * looking up a single person or item you already have in mind.
 */
export default function MarketplaceOnBehalfLog() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["mkt-on-behalf-log"],
    queryFn: fetchOnBehalfLog,
    staleTime: 15000,
  });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      (r.item || "").toLowerCase().includes(q) ||
      (r.done_by || "").toLowerCase().includes(q) ||
      (r.note || "").toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q));
  }, [rows, search]);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  const all = rows ?? [];

  return (
    <div>
      <OpsHeader
        title="Done for someone"
        subtitle="Every action taken in a seller's or a buyer's name, with who did it and where they were told. Newest first."
      />

      {all.length === 0 ? (
        <OpsEmpty
          title="Nothing done for anyone yet"
          body="Whenever you answer, dispatch, offer or dispute in someone else's name, it is recorded here with your note."
        />
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search an item, a person or a note"
              className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[220px]" style={{ borderColor: "#E3D4CB" }}
            />
            <span className="text-xs text-text-med tabular-nums">
              {filtered.length === all.length ? `${all.length} recorded` : `${filtered.length} of ${all.length}`}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-4 text-sm text-text-med">Nothing matches that.</div>
          ) : (
            <div className="mt-4 flex flex-col gap-2.5">
              {filtered.map((r) => <Entry key={`${r.record_id}-${r.at}`} r={r} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One entry. Cards rather than a table because the note is the point and it
 * is a sentence, not a cell: a table column wide enough to read it would
 * force the rest off a phone, and this gets opened on a phone while the
 * person asking is still on WhatsApp.
 */
function Entry({ r }: { r: OnBehalfLogRow }) {
  return (
    <div className="rounded-2xl border p-3.5 bg-white flex flex-col gap-2" style={{ borderColor: "#F0DDD2" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-heading font-black text-[13.5px] text-foreground">{r.item || "Item"}</div>
          <div className="text-[11px] text-text-med">{r.action}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-heading font-extrabold text-[12px] text-foreground">{r.done_by || "Unknown"}</div>
          <div className="text-[10.5px] text-text-med tabular-nums">{formatDateTime(r.at)}</div>
        </div>
      </div>
      {r.note && (
        <div className="rounded-lg px-2.5 py-2 text-[12px] leading-relaxed" style={{ background: "#FFF8F4", color: "#4A3F3A" }}>
          {r.note}
        </div>
      )}
    </div>
  );
}
