import { useMemo, useRef, useState } from "react";
import { useMarketplaceWhatsAppNumber, waHref } from "../lib/whatsapp";

/** Not one of build_whatsapp_link's named contexts (there is no "area not
 * listed" case in that list), so this is a bespoke message rather than a
 * mirrored one, still reading the number live. */
const AREA_MISSING_MESSAGE = "Hello. My area is not listed when I search, please can you add it.";

interface Area { id: string; name: string }

/**
 * Searchable type-ahead for the listing area. Lagos alone has 164 areas, so a
 * plain select is unusable on a phone. Hand-rolled (no new dependency) and
 * styled with the marketplace's own .mkt classes so it matches the sell flow.
 *
 * Matching is case-insensitive and matches anywhere in the name. The seller must
 * pick from the list: only a real selection commits to `value`; typed text that
 * matches nothing is reverted on blur and never stored. Areas are fetched once
 * for the chosen state and filtered client-side. Keyboard: arrow keys move the
 * highlight, Enter selects, Escape closes.
 *
 * Mount this with key={stateId} so changing state gives a fresh, empty field.
 */
export default function AreaCombobox({
  areas,
  value,
  onChange,
  disabled,
}: {
  areas: Area[];
  value: string;
  onChange: (name: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const waNumber = useMarketplaceWhatsAppNumber();
  const areaMissingHref = waHref(waNumber, AREA_MISSING_MESSAGE);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return areas;
    return areas.filter((a) => a.name.toLowerCase().includes(q));
  }, [areas, query]);

  function select(name: string) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(name);
    setQuery(name);
    setOpen(false);
  }

  function commitOnBlur() {
    setOpen(false);
    const q = query.trim();
    if (q === "") { onChange(""); return; }
    const exact = areas.find((a) => a.name.toLowerCase() === q.toLowerCase());
    if (exact) { onChange(exact.name); setQuery(exact.name); }
    else { setQuery(value); } // typed text that is not a real area does not stick
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { if (open && filtered[active]) { e.preventDefault(); select(filtered[active].name); } }
    else if (e.key === "Escape") { setOpen(false); }
  }

  if (disabled) {
    return <input className="mkt-input" value="" placeholder="Pick a state first" disabled readOnly />;
  }

  return (
    <div>
      <div className="mkt-combo">
        <input
          className="mkt-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={query}
          placeholder="Search your area"
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setOpen(true); }}
          onBlur={() => { blurTimer.current = setTimeout(commitOnBlur, 150); }}
          onKeyDown={onKeyDown}
        />
        {open && (
          <div className="mkt-combo-list" role="listbox">
            {filtered.length === 0 ? (
              <div className="mkt-combo-empty">
                No area matches that. If yours is missing,{" "}
                <a href={areaMissingHref} target="_blank" rel="noreferrer">message us on WhatsApp</a> and we will add it.
              </div>
            ) : (
              filtered.map((a, i) => (
                <div
                  key={a.id}
                  role="option"
                  aria-selected={i === active}
                  data-selected={i === active ? "true" : undefined}
                  className="mkt-combo-item"
                  ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  onMouseDown={(e) => { e.preventDefault(); select(a.name); }}
                  onMouseEnter={() => setActive(i)}
                >
                  {a.name}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="mkt-combo-note" style={{ marginTop: 6 }}>
        Start typing to find your area. Cannot find it?{" "}
        <a href={areaMissingHref} target="_blank" rel="noreferrer">Message us on WhatsApp</a>.
      </div>
    </div>
  );
}
