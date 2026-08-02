import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adb } from "./data";

/**
 * Admin location management. States and areas are the dependent dropdowns the
 * seller listing form reads. Only is_allowed places reach sellers, so toggling
 * is_allowed here is how we open or close a place. Reads go through the admin
 * client (admin-manage RLS lets an admin see disabled rows too).
 */

interface StateRow { id: string; name: string; is_allowed: boolean; sort_order: number | null }
interface AreaRow { id: string; state_id: string; name: string; is_allowed: boolean }
type Pending =
  | { kind: "state"; row: StateRow }
  | { kind: "area"; row: AreaRow };

export default function MarketplaceLocations() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newState, setNewState] = useState("");
  const [newArea, setNewArea] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statesQ = useQuery({
    queryKey: ["mkt-admin-states"],
    queryFn: async (): Promise<StateRow[]> => {
      const { data, error } = await adb.from("marketplace_states").select("id, name, is_allowed, sort_order").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as StateRow[];
    },
    staleTime: 15000,
  });

  const areasQ = useQuery({
    queryKey: ["mkt-admin-areas"],
    queryFn: async (): Promise<AreaRow[]> => {
      const { data, error } = await adb.from("marketplace_areas").select("id, state_id, name, is_allowed").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as AreaRow[];
    },
    staleTime: 15000,
  });

  const areasByState = useMemo(() => {
    const map: Record<string, AreaRow[]> = {};
    for (const a of areasQ.data ?? []) (map[a.state_id] ||= []).push(a);
    return map;
  }, [areasQ.data]);

  async function confirmToggle() {
    if (!pending) return;
    setBusy(true); setError(null);
    const table = pending.kind === "state" ? "marketplace_states" : "marketplace_areas";
    const { error } = await adb.from(table).update({ is_allowed: !pending.row.is_allowed }).eq("id", pending.row.id);
    setBusy(false);
    if (error) { setError(error.message); setPending(null); return; }
    setPending(null);
    if (pending.kind === "state") statesQ.refetch(); else areasQ.refetch();
  }

  async function addState() {
    const name = newState.trim();
    if (!name) return;
    setBusy(true); setError(null);
    const maxSort = Math.max(0, ...((statesQ.data ?? []).map((s) => s.sort_order || 0)));
    const { error } = await adb.from("marketplace_states").insert({ name, is_allowed: true, sort_order: maxSort + 1 });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setNewState("");
    statesQ.refetch();
  }

  async function addArea(stateId: string) {
    const name = (newArea[stateId] || "").trim();
    if (!name) return;
    setBusy(true); setError(null);
    const { error } = await adb.from("marketplace_areas").insert({ state_id: stateId, name, is_allowed: true });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setNewArea((m) => ({ ...m, [stateId]: "" }));
    areasQ.refetch();
  }

  const allowedPill = { background: "#D8EFE5", color: "#1A4A33" };
  const disabledPill = { background: "#FDECEA", color: "#C0392B" };

  return (
    <div className="mt-4 rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Locations</div>
        <div className="flex gap-2">
          <input value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="New state name"
            className="rounded-lg border px-3 py-1.5 text-sm w-44" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
          <button onClick={addState} disabled={busy || !newState.trim()} className="text-xs font-heading font-extrabold px-3 rounded-lg border" style={{ borderColor: "#2D6A4F", color: "#2D6A4F" }}>Add state</button>
        </div>
      </div>
      <p className="text-[12px] text-text-med mt-2">Disabling a state or area removes it from the seller listing form. Only enable places you can actually deliver to.</p>

      {error && <div className="mt-2 text-xs" style={{ color: "#C0392B" }}>{error}</div>}

      <div className="mt-3 flex flex-col gap-2">
        {(statesQ.data ?? []).map((s) => {
          const areas = areasByState[s.id] ?? [];
          const allowedCount = areas.filter((a) => a.is_allowed).length;
          const open = expanded === s.id;
          return (
            <div key={s.id} className="rounded-xl border" style={{ borderColor: "#F0DDD2" }}>
              <div className="flex items-center gap-2 p-3">
                <button onClick={() => setExpanded(open ? null : s.id)} className="flex items-center gap-2 flex-1 text-left">
                  <span className="text-text-light text-xs" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▸</span>
                  <span className="font-heading font-extrabold text-sm">{s.name}</span>
                  <span className="text-[11px] text-text-med">{allowedCount} of {areas.length} areas on</span>
                </button>
                <span className="text-[10px] font-heading font-bold uppercase tracking-wide px-2 py-1 rounded" style={s.is_allowed ? allowedPill : disabledPill}>{s.is_allowed ? "On" : "Disabled"}</span>
                <button onClick={() => { setPending({ kind: "state", row: s }); setError(null); }}
                  className="text-xs font-heading font-bold px-2.5 py-1 rounded-lg border" style={{ borderColor: "#F0DDD2" }}>
                  {s.is_allowed ? "Disable" : "Enable"}
                </button>
              </div>

              {open && (
                <div className="px-3 pb-3 flex flex-col gap-1.5" style={{ borderTop: "1px solid #F5EDE8" }}>
                  {areas.length === 0 && <div className="text-[12px] text-text-med pt-2">No areas yet.</div>}
                  {areas.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 pt-2">
                      <span className="flex-1 text-sm" style={{ color: a.is_allowed ? "#1A1A1A" : "#8A7A72" }}>{a.name}</span>
                      {!a.is_allowed && <span className="text-[9px] font-heading font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={disabledPill}>disabled</span>}
                      <button onClick={() => { setPending({ kind: "area", row: a }); setError(null); }}
                        className="text-[11px] font-heading font-bold px-2.5 py-1 rounded-lg border" style={{ borderColor: "#F0DDD2" }}>
                        {a.is_allowed ? "Disable" : "Enable"}
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <input value={newArea[s.id] || ""} onChange={(e) => setNewArea((m) => ({ ...m, [s.id]: e.target.value }))} placeholder="New area name"
                      className="flex-1 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
                    <button onClick={() => addArea(s.id)} disabled={busy || !(newArea[s.id] || "").trim()} className="text-xs font-heading font-extrabold px-3 rounded-lg border" style={{ borderColor: "#2D6A4F", color: "#2D6A4F" }}>Add area</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pending && (
        <div className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center p-4" onClick={() => !busy && setPending(null)}>
          <div className="bg-white rounded-2xl border p-5 max-w-sm w-full" style={{ borderColor: "#F0DDD2" }} onClick={(e) => e.stopPropagation()}>
            <div className="font-heading font-black text-lg">
              {pending.row.is_allowed ? "Disable" : "Enable"} {pending.row.name}?
            </div>
            <p className="text-sm text-text-med mt-1">
              {pending.row.is_allowed
                ? "This removes it from the seller listing form. Sellers will not be able to pick it."
                : "This makes it available to sellers in the listing form."}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPending(null)} disabled={busy} className="flex-1 font-heading font-bold text-sm rounded-xl py-2.5 border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
              <button onClick={confirmToggle} disabled={busy} className="flex-1 font-heading font-extrabold text-sm rounded-xl py-2.5 text-white" style={{ background: "#C0392B" }}>{busy ? "Saving..." : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
