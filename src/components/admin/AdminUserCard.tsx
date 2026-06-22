import { MoreVertical, Pencil, Power, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, ROLE_COLORS, LastLoginCell } from "@/pages/admin/AdminUsers";

// Mobile (<md) admin-user card for AdminUsers. Desktop keeps the table;
// this is the sibling card view under `md:hidden`. It consumes the SAME
// admin_users row shape the table maps over, so there is no separate
// fetch / filter.
//
// SECURITY-CRITICAL — self-action guards mirror the desktop EXACTLY,
// keyed on auth_user_id (NOT id): a user cannot Edit or Deactivate
// their own account. The desktop hides Edit for self and no-ops the
// active toggle for self; the card hides both and surfaces a disabled
// "Can't modify your own account" item so the guard is visible.
//
// The desktop row has no whole-row click target (Edit is a button), so
// the card body is non-clickable; Edit / Deactivate live in the
// meatball — the exact same handlers the desktop row uses. Role +
// active badges and the last-login renderer are reused verbatim from
// the page so they're pixel-identical. custom_permissions JSON is NOT
// surfaced here (it lives in the edit modal).

interface AdminUserCardProps {
  user: any;
  currentAuthUserId?: string | null;
  canEdit?: boolean;
  canDeactivate?: boolean;
  isSuperAdmin?: boolean;
  roles?: string[];
  onEdit: (u: any) => void;
  onToggleActive: (u: any) => void;
  onSetRole?: (u: any, role: string) => void;
}

export default function AdminUserCard({
  user: u,
  currentAuthUserId,
  canEdit = false,
  canDeactivate = false,
  isSuperAdmin = false,
  roles = [],
  onEdit,
  onToggleActive,
  onSetRole,
}: AdminUserCardProps) {
  // Self-guard — same comparison field as the desktop table.
  const isSelf = !!currentAuthUserId && u.auth_user_id === currentAuthUserId;

  const showEdit = canEdit && !isSelf;
  const showToggle = canDeactivate && !isSelf;
  // Show a disabled explanation when the viewer *would* have had an
  // action but it's their own account (mirrors the greyed desktop toggle).
  const showSelfGuard = isSelf && (canEdit || canDeactivate);
  const showMeatball = showEdit || showToggle || showSelfGuard;

  return (
    <Card className="p-4">
      {/* Top row — avatar + name / email / role · last login */}
      <div className="flex items-start gap-3">
        {u.avatar_url ? (
          <img
            src={u.avatar_url}
            alt={u.display_name || u.email}
            className="w-10 h-10 rounded-full object-cover bg-muted flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-forest/10 flex items-center justify-center text-sm font-bold text-forest flex-shrink-0">
            {(u.display_name || u.email || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{u.display_name || "—"}</p>
          <p className="text-xs text-text-light truncate">{u.email}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-1 text-xs">
            {isSuperAdmin && onSetRole ? (
              <select
                value={u.role}
                disabled={isSelf}
                onChange={e => onSetRole(u, e.target.value)}
                title={isSelf ? "You can't change your own role" : "Reassign role"}
                className="border border-input rounded-lg px-2 py-1 text-xs bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`Role for ${u.display_name || u.email}`}
              >
                {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            ) : (
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${ROLE_COLORS[u.role] || "bg-gray-100 text-gray-700"}`}>
                {ROLE_LABELS[u.role] || u.role}
              </span>
            )}
            <span className="text-text-light">·</span>
            <LastLoginCell value={u.last_login_at} />
          </div>
        </div>
      </div>

      {/* Bottom row — active/inactive badge (left) · meatball (right) */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {u.is_active ? "Active" : "Inactive"}
        </span>

        {showMeatball && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label="User actions"
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted flex-shrink-0"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {showSelfGuard ? (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <Ban className="w-4 h-4 mr-2" /> Can&rsquo;t modify your own account
                </DropdownMenuItem>
              ) : (
                <>
                  {showEdit && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(u); }}>
                      <Pencil className="w-4 h-4 mr-2" /> Edit
                    </DropdownMenuItem>
                  )}
                  {showToggle && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleActive(u); }}>
                      <Power className="w-4 h-4 mr-2" /> {u.is_active ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}
