import { useNavigate } from "react-router-dom";

/**
 * Catch-all for any marketplace URL that matches no route. The most likely
 * real cause is a shared or bookmarked listing link that has since sold or
 * been taken down, so the copy stays warm rather than reading as a broken
 * page, matching ListingDetailPage's own "gone" state.
 */
export default function MarketplaceNotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="mkt-center">
      <div className="mkt-empty-title">We cannot find that page</div>
      <div className="mkt-empty-sub">
        The link may be mistyped, or the item it pointed to has sold or been taken down. There is plenty more to see.
      </div>
      <button className="mkt-buy" style={{ maxWidth: 220 }} onClick={() => navigate("/")}>
        Back to browse
      </button>
    </div>
  );
}
