import { Phone, MessageCircle, Mail, MoreVertical, Edit2, Eye, Power } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Mobile (<md) vendor card for AdminVendors. Desktop keeps the table;
// this is the sibling card view under `md:hidden`. It consumes the SAME
// vendor row shape the table maps over, so there is no separate fetch /
// filter. (Unlike the desktop VendorRow, the card does NOT fetch the
// per-vendor product count — that would be one query per card.)
//
// Contact-heavy adaptation: phone / WhatsApp / email are surfaced as
// visible icon buttons (the primary mobile workflow is calling /
// messaging vendors), not just inline text. Disabled + grayed +
// pointer-events-none when the underlying field is null, so no broken
// tel:/mailto:/wa.me hrefs are ever rendered.
//
// The desktop row has no whole-row click target (Edit is a button), so
// the card body is non-clickable; Edit/View Products/Toggle Active live
// in the meatball — the exact same handlers the desktop row uses.

// Nigeria-aware WhatsApp link: digits-only; a leading 0 becomes the 234
// country code. Returns null when there's nothing dialable.
export function buildWhatsappLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("0") ? "234" + digits.slice(1) : digits;
  return `https://wa.me/${normalized}`;
}

interface AdminVendorCardProps {
  vendor: any;
  canManage?: boolean;
  onEdit: () => void;
  onViewProducts: () => void;
  onToggleActive: () => void;
}

function ContactIcon({ href, label, children, external }: { href: string | null; label: string; children: React.ReactNode; external?: boolean }) {
  if (!href) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-disabled="true"
        aria-label={`${label} unavailable`}
        className="h-9 w-9 text-muted-foreground pointer-events-none opacity-50"
      >
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="ghost" size="icon" className="h-9 w-9" onClick={(e) => e.stopPropagation()}>
      <a
        href={href}
        aria-label={label}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    </Button>
  );
}

export default function AdminVendorCard({ vendor: v, canManage = true, onEdit, onViewProducts, onToggleActive }: AdminVendorCardProps) {
  const telHref = v.phone ? `tel:${v.phone}` : null;
  const waHref = buildWhatsappLink(v.whatsapp || v.phone);
  const mailHref = v.email ? `mailto:${v.email}` : null;

  const line2 = [v.contact_person, v.location].filter(Boolean).join(" · ");

  return (
    <Card className="p-4">
      {/* Line 1 — name (left) · active/inactive badge (right) */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium truncate min-w-0">{v.name}</span>
        <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0", v.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700")}>
          {v.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Line 2 — contact person · location (omitted entirely if both null) */}
      {line2 && <p className="text-xs text-muted-foreground truncate mt-0.5">{line2}</p>}

      {/* Line 3 — payment terms (omitted if null) */}
      {v.payment_terms && <p className="text-xs text-muted-foreground truncate mt-0.5">{v.payment_terms}</p>}

      {/* Bottom row — contact icon buttons (left) · meatball (right) */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-2">
          <ContactIcon href={telHref} label={`Call ${v.name}`}><Phone className="h-4 w-4" /></ContactIcon>
          <ContactIcon href={waHref} label={`WhatsApp ${v.name}`} external><MessageCircle className="h-4 w-4" /></ContactIcon>
          <ContactIcon href={mailHref} label={`Email ${v.name}`}><Mail className="h-4 w-4" /></ContactIcon>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label="Vendor actions"
              className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted flex-shrink-0"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {canManage && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit2 className="w-4 h-4 mr-2" /> Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewProducts(); }}>
              <Eye className="w-4 h-4 mr-2" /> View Products
            </DropdownMenuItem>
            {canManage && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleActive(); }}>
                <Power className="w-4 h-4 mr-2" /> {v.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
