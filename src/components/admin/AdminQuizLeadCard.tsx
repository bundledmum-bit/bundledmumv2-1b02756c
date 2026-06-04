import { MessageCircle, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/cart";
import { SHOPPER_COLORS } from "@/pages/admin/AdminQuizLeads";

// Mobile (<md) quiz-lead card for AdminQuizLeads. Desktop keeps the
// table; this is the sibling card view under `md:hidden`. It consumes
// the SAME quiz_customers row shape the table maps over, so there is no
// separate fetch / filter.
//
// IMPORTANT — adapted to the real quiz_customers schema, which is
// quiz-answer analytics, NOT a CRM lead table: there is no name / email
// / phone / recommended-bundle / status column. So:
//   • Line 1: shopper_type (or "Anonymous lead") + budget_tier (the
//     quiz's recommended tier)
//   • Line 2: whatsapp_number is the ONLY contact field — tappable
//     tel: + wa.me; "No contact info" when absent
//   • Line 3: key quiz answers + "Submitted {relative}"
//   • Bottom: the same has_purchased Badge the table uses
// There is no meatball: the desktop table is read-only (no row actions,
// no row click target), so the card body is non-clickable too.

const shopperLabel: Record<string, string> = {
  self: "Shopping for self",
  dad: "Dad shopping",
  gift: "Gift shopper",
};

export default function AdminQuizLeadCard({ lead: l }: { lead: any }) {
  const waDigits = (l.whatsapp_number || "").replace(/\D/g, "");

  const submitted = (() => {
    if (!l.created_at) return null;
    const d = new Date(l.created_at);
    if (Number.isNaN(d.getTime())) return null;
    return formatDistanceToNow(d, { addSuffix: true });
  })();

  // Line 3 — quiz answer summary + submitted date.
  const answers = [l.stage, l.hospital_type, l.delivery_method, l.baby_gender]
    .filter(Boolean)
    .join(" · ");
  const quizLine = [answers || null, submitted ? `Submitted ${submitted}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="p-4">
      {/* Line 1 — shopper type (left) · recommended budget tier (right) */}
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">
          {l.shopper_type ? (
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize", SHOPPER_COLORS[l.shopper_type] || "bg-muted text-muted-foreground")}>
              {shopperLabel[l.shopper_type] || l.shopper_type}
            </span>
          ) : (
            <span className="font-medium text-muted-foreground">Anonymous lead</span>
          )}
        </span>
        {l.budget_tier && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border bg-muted capitalize flex-shrink-0">
            {l.budget_tier}
          </span>
        )}
      </div>

      {/* Line 2 — contact. WhatsApp is the only contact field; tappable. */}
      <div className="mt-1.5">
        {l.whatsapp_number && waDigits ? (
          <span className="flex items-center gap-3">
            <a
              href={`tel:${waDigits}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-mono text-xs text-foreground hover:underline truncate"
            >
              <Phone className="w-3 h-3 flex-shrink-0" /> {l.whatsapp_number}
            </a>
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
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">No contact info</span>
        )}
      </div>

      {/* Line 3 — quiz answers + submitted date */}
      {quizLine && (
        <p className="text-xs text-muted-foreground truncate mt-1 capitalize">{quizLine}</p>
      )}

      {/* Bottom row — purchased status badge (mirrors the table). No
          meatball: the table is read-only. */}
      <div className="flex items-center gap-2 mt-3">
        {l.has_purchased ? (
          <Badge className="bg-green-600 text-xs">✓ Purchased</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">Browsed</Badge>
        )}
        {l.has_purchased && l.purchase_amount ? (
          <span className="text-xs font-semibold">{fmt(l.purchase_amount)}</span>
        ) : null}
      </div>
    </Card>
  );
}
