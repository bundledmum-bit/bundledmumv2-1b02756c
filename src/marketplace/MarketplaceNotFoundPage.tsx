import { useMarketplaceWhatsAppNumber } from "./lib/whatsapp";
import NotFoundOrGoneScreen from "./components/NotFoundOrGoneScreen";

/**
 * Catch-all for any marketplace URL that matches no route — a true 404,
 * case 3 of the four "not live" situations (see NotFoundOrGoneScreen). No
 * listing id to look up, so nothing about what the visitor wanted is known:
 * the most generic of the four, no similar items, a plain route back.
 */
export default function MarketplaceNotFoundPage() {
  const waNumber = useMarketplaceWhatsAppNumber();
  return <NotFoundOrGoneScreen c={{ kind: "wrongUrl" }} waNumber={waNumber} />;
}
