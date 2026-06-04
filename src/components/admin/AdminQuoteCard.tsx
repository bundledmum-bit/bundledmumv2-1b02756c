import {
  MoreVertical, Edit2, Copy as CopyIcon, ExternalLink, Download, Send,
  ShoppingCart, XCircle, Files, Trash2, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { STATUS_COLORS, fmtN } from "@/pages/admin/AdminQuotes";

// Mobile (<md) quote card for AdminQuotes. Desktop keeps the table;
// this is the sibling card view under `md:hidden`. It consumes the SAME
// admin_quotes_summary row shape the table maps over (item_count etc.
// pre-aggregated by the view), so there is no separate fetch / filter.
//
// Card body tap → onOpen(quote) — the same setEditingId+setView the
// desktop quote-number / Edit button uses. The email link and the
// meatball (with its menu items) stopPropagation so they don't also
// trigger the body tap. The meatball mirrors the desktop row's exact
// action set + permission gates; no mutation logic is duplicated here.

interface AdminQuoteCardProps {
  quote: any;
  shareUrl: string;
  canEdit?: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
  isDownloading?: boolean;
  isDuplicating?: boolean;
  onOpen: (q: any) => void;
  onCopyShare: (q: any) => void;
  onDownload: (q: any) => void;
  onSend: (q: any) => void;
  onConvert: (q: any) => void;
  onDecline: (q: any) => void;
  onDuplicate: (q: any) => void;
  onDelete: (q: any) => void;
}

function relative(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return formatDistanceToNow(d, { addSuffix: true });
}

export default function AdminQuoteCard({
  quote: q,
  shareUrl,
  canEdit = false,
  canCreate = false,
  canDelete = false,
  isDownloading = false,
  isDuplicating = false,
  onOpen,
  onCopyShare,
  onDownload,
  onSend,
  onConvert,
  onDecline,
  onDuplicate,
  onDelete,
}: AdminQuoteCardProps) {
  // Same derivations as the desktop row (L350-352).
  const expired = q.is_expired_pending === true;
  const isFinal = q.status === "converted" || q.status === "declined";
  const canDecline = canEdit && !isFinal;

  const items = q.item_count ?? 0;
  const created = relative(q.created_at);
  const expiresRel = relative(q.expires_at);
  const dateLine = [
    created ? `Created ${created}` : null,
    expired ? "expired" : (q.expires_at && expiresRel ? `expires ${expiresRel}` : null),
  ].filter(Boolean).join(" · ");

  return (
    <Card
      onClick={() => onOpen(q)}
      className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
    >
      {/* Line 1 — customer (left) · total (right) */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium truncate min-w-0">
          {q.customer_name || q.customer_email || "—"}
        </span>
        <span className="font-medium flex-shrink-0">{fmtN(q.total)}</span>
      </div>

      {/* Line 2 — quote # · N items (+ converted order link) */}
      <div className="flex items-center justify-between gap-3 mt-0.5">
        <span className="font-mono text-xs text-muted-foreground truncate min-w-0">
          {q.quote_number}
          {q.converted_order_number && (
            <span className="ml-1.5 text-green-700 font-semibold">→ {q.converted_order_number}</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {items} item{items === 1 ? "" : "s"}
        </span>
      </div>

      {/* Line 3 — created / expiry relative dates */}
      {dateLine && (
        <p className={`text-xs mt-1 ${expired ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          {dateLine}
        </p>
      )}

      {/* Email contact — tappable, stops propagation */}
      {q.customer_email && (
        <a
          href={`mailto:${q.customer_email}`}
          onClick={(e) => e.stopPropagation()}
          className="block font-mono text-xs text-muted-foreground truncate mt-1 hover:underline"
        >
          {q.customer_email}
        </a>
      )}

      {/* Bottom row — status badge (left) · meatball (right) */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_COLORS[q.status] || STATUS_COLORS.draft}`}>
          {q.status || "draft"}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label="Quote actions"
              className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted flex-shrink-0"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(q); }}>
              <Edit2 className="w-4 h-4 mr-2" /> {canEdit ? "Edit" : "View"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopyShare(q); }}>
              <CopyIcon className="w-4 h-4 mr-2" /> Copy share URL
            </DropdownMenuItem>
            {shareUrl && (
              <DropdownMenuItem asChild>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="w-4 h-4 mr-2" /> Open customer view
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); if (!isDownloading) onDownload(q); }}
            >
              {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Download PDF
            </DropdownMenuItem>

            {canEdit && q.customer_email && !isFinal && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSend(q); }}>
                <Send className="w-4 h-4 mr-2" /> Send to customer
              </DropdownMenuItem>
            )}
            {canEdit && !isFinal && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onConvert(q); }}>
                <ShoppingCart className="w-4 h-4 mr-2" /> Place order
              </DropdownMenuItem>
            )}
            {canDecline && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDecline(q); }}>
                <XCircle className="w-4 h-4 mr-2" /> Mark as declined
              </DropdownMenuItem>
            )}
            {canCreate && (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); if (!isDuplicating) onDuplicate(q); }}
              >
                {isDuplicating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Files className="w-4 h-4 mr-2" />}
                Duplicate
              </DropdownMenuItem>
            )}
            {canDelete && q.status === "draft" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(q); }}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
