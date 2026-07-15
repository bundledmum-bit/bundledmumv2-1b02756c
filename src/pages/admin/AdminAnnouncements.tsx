import AdminAnnouncementsTab from "@/components/admin/AdminAnnouncementsTab";

/**
 * Dedicated Announcements manager at /admin/announcements. The nav item
 * (nav_key "promotions", label "Announcements") resolves here. The list +
 * form + live preview live in AdminAnnouncementsTab, shared with the Content
 * page's Announcements tab so there is a single source of truth.
 */
export default function AdminAnnouncements() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="pf text-2xl font-bold">Announcements</h1>
        <p className="text-sm text-text-light mt-1">
          Bars, banners, and popups for the storefront. Target specific pages or
          everyone, schedule them, and add an optional image to popups.
        </p>
      </div>
      <AdminAnnouncementsTab />
    </div>
  );
}
