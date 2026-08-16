import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, relativeTimeAgo } from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill } from "./opsUi";

/**
 * Stalled checkouts, from both sources marketplace_abandoned_checkouts
 * unions: a real order that was created but never paid ('order'), and
 * someone who typed name/email/phone on the details step and never even
 * got that far ('attempt', see the debounced record_checkout_attempt calls
 * in CheckoutPage.tsx). status is computed live server side against
 * marketplace_abandon_minutes, so it is read here, never recomputed.
 *
 * No outreach-queue integration: checked get_outreach_queue's actual
 * source (customers with an answered question or a PAID+unconfirmed
 * order) — it has no idea checkout attempts exist at all, and most rows
 * here are guests with no customer_id, who that RPC's buyer loop could
 * never see regardless. There is no sequenced message to reuse, so this
 * screen sends a single, honest, one-off WhatsApp contact instead of
 * bolting onto a system that doesn't cover this case.
 */

interface AbandonedRow {
  source: "order" | "attempt";
  ref_id: string;
  listing_id: string | null;
  listing_title: string | null;
  image_url: string | null;
  amount_naira: number | null;
  order_reference: string | null;
  buyer_name: string | null;
  email: string | null;
  phone: string | null;
  customer_id: string | null;
  started_at: string;
  last_activity_at: string;
  status: "abandoned" | "in_progress";
  reached_payment_step: boolean;
}

/** digits-only, Nigerian-number-aware — duplicated from MarketplaceBuyers.tsx
 * rather than imported, same reasoning that file gives: it lives in the
 * customer-facing marketplace tree, not admin. */
function toIntlPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  return "234" + digits;
}

export default function MarketplaceAbandonedCheckouts() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["mkt-abandoned-checkouts"],
    staleTime: 15000,
    queryFn: async (): Promise<AbandonedRow[]> => {
      const { data, error } = await adb.from("marketplace_abandoned_checkouts").select("*").order("last_activity_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AbandonedRow[];
    },
  });

  const { abandoned, inProgress, totalAbandonedNaira } = useMemo(() => {
    const all = rows ?? [];
    const ab = all.filter((r) => r.status === "abandoned");
    const ip = all.filter((r) => r.status === "in_progress");
    const total = ab.reduce((s, r) => s + (r.amount_naira || 0), 0);
    return { abandoned: ab, inProgress: ip, totalAbandonedNaira: total };
  }, [rows]);

  // No structural "is this real" signal exists on either source (no test
  // flag, no email-domain convention anywhere else in this codebase to
  // reuse), so rather than guess at one, this is a plain heads-up and lets
  // the operator's own judgement do the filtering — same honest-note
  // approach MarketplaceBuyers.tsx already uses for the same situation.
  const hasAny = (rows ?? []).length > 0;

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!hasAny) {
    return (
      <div>
        <OpsHeader title="Abandoned checkouts" subtitle="Everyone who started paying, or started typing their details, and stopped." />
        <OpsEmpty title="Nothing stalled right now" body="Someone who reaches checkout and stops, whether they paid nothing or just typed their name, appears here." />
      </div>
    );
  }

  return (
    <div>
      <OpsHeader
        title="Abandoned checkouts"
        subtitle={`${formatNaira(totalAbandonedNaira)} sitting abandoned across ${abandoned.length} ${abandoned.length === 1 ? "checkout" : "checkouts"}${inProgress.length > 0 ? `, ${inProgress.length} more still possibly in progress` : ""}.`}
      />

      <div className="mt-2 rounded-xl p-3 text-xs" style={{ background: "#FDE8DF", color: "#8C4A34" }}>
        Some of what's below is internal testing, not real buyers, especially anything with a familiar name or an obviously fake email or item. Check who it actually is before reaching out.
      </div>

      <div className="mt-5 flex flex-col gap-6">
        <Section
          title="Abandoned"
          hint="No activity in the last 30 minutes. These need chasing."
          rows={abandoned}
          empty="Nothing abandoned right now."
        />
        <Section
          title="Still in progress"
          hint="Active in the last 30 minutes, someone may be typing right now."
          rows={inProgress}
          empty="Nobody currently mid-checkout."
        />
      </div>
    </div>
  );
}

function Section({ title, hint, rows, empty }: { title: string; hint: string; rows: AbandonedRow[]; empty: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <div className="font-heading font-black text-base text-foreground">{title} <span className="text-text-med font-bold text-sm">({rows.length})</span></div>
        <div className="text-[11.5px] text-text-med">{hint}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-text-med rounded-xl border p-3" style={{ borderColor: "#F0DDD2" }}>{empty}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => <Row key={`${r.source}-${r.ref_id}`} r={r} />)}
        </div>
      )}
    </div>
  );
}

/** Same base + param names get_buyer_nudge_suggestions() already builds
 * server side for the logged-in-buyer version of this exact message
 * (site || '/checkout/' || listing_id || '?resume_order=' || id, or
 * '?resume=' for an attempt) — kept identical here so a guest row (no
 * customer_id, which that RPC can't see at all) lands on the same
 * pre-filled checkout experience a logged-in buyer's nudge would. */
const MKT_SITE = "https://bundledmum.com/marketplace";
function resumeLinkFor(r: AbandonedRow): string | null {
  if (!r.listing_id) return null;
  const param = r.source === "order" ? `resume_order=${r.ref_id}` : `resume=${r.ref_id}`;
  return `${MKT_SITE}/checkout/${r.listing_id}?${param}`;
}

function Row({ r }: { r: AbandonedRow }) {
  const intlPhone = toIntlPhone(r.phone);
  const name = r.buyer_name || "Someone";
  const item = r.listing_title || "an item";
  const resumeLink = resumeLinkFor(r);
  const waMessage = `Hi ${r.buyer_name || "there"}, this is BundledMum. We noticed you were checking out ${item} on the marketplace and wanted to see if you ran into any trouble or had a question before finishing up.`
    + (resumeLink ? `\n\nPick up right where you left off, your details are already saved: ${resumeLink}` : "");
  const waHref = intlPhone ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(waMessage)}` : null;

  return (
    <div className="rounded-2xl border p-3.5 flex gap-3 items-start" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
      <div className="w-14 h-14 rounded-lg flex-none overflow-hidden" style={{ background: "repeating-linear-gradient(135deg,#FDE8DF 0 6px,#FFF8F4 6px 12px)" }}>
        {r.image_url && <img src={r.image_url} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="font-heading font-black text-sm text-foreground truncate">{name}</div>
            <div className="text-[11.5px] text-text-med truncate">{item}</div>
          </div>
          <div className="text-right flex-none">
            <div className="font-heading font-black text-sm text-foreground tabular-nums">{r.amount_naira != null ? formatNaira(r.amount_naira) : "—"}</div>
            <div className="text-[10.5px] text-text-med">{relativeTimeAgo(r.last_activity_at)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <StatusPill tone={r.reached_payment_step ? "work" : "neutral"} label={r.reached_payment_step ? "Reached payment step" : "Left the details form"} />
          {r.source === "order" && r.order_reference && (
            <span className="text-[10.5px] text-text-med">{r.order_reference}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-[11.5px] text-text-med">
          {r.email && <span className="truncate">{r.email}</span>}
          {r.phone && <span>{r.phone}</span>}
          {!r.email && !r.phone && <span>No contact details captured</span>}
        </div>

        {waHref && (
          <a href={waHref} target="_blank" rel="noreferrer"
            className="self-start mt-1 inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 font-heading font-extrabold text-[12px]"
            style={{ background: "#25D366", color: "#FFFFFF" }}>
            Message on WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
