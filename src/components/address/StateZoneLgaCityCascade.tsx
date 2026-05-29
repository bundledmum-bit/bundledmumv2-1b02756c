import { useEffect, useMemo, useRef, useState } from "react";
import { useDeliverableStates } from "@/hooks/useDeliverableStates";
import { useShippingZones, type ShippingZone } from "@/hooks/useShippingZones";

// 4-level address picker — State → Delivery Zone → Local Government Area
// → City — mirroring the cascade CheckoutPage uses inline. The Zone and
// LGA picks are UI scaffolding only (no DB columns); only `state` and
// `city` are reported to the parent.
//
// Behaviour matches checkout:
//   - State pulled from deliverable_states (active, by display_order).
//   - When the chosen state has `has_zones=true` AND at least one active
//     shipping_zones row references it, the Zone/LGA/City dropdowns are
//     shown. Otherwise the cascade collapses to State + free-text City.
//   - Single-LGA zones auto-pick the LGA; single-area LGAs auto-pick the
//     City (writes to the parent via onChange).
//   - On initial mount with a saved (state, city), the cascade attempts a
//     best-effort back-fill: find a zone whose .lgas[*].areas (or top-level
//     .areas) contains the city. On failure the City falls back to a
//     pre-filled free-text input.

export interface AddressCascadeValue {
  state: string;
  city: string;
}

interface Props {
  value: AddressCascadeValue;
  onChange: (next: Partial<AddressCascadeValue>) => void;
  disabled?: boolean;
  labelClassName?: string;
  inputClassName?: string;
}

export default function StateZoneLgaCityCascade({
  value, onChange, disabled, labelClassName = "", inputClassName = "",
}: Props) {
  const { data: deliverableStates = [] } = useDeliverableStates(true);
  const { data: zones } = useShippingZones();

  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedLga, setSelectedLga] = useState<string>("");

  const state = value.state || "";
  const city = value.city || "";

  // Derivations match CheckoutPage line-for-line.
  const activeState = (deliverableStates as any[]).find((s) => s.name === state);
  const zonesForState = useMemo<ShippingZone[]>(
    () => ((zones || []) as ShippingZone[]).filter((z) => (z.states || []).includes(state)),
    [zones, state],
  );
  const stateHasZones = activeState?.has_zones === true && zonesForState.length > 0;
  const selectedZone = zonesForState.find((z) => z.id === selectedZoneId) || null;
  const lgasForZone = selectedZone?.lgas || [];
  const areasForLga = selectedZone?.lgas?.find((l) => l.lga === selectedLga)?.areas || [];

  // Back-fill: when the component mounts (or the parent's state+city
  // change externally) and no Zone is selected yet, try to locate a zone
  // whose .areas contain the saved city. Skipped once selectedZoneId is
  // set — including by the back-fill itself — so this never loops.
  const backfilledKeyRef = useRef<string>("");
  useEffect(() => {
    if (!zones) return;
    const key = `${state}|${city}`;
    if (backfilledKeyRef.current === key) return;
    backfilledKeyRef.current = key;
    if (selectedZoneId) return;          // user has already chosen — don't override
    if (!stateHasZones || !city) return; // nothing to match against
    for (const z of zonesForState) {
      // Prefer LGA→areas match for the most precise back-fill.
      const matchingLga = (z.lgas || []).find((l) => (l.areas || []).includes(city));
      if (matchingLga) {
        setSelectedZoneId(z.id);
        setSelectedLga(matchingLga.lga);
        return;
      }
      // Fall back to zone-level .areas when the zone has no lgas structure.
      if ((z.areas || []).includes(city)) {
        setSelectedZoneId(z.id);
        return;
      }
    }
    // No match — leave Zone/LGA blank; City renders as free-text below.
  }, [zones, state, city, stateHasZones, zonesForState, selectedZoneId]);

  // If the chosen zone has exactly one LGA, auto-pick it (mirrors checkout).
  useEffect(() => {
    if (selectedZone && selectedZone.lgas && selectedZone.lgas.length === 1 && !selectedLga) {
      setSelectedLga(selectedZone.lgas[0].lga);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZoneId]);

  // If the chosen LGA has exactly one area, auto-set the parent's city.
  useEffect(() => {
    if (!selectedLga || !selectedZone) return;
    const lga = selectedZone.lgas?.find((l) => l.lga === selectedLga);
    if (lga && lga.areas.length === 1 && city !== lga.areas[0]) {
      onChange({ city: lga.areas[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLga, selectedZoneId]);

  // Whether City should render as a dropdown (areas resolved) or fall
  // back to free-text (no zones, or back-fill failed to match).
  const cityIsDropdown =
    stateHasZones && !!selectedZone && !!selectedLga && areasForLga.length > 0;

  return (
    <>
      {/* State */}
      <div>
        <label className={labelClassName}>State</label>
        <select
          disabled={disabled}
          value={state}
          onChange={(e) => {
            const v = e.target.value;
            // Reset cascade; clear the parent city. Pin the back-fill key
            // so the empty-city state we just produced doesn't re-trigger.
            setSelectedZoneId("");
            setSelectedLga("");
            backfilledKeyRef.current = `${v}|`;
            onChange({ state: v, city: "" });
          }}
          className={inputClassName}
        >
          <option value="">—</option>
          {(deliverableStates as any[]).map((s: any) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Delivery Zone — only when the state has mapped zones */}
      {stateHasZones && (
        <div>
          <label className={labelClassName}>Delivery Zone</label>
          <select
            disabled={disabled}
            value={selectedZoneId}
            onChange={(e) => {
              setSelectedZoneId(e.target.value);
              setSelectedLga("");
              // Clear city so the new zone's areas drive the next pick.
              backfilledKeyRef.current = `${state}|`;
              onChange({ city: "" });
            }}
            className={inputClassName}
          >
            <option value="">—</option>
            {zonesForState.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Local Government Area */}
      {stateHasZones && selectedZone && lgasForZone.length > 0 && (
        <div>
          <label className={labelClassName}>Local Government Area</label>
          <select
            disabled={disabled}
            value={selectedLga}
            onChange={(e) => {
              setSelectedLga(e.target.value);
              backfilledKeyRef.current = `${state}|`;
              onChange({ city: "" });
            }}
            className={inputClassName}
          >
            <option value="">—</option>
            {lgasForZone.map((l) => (
              <option key={l.lga} value={l.lga}>{l.lga}</option>
            ))}
          </select>
        </div>
      )}

      {/* City — dropdown when resolved, free-text fallback otherwise */}
      <div>
        <label className={labelClassName}>City</label>
        {cityIsDropdown ? (
          <select
            disabled={disabled}
            value={city}
            onChange={(e) => onChange({ city: e.target.value })}
            className={inputClassName}
          >
            <option value="">—</option>
            {areasForLga.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        ) : (
          <input
            disabled={disabled}
            value={city}
            onChange={(e) => onChange({ city: e.target.value })}
            className={inputClassName}
          />
        )}
      </div>
    </>
  );
}
