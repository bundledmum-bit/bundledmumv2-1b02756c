import { ReactNode, useState } from "react";
import type { PillTone } from "./opsData";

/**
 * Shared building blocks for the marketplace ops screens. One pill system, one
 * copy affordance, one confirm dialog, so every surface reads the same and every
 * irreversible action is gated the same way.
 */

const PILL_STYLE: Record<PillTone, { bg: string; color: string }> = {
  good: { bg: "#D8EFE5", color: "#1A4A33" },
  work: { bg: "#FDE8DF", color: "#D4613C" },
  negative: { bg: "#F9E3E0", color: "#C0392B" },
  neutral: { bg: "#EDE6E1", color: "#6B5B54" },
};

export function StatusPill({ tone, label }: { tone: PillTone; label: string }) {
  const s = PILL_STYLE[tone];
  return (
    <span className="inline-flex items-center font-heading font-extrabold text-[11px] px-2 py-1 rounded-md whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
      {label}
    </span>
  );
}

/** Page heading used across the ops screens. */
export function OpsHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="font-heading font-black text-2xl tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-text-med mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Empty state card. */
export function OpsEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6 rounded-2xl border p-12 text-center" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
      <div className="font-heading font-black text-lg text-foreground">{title}</div>
      <p className="mt-2 text-sm text-text-med max-w-md mx-auto">{body}</p>
    </div>
  );
}

/** A bank account number (or any value) as a tap target with its own copy button.
 * Works on desktop and mobile. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left tabular-nums"
      style={{ borderColor: "#F0DDD2", background: "#fff" }}
    >
      <span className="font-heading font-bold text-[13px] text-foreground">{value || "Not on file"}</span>
      <span className="font-heading font-extrabold text-[11px]" style={{ color: copied ? "#1A4A33" : "#2D6A4F" }}>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export interface ConfirmKv { label: string; value: string }

/**
 * The single confirm dialog in front of every irreversible action. It restates
 * the amount, the recipient and the destination account so a mistyped bank
 * transfer is the thing the operator checks against, since nothing here can undo
 * a real transfer.
 */
export function ConfirmDialog({
  open, title, body, kv, confirmLabel, danger, busy, error, onConfirm, onCancel, children,
}: {
  open: boolean;
  title: string;
  body: string;
  kv?: ConfirmKv[];
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(26,26,26,0.45)" }} onClick={() => !busy && onCancel()}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} style={{ borderColor: "#F0DDD2" }}>
        <h3 className="font-heading font-black text-lg tracking-tight text-foreground">{title}</h3>
        <p className="text-sm text-text-med leading-relaxed">{body}</p>
        {kv && kv.length > 0 && (
          <div className="rounded-xl border divide-y" style={{ borderColor: "#F0DDD2" }}>
            {kv.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-xs text-text-med">{r.label}</span>
                <span className="font-heading font-extrabold text-sm text-foreground tabular-nums text-right">{r.value}</span>
              </div>
            ))}
          </div>
        )}
        {children}
        {error && <div className="text-xs" style={{ color: "#C0392B" }}>{error}</div>}
        <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-1">
          <button onClick={onCancel} disabled={busy} className="sm:flex-1 font-heading font-extrabold text-sm rounded-xl py-3 border" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
            Not yet, go back
          </button>
          <button onClick={onConfirm} disabled={busy} className="sm:flex-[1.4] font-heading font-extrabold text-sm rounded-xl py-3 text-white" style={{ background: danger ? "#C0392B" : "#2D6A4F" }}>
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A titled card wrapper used across ops detail panels. */
export function OpsCard({ label, children, danger }: { label?: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: danger ? "#C0392B" : "#F0DDD2" }}>
      {label && <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med mb-1.5">{label}</div>}
      {children}
    </div>
  );
}
