import { describe, it, expect } from "vitest";
import { listingBlockedReason, offerPriceProblem } from "./buyerActionGuards";

const negotiableNoVideo = { is_negotiable: true, has_video: false, final_price_naira: 5000 };
const firmNoVideo = { is_negotiable: false, has_video: false, final_price_naira: 5000 };
const negotiableWithVideo = { is_negotiable: true, has_video: true, final_price_naira: 5000 };

describe("listingBlockedReason", () => {
  it("lets a question through on any live listing, firm price or not", () => {
    expect(listingBlockedReason("ask", firmNoVideo)).toBeNull();
    expect(listingBlockedReason("ask", negotiableWithVideo)).toBeNull();
  });

  it("blocks an offer on a firm price, the way the function does", () => {
    expect(listingBlockedReason("offer", firmNoVideo)).toBe("The seller has set a firm price on this one.");
    expect(listingBlockedReason("offer", negotiableNoVideo)).toBeNull();
  });

  it("blocks a video request only when a video already exists", () => {
    expect(listingBlockedReason("video", negotiableWithVideo)).toBe("This one already has a video the buyer can watch.");
    expect(listingBlockedReason("video", negotiableNoVideo)).toBeNull();
  });

  it("does not let a firm price block a video request, or a video block an offer", () => {
    // The two guards are independent: crossing them would hide half the
    // listings from the wrong action.
    expect(listingBlockedReason("video", firmNoVideo)).toBeNull();
    expect(listingBlockedReason("offer", negotiableWithVideo)).toBeNull();
  });
});

describe("offerPriceProblem", () => {
  it("accepts anything strictly below the asking price", () => {
    expect(offerPriceProblem(4999, 5000)).toBeNull();
    expect(offerPriceProblem(1, 5000)).toBeNull();
  });

  it("refuses the asking price itself, not just above it", () => {
    expect(offerPriceProblem(5000, 5000)).toContain("not lower");
    expect(offerPriceProblem(5001, 5000)).toContain("not lower");
  });

  it("refuses nothing, zero and a negative", () => {
    expect(offerPriceProblem(NaN, 5000)).toBe("What price did the buyer offer?");
    expect(offerPriceProblem(0, 5000)).toBe("What price did the buyer offer?");
    expect(offerPriceProblem(-100, 5000)).toBe("What price did the buyer offer?");
  });
});
