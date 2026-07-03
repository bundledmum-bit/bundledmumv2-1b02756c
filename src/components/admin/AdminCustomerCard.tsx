import { MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";

// Mobile (<md) customer card for AdminCustomers. Desktop keeps the
// table; this is the sibling card view rendered under `md:hidden`. It
// consumes the SAME customer row shape the table maps over (one row of
// `customers`), so there is no separate fetch / filter.
//
// Card body tap → onSelect(customer) — wired to the same
// setSelectedCustomer the desktop row uses, opening the in-page detail
// modal. Contact links (tel: / mailto: / wa.me) stopPropagation so they
// don't also trigger the body tap. There is no meatball: the desktop
// row has no action menu or inline buttons (its only interaction is the
// row click → modal), so there's nothing to mirror.
//
// PII parity: email / phone / whatsapp render only when canViewContact
// is true — the same `can("customers","view_contact")` gate the table
// applies.

interface AdminCustomerCardProps {
  customer: any;
  // Mirrors the desktop handler exactly: setSelectedCustomer(c) takes
  // the full row, not an id.
  onSelect?: (customer: any) => void;
  canViewContact?: boolean;
}

// Naira formatter — identical to the table's inline expression.
const fmtNaira = (n: number | null | undefined) => `₦${(n || 0).toLocaleString()}`;

function relativeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return formatDistanceToNow(d, { addSuffix: true });
}

export default function AdminCustomerCard({
  customer: c,
  onSelect,
  canViewContact = false,
}: AdminCustomerCardProps) {
  const phoneDigits = (c.phone || "").replace(/\D/g, "");
  const waDigits = (c.whatsapp_number || c.phone || "").replace(/\D/g, "");
  // admin_customer_accounts view fields, with a fallback to the older raw
  // customers shape so the card stays robust either way.
  const orders = c.paid_order_count ?? c.total_orders ?? 0;
  const spent = c.total_paid ?? c.total_spent;

  // Date label — prefer last login ("Last seen"), else join date ("Joined").
  const lastSeen = relativeDate(c.last_login_at);
  const joined = relativeDate(c.account_created_at);
  const dateLabel = lastSeen ? `Last seen ${lastSeen}` : joined ? `Joined ${joined}` : null;

  const channelOrState = c.acquisition_channel || c.delivery_state || null;

  return (
    <Card
      onClick={onSelect ? () => onSelect(c) : undefined}
      className={`p-4 ${onSelect ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
    >
      {/* Line 1 — name (left) · total spent (right) */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium truncate min-w-0">{c.full_name || "—"}</span>
        <span className="font-medium flex-shrink-0">{fmtNaira(spent)}</span>
      </div>

      {/* Line 2 — email (left, gated) · order count (right) */}
      <div className="flex items-center justify-between gap-3 mt-0.5">
        {canViewContact && c.email ? (
          <a
            href={`mailto:${c.email}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-muted-foreground truncate min-w-0 hover:underline"
          >
            {c.email}
          </a>
        ) : (
          <span className="min-w-0" />
        )}
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {orders} order{orders === 1 ? "" : "s"}
        </span>
      </div>

      {/* Line 3 — phone + whatsapp (left, gated, tappable) · last-seen (right) */}
      <div className="flex items-center justify-between gap-3 mt-1">
        <span className="flex items-center gap-2 min-w-0">
          {canViewContact && c.phone ? (
            <a
              href={`tel:${phoneDigits}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-foreground hover:underline truncate"
            >
              {c.phone}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
          {canViewContact && c.whatsapp_number && waDigits && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open WhatsApp chat"
              className="text-[#25D366] flex-shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
        </span>
        {dateLabel && (
          <span className="text-xs text-muted-foreground flex-shrink-0">{dateLabel}</span>
        )}
      </div>

      {/* Bottom row — verified + channel/state badges. No meatball:
          the desktop row has no action set to mirror. */}
      {(c.has_account !== undefined || c.email_verified || channelOrState) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {c.has_account !== undefined && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.has_account ? "bg-green-100 text-green-700" : "bg-muted text-text-med"}`}>
              {c.has_account ? "Account" : "Guest"}
            </span>
          )}
          {c.email_verified && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
              Verified
            </span>
          )}
          {channelOrState && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-text-med capitalize">
              {channelOrState}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
