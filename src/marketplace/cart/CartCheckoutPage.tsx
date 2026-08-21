import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { track } from "@/lib/metaPixel";
import { isValidNigerianPhone } from "../lib/phone";
import { cdb, formatNaira, CheckoutError } from "../checkout/orders";
import { sendMarketplaceConversionEvent } from "../lib/metaConversion";
import { summariseCart, createMarketplaceCartOrder, initializeCartPayment, type CartItemSummary, type CartOrderResult } from "./cartOrders";
import { getCartListingIds } from "./cartStore";
import MarketplaceSeo from "../components/MarketplaceSeo";

/**
 * Cart checkout (design C7). create-marketplace-cart-order creates one
 * pending order per listing sharing a cart_reference; marketplace-
 * initialize-payment (updated to accept { cart_reference } alongside its
 * original { order_id }) opens ONE Paystack transaction covering the whole
 * group. Single-item Buy now is unaffected — it still sends order_id, see
 * checkout/orders.ts. See handoff-marketplace.md §118.
 */

function friendlyCartError(code: string): string {
  switch (code) {
    case "A valid email address is required": return "Please enter a valid email address.";
    case "Please give your name so the sellers know who to send to": return "Please enter your name so the sellers know who to send to.";
    case "A valid phone number is required so the sellers can reach you": return "Please enter a valid phone number so the sellers can reach you.";
    case "Your cart contains your own listing": return "One of these is your own listing — remove it to check out the rest.";
    case "Your cart is empty": return "Your cart is empty.";
    case "Some items in your cart are no longer available": return "Some items in your cart sold while you were checking out.";
    default: return "We could not start checkout just now. Please check your details and try again.";
  }
}

export default function CartCheckoutPage() {
  const navigate = useNavigate();
  const { isLoggedIn, loading: authLoading, user } = useCustomerAuth();
  const ids = useMemo(() => getCartListingIds(), []);

  useEffect(() => {
    if (!authLoading && ids.length === 0) navigate("/cart", { replace: true });
  }, [authLoading, ids, navigate]);

  const summaryQ = useQuery({
    queryKey: ["mkt-cart-checkout-summary", ids],
    queryFn: () => summariseCart(ids),
    enabled: ids.length > 0,
  });

  const profileQ = useQuery({
    queryKey: ["mkt-buyer-profile"],
    enabled: isLoggedIn,
    staleTime: 60000,
    queryFn: async () => {
      const { data: auth } = await cdb.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return { full_name: "", phone: "" };
      const { data } = await cdb.from("customers").select("full_name, phone").eq("auth_user_id", uid).maybeSingle();
      const row = data as { full_name: string | null; phone: string | null } | null;
      return { full_name: row?.full_name ?? "", phone: row?.phone ?? "" };
    },
  });
  const profileLoaded = !isLoggedIn || profileQ.data !== undefined;
  const hasName = !!profileQ.data?.full_name?.trim();
  const hasPhone = !!profileQ.data?.phone?.trim();

  const needName = isLoggedIn ? profileLoaded && !hasName : true;
  const needPhone = isLoggedIn ? profileLoaded && !hasPhone : true;
  const needEmail = !isLoggedIn;
  const needAnyDetail = needName || needPhone || needEmail;

  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [committed, setCommitted] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameValid = nameInput.trim().length >= 2;
  const phoneValid = isValidNigerianPhone(phoneInput);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim().toLowerCase());
  const detailsValid = (!needName || nameValid) && (!needPhone || phoneValid) && (!needEmail || emailValid);
  const showDetailsForm = !authLoading && profileLoaded && needAnyDetail && !committed;
  const canCreateOrder = isLoggedIn ? profileLoaded && (!needAnyDetail || committed) : committed;

  function commitDetails() {
    setTouched(true);
    if (detailsValid) setCommitted(true);
  }

  const orderQ = useQuery({
    queryKey: ["mkt-cart-order", ids, isLoggedIn ? "auth" : "guest", committed],
    enabled: ids.length > 0 && canCreateOrder,
    retry: false,
    queryFn: async (): Promise<CartOrderResult> => {
      try {
        return await createMarketplaceCartOrder({
          listingIds: ids,
          email: isLoggedIn ? undefined : emailInput.trim().toLowerCase(),
          full_name: nameInput.trim() || undefined,
          phone: phoneInput.trim() || undefined,
        });
      } catch (e) {
        throw e instanceof CheckoutError ? e : new CheckoutError("unknown");
      }
    },
  });

  // AddToCart already fired when each item was individually added; the cart
  // reaching an actual checkout summary with the Paystack-authoritative
  // total is the point that matches the single-item flow's
  // InitiateCheckout (which likewise waits for payQ, not the pending
  // order's pre-Paystack-fee total). Fired once per visit.

  const [redirecting, setRedirecting] = useState(false);

  // Initialise the Paystack transaction for the whole cart once the pending
  // orders exist. cart_reference (not any single order id) is what makes
  // this cover every order rather than just the first.
  const payQ = useQuery({
    queryKey: ["mkt-cart-init-pay", orderQ.data?.cart_reference],
    enabled: !!orderQ.data?.cart_reference,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => initializeCartPayment({
      cartReference: orderQ.data!.cart_reference,
      callbackUrl: `${window.location.origin}/marketplace/checkout/return`,
      channel: "card",
    }),
  });
  const payCode = payQ.error instanceof CheckoutError ? payQ.error.code : payQ.error ? "unknown" : null;
  const payUnavailable = payQ.error instanceof CheckoutError ? (payQ.error as CheckoutError & { unavailable?: { id: string; title: string | null }[] }).unavailable : undefined;

  function handlePay() {
    if (!payQ.data) return;
    setRedirecting(true);
    const eventId = crypto.randomUUID();
    const email = isLoggedIn ? (user?.email ?? undefined) : (emailInput.trim() || undefined);
    track("AddPaymentInfo", { content_ids: ids, value: payQ.data.amount_naira, currency: "NGN" }, eventId);
    sendMarketplaceConversionEvent({
      event_name: "AddPaymentInfo",
      event_id: eventId,
      event_source_url: window.location.href,
      content_id: ids[0],
      value: payQ.data.amount_naira,
      email,
    });
    window.location.assign(payQ.data.authorization_url);
  }

  const initiateCheckoutFired = useRef(false);
  useEffect(() => {
    if (!payQ.data || initiateCheckoutFired.current) return;
    initiateCheckoutFired.current = true;
    const eventId = crypto.randomUUID();
    const email = isLoggedIn ? (user?.email ?? undefined) : (emailInput.trim() || undefined);
    track("InitiateCheckout", {
      content_ids: ids, content_type: "product", num_items: ids.length,
      value: payQ.data.amount_naira, currency: "NGN",
    }, eventId);
    sendMarketplaceConversionEvent({
      event_name: "InitiateCheckout",
      event_id: eventId,
      event_source_url: window.location.href,
      content_id: ids[0],
      content_type: "product",
      value: payQ.data.amount_naira,
      email,
    });
  }, [payQ.data]);

  const sellerGroups = useMemo(() => {
    const rows = (summaryQ.data ?? []).filter((r) => r.is_available);
    const bySeller = new Map<string, { name: string | null; items: CartItemSummary[]; total: number }>();
    for (const r of rows) {
      const g = bySeller.get(r.seller_id);
      if (g) { g.items.push(r); g.total += r.price; }
      else bySeller.set(r.seller_id, { name: r.seller_name, items: [r], total: r.price });
    }
    return Array.from(bySeller.values());
  }, [summaryQ.data]);

  if (authLoading || summaryQ.isLoading) return <BMLoadingAnimation />;

  return (
    <div className="mkt-cart-checkout">
      <MarketplaceSeo title="Checkout" description="Review your cart and check out." noindex />
      <div className="mkt-cart-header">
        <button className="mkt-back" onClick={() => navigate("/cart")} aria-label="Back to cart">‹</button>
        <h1>Checkout</h1>
      </div>

      <div className="mkt-cart-seller-summary">
        {sellerGroups.map((g) => (
          <div key={g.name ?? Math.random()} className="row">
            <span>{g.name || "Seller"} · {g.items.length} item{g.items.length === 1 ? "" : "s"}</span>
            <span>{formatNaira(g.total)}</span>
          </div>
        ))}
      </div>

      {showDetailsForm && (
        <div className="mkt-field" style={{ gap: 14 }}>
          {needName && (
            <div className="mkt-field">
              <span className="mkt-uplabel">Your full name</span>
              <input className={touched && !nameValid ? "mkt-input error" : "mkt-input"} value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="e.g. Amaka Okafor" />
              {touched && !nameValid && <span className="mkt-field-error">Please enter your name.</span>}
            </div>
          )}
          {needEmail && (
            <div className="mkt-field">
              <span className="mkt-uplabel">Email address</span>
              <input className={touched && !emailValid ? "mkt-input error" : "mkt-input"} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="you@example.com" type="email" />
              {touched && !emailValid && <span className="mkt-field-error">Please enter a valid email address.</span>}
            </div>
          )}
          {needPhone && (
            <div className="mkt-field">
              <span className="mkt-uplabel">Phone number</span>
              <input className={touched && !phoneValid ? "mkt-input error" : "mkt-input"} value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="0803 123 4567" />
              {touched && !phoneValid && <span className="mkt-field-error">Please enter a valid Nigerian phone number.</span>}
            </div>
          )}
          <button className="mkt-primary" onClick={commitDetails}>Continue</button>
        </div>
      )}

      {!showDetailsForm && orderQ.isError && (
        <div className="mkt-errbox">
          <span className="m">!</span>
          <span>{friendlyCartError((orderQ.error as CheckoutError)?.code)}</span>
        </div>
      )}

      {!showDetailsForm && orderQ.isLoading && <BMLoadingAnimation />}

      {!showDetailsForm && orderQ.data && (
        <>
          {payCode && payCode !== "unknown" && (
            <div className="mkt-errbox">
              <span className="m">!</span>
              <span>
                {payUnavailable && payUnavailable.length > 0
                  ? `${payUnavailable.map((u) => u.title || "An item").join(", ")} sold while you were checking out. Go back to your cart to remove ${payUnavailable.length === 1 ? "it" : "them"} and try again.`
                  : friendlyCartError(payCode)}
              </span>
            </div>
          )}

          <div className="mkt-cart-pricebreak">
            <div className="row"><span>Items, {ids.length}</span><b>{formatNaira(orderQ.data.items_total)}</b></div>
            <div className="row">
              <div className="lbl">
                <span>Service fee</span>
                <span className="sub">One fee per order today, not per item or per seller</span>
              </div>
              <b>{formatNaira(orderQ.data.service_fee_naira)}</b>
            </div>
            {payQ.data && payQ.data.fee_added_by_paystack && (
              <div className="row"><span>Paystack fee</span><b>{formatNaira(payQ.data.paystack_fee_naira)}</b></div>
            )}
            <div className="divider" />
            <div className="row total"><span>Total</span><b>{formatNaira(payQ.data ? payQ.data.amount_naira : orderQ.data.amount_naira)}</b></div>
          </div>

          <div className="mkt-cart-trust">
            <div className="head">How your money is protected</div>
            <div className="pt"><span className="ic">✓</span><span>Each seller's share is held separately, released only once you confirm that seller's item</span></div>
            {sellerGroups.length > 1 && (
              <div className="pt"><span className="ic">✓</span><span>One delivery arriving fine doesn't affect the other, each stands on its own</span></div>
            )}
          </div>

          <button className="mkt-buy" disabled={!payQ.data || redirecting} onClick={handlePay}>
            {payQ.data ? (redirecting ? "Opening Paystack..." : `Pay ${formatNaira(payQ.data.amount_naira)} with Paystack`) : "Preparing your payment..."}
          </button>
        </>
      )}
    </div>
  );
}
