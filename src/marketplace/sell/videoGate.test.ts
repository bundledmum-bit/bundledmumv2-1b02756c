import { describe, it, expect } from "vitest";
import { videoGate } from "@/marketplace/sell/videoGate";

const CAR_SEATS = {
  video_required: true,
  video_guidance: "Pull the harness tight and release it, recline it, and show the label with the date on it.",
  video_block_reason: "Buyers cannot tell from a photo whether the harness still tightens and releases properly. On a car seat that matters more than anything, so a video is required.",
  category_name: "Car seats",
};
const CLOTHING = {
  video_required: false,
  video_guidance: "Show it from every side, and open or unfold it if it opens.",
  video_block_reason: null,
  category_name: "Baby clothing",
};
const base = { isEditMode: false, categoryId: "cat-1", hasVideo: false, skipped: false };

describe("the video gate", () => {
  it("1. Car seats, no video: blocked, with the category's own message", () => {
    const g = videoGate({ ...base, rule: CAR_SEATS });
    expect(g.decision).toBe("block");
    if (g.decision !== "block") throw new Error("unreachable");
    expect(g.reason).toBe(CAR_SEATS.video_block_reason);
    expect(g.guidance).toBe(CAR_SEATS.video_guidance);
  });

  it("2. Baby clothing, no video: allowed, no popup", () => {
    expect(videoGate({ ...base, rule: CLOTHING }).decision).toBe("allow");
  });

  it("3. switching between them flips the requirement", () => {
    expect(videoGate({ ...base, rule: CLOTHING }).decision).toBe("allow");
    expect(videoGate({ ...base, rule: CAR_SEATS }).decision).toBe("block");
    expect(videoGate({ ...base, rule: CLOTHING }).decision).toBe("allow");
  });

  it("4. taking the escape hatch allows the save", () => {
    expect(videoGate({ ...base, rule: CAR_SEATS, skipped: true }).decision).toBe("allow");
  });

  it("5. a video attached allows the save, no popup", () => {
    expect(videoGate({ ...base, rule: CAR_SEATS, hasVideo: true }).decision).toBe("allow");
  });

  // THE ACTUAL BUG
  it("does NOT silently allow while the rule is still loading", () => {
    expect(videoGate({ ...base, rule: undefined }).decision).toBe("unknown");
  });

  it("does NOT silently allow when the rule lookup failed", () => {
    expect(videoGate({ ...base, rule: null }).decision).toBe("unknown");
  });

  // The escape hatch calls setVideoSkipped(true) AND resubmits in the same
  // tick, so submit() still closes over the OLD false. Without the override
  // the gate would block again and the sheet would loop forever.
  it("the escape hatch's override wins over stale state, so the save proceeds", () => {
    const staleVideoSkipped = false; // what the closure still sees
    const skippedNow = (opts?: { skipVideoNow?: boolean }) =>
      opts?.skipVideoNow === true || staleVideoSkipped;

    // without the override, as it would have been:
    expect(videoGate({ ...base, rule: CAR_SEATS, skipped: skippedNow() }).decision).toBe("block");
    // with it, as the sheet actually calls it:
    expect(videoGate({ ...base, rule: CAR_SEATS, skipped: skippedNow({ skipVideoNow: true }) }).decision).toBe("allow");
  });

  it("never demands a video when editing, even in a required category", () => {
    expect(videoGate({ ...base, isEditMode: true, rule: CAR_SEATS }).decision).toBe("allow");
    expect(videoGate({ ...base, isEditMode: true, rule: undefined }).decision).toBe("allow");
  });
});
