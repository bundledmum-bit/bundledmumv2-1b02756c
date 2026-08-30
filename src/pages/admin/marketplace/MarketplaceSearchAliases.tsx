import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import {
  fetchSearchAliases, saveSearchAlias, deleteSearchAlias, fetchSearchMisses,
  type SearchAlias, type SearchMissRow,
} from "./opsData";
import { OpsHeader, OpsEmpty, OpsCard } from "./opsUi";
import { useIsReadOnlyAccount, ReadOnlyNotice, OnBehalfErr, OnBehalfDone } from "./onBehalf";

/**
 * What people type, mapped to what titles say.
 *
 * The search reads plurals, spacing, noise words and typos on its own. An
 * alias is for the cases no amount of string matching can reach, because
 * they are a different WORD: a pram is a stroller, a crib is a cot, tokunbo
 * is used. Adding one fixes that term for everyone immediately, with no
 * deploy, which is why this screen is worth having at all.
 *
 * Paired with the misses, because an alias written without looking at what
 * actually failed is a guess.
 */
export default function MarketplaceSearchAliases() {
  const { data: aliases, isLoading, refetch } = useQuery({
    queryKey: ["mkt-search-aliases"], queryFn: fetchSearchAliases, staleTime: 30000,
  });
  const { data: misses } = useQuery({
    queryKey: ["mkt-search-misses"], queryFn: fetchSearchMisses, staleTime: 30000,
  });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aliases ?? [];
    return (aliases ?? []).filter((a) => a.term.includes(q) || a.maps_to.includes(q));
  }, [aliases, search]);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  const all = aliases ?? [];

  return (
    <div>
      <OpsHeader
        title="Search words"
        subtitle="What people type, mapped to what our titles say. A word added here works for everyone straight away."
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] items-start">
        <div className="flex flex-col gap-4">
          <AddAlias onSaved={() => void refetch()} />

          <OpsCard label={`${all.length} words`}>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search these"
              className="w-full rounded-lg border px-3 py-2 text-sm mb-3" style={{ borderColor: "#E3D4CB" }}
            />
            {filtered.length === 0 ? (
              <div className="text-xs text-text-med">Nothing matches that.</div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[520px] overflow-y-auto">
                {filtered.map((a) => <AliasRow key={a.term} a={a} onChanged={() => void refetch()} />)}
              </div>
            )}
          </OpsCard>
        </div>

        <Misses rows={misses ?? []} onPick={(t) => setSearch(t)} />
      </div>
    </div>
  );
}

function AddAlias({ onSaved }: { onSaved: () => void }) {
  const [term, setTerm] = useState("");
  const [mapsTo, setMapsTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const readOnly = useIsReadOnlyAccount();

  const ready = term.trim().length >= 2 && mapsTo.trim().length >= 2 && !readOnly;

  async function save() {
    setBusy(true); setError(null); setDone(null);
    const res = await saveSearchAlias({ term, mapsTo });
    setBusy(false);
    if (!res.ok) { setError(res.message || "That could not be saved."); return; }
    setDone(res.message || "Saved.");
    setTerm(""); setMapsTo("");
    onSaved();
  }

  return (
    <OpsCard label="Add a word">
      <ReadOnlyNotice />
      <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_1fr] items-end mt-1">
        <label className="flex flex-col gap-1">
          <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>When someone types</span>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="pram"
            className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
        </label>
        <span className="hidden sm:block text-xs text-text-med pb-2.5">find</span>
        <label className="flex flex-col gap-1">
          <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>Show them items that say</span>
          <input value={mapsTo} onChange={(e) => setMapsTo(e.target.value)} placeholder="stroller"
            className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
        </label>
      </div>
      <div className="text-[10.5px] mt-1.5" style={{ color: "#8A7A72" }}>
        Both are stored in lower case, which is the form the search looks them up in.
        The search already handles plurals, spacing and typos, so this is for a genuinely different word.
      </div>
      {error && <div className="mt-2"><OnBehalfErr msg={error} /></div>}
      {done && <div className="mt-2"><OnBehalfDone msg={done} /></div>}
      <button
        type="button" disabled={!ready || busy} onClick={save}
        className="mt-3 font-heading font-extrabold text-[12px] rounded-lg px-3 py-2"
        style={ready && !busy ? { background: "#2D6A4F", color: "#fff" } : { background: "#E0DAD5", color: "#8A7A72" }}
      >
        {busy ? "Saving..." : "Add it"}
      </button>
    </OpsCard>
  );
}

function AliasRow({ a, onChanged }: { a: SearchAlias; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = useIsReadOnlyAccount();

  return (
    <div className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-3" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
      <div className="text-[12.5px] min-w-0">
        <span className="font-heading font-extrabold">{a.term}</span>
        <span className="text-text-med"> finds </span>
        <span className="font-heading font-extrabold">{a.maps_to}</span>
        {error && <div className="text-[10.5px]" style={{ color: "#C0392B" }}>{error}</div>}
      </div>
      <button
        type="button" disabled={busy || readOnly}
        onClick={async () => {
          setBusy(true); setError(null);
          const res = await deleteSearchAlias(a.term);
          setBusy(false);
          if (!res.ok) { setError(res.message || "Could not remove that."); return; }
          onChanged();
        }}
        className="text-[11px] underline shrink-0 disabled:opacity-40 disabled:no-underline"
        style={{ color: "#8A7A72" }}
      >
        {busy ? "Removing..." : "Remove"}
      </button>
    </div>
  );
}

/**
 * What is still failing, and how much of it is real.
 *
 * MOST OF THIS LIST IS NOT A PROBLEM, and the screen has to say so or it
 * reads as dozens of failures. The search box records the term once it
 * settles after 350ms, so a slow typist logs "breastp" on the way to
 * "breastpump". Those rows are the debounce catching partial typing, not a
 * search that could not read. A row is only worth acting on when it would
 * STILL find nothing today.
 */
function Misses({ rows, onPick }: { rows: SearchMissRow[]; onPick: (t: string) => void }) {
  const real = rows.filter((r) => r.would_find_now === 0);
  const alreadyFixed = rows.length - real.length;

  return (
    <OpsCard label="Still finding nothing">
      {rows.length === 0 ? (
        <OpsEmpty title="Nothing has failed" body="Every search recorded has found something." />
      ) : (
        <>
          <div className="text-[11.5px] leading-relaxed" style={{ color: "#6B5B54" }}>
            {real.length === 0
              ? "Every recorded miss would find something now."
              : `${real.length} of ${rows.length} would still find nothing today.`}
            {alreadyFixed > 0 && (
              <> The other {alreadyFixed} would find results now, mostly because the search box records a term the moment
              typing pauses, so a half typed word like "breastp" is logged on the way to the full one. Those are not failures.</>
            )}
          </div>

          {real.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {real.map((r) => (
                <button key={r.term} onClick={() => onPick(r.term)}
                  className="text-left rounded-lg border px-2.5 py-2" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
                  <div className="font-heading font-extrabold text-[12.5px]">{r.term}</div>
                  <div className="text-[10.5px]" style={{ color: "#8A7A72" }}>
                    Tried {r.times === 1 ? "once" : `${r.times} times`} by {r.people === 1 ? "one person" : `${r.people} people`}
                    {r.has_alias ? " · already has a word set" : ""}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="text-[10.5px] mt-3" style={{ color: "#8A7A72" }}>
            A term here is usually one of two things: stock we genuinely do not have, or something that is not an item at
            all, like a place name that belongs in the location filter. Neither is fixed by adding a word.
          </div>
        </>
      )}
    </OpsCard>
  );
}
