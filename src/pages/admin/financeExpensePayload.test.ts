import { describe, it, expect } from "vitest";
import { buildExpensePayload, clearedAfterSave, toKoboAmount } from "./financeExpensePayload";

const nextDate = () => "2026-09-30";
const base = {
  expense_date: "2026-08-31", category_id: "cat-1", description: " Roll-up banner ",
  amount: "43000", vendor: " Printers ", notes: "",
};

describe("is_marketplace reaches the payload", () => {
  it("is true when the operator ticked it", () => {
    expect(buildExpensePayload({ ...base, is_marketplace: true }, nextDate).is_marketplace).toBe(true);
  });

  it("is false when they did not", () => {
    expect(buildExpensePayload({ ...base, is_marketplace: false }, nextDate).is_marketplace).toBe(false);
  });

  it("is false, not undefined, when the form never had the field", () => {
    // undefined would let the column fall back to its default instead of
    // recording the choice, and on an edit that would refuse to untag a row.
    const p = buildExpensePayload(base, nextDate);
    expect(p.is_marketplace).toBe(false);
    expect(p.is_marketplace).not.toBeUndefined();
  });

  it("can turn an existing tag OFF, which is the correction case", () => {
    const edited = { ...base, is_marketplace: false };
    expect(buildExpensePayload(edited, nextDate).is_marketplace).toBe(false);
  });

  it("is independent of recurrence, so a recurring expense can be marketplace too", () => {
    const p = buildExpensePayload(
      { ...base, is_marketplace: true, is_recurring: true, recurrence_unit: "monthly", recurrence_interval: 1 },
      nextDate,
    );
    expect(p.is_marketplace).toBe(true);
    expect(p.is_recurring).toBe(true);
    expect(p.recurrence_next_date).toBe("2026-09-30");
  });
});

describe("the rest of the payload is unchanged", () => {
  it("still trims, still converts to kobo, still nulls a blank vendor", () => {
    const p = buildExpensePayload({ ...base, vendor: "  " }, nextDate);
    expect(p.description).toBe("Roll-up banner");
    expect(p.amount).toBe(4300000);
    expect(p.vendor).toBeNull();
  });

  it("writes no recurrence fields when the expense is not recurring", () => {
    const p = buildExpensePayload(base, nextDate);
    expect(p.recurrence).toBeNull();
    expect(p.recurrence_unit).toBeNull();
    expect(p.recurrence_interval).toBeNull();
    expect(p.recurrence_next_date).toBeNull();
  });

  it("converts naira to kobo without floating point drift", () => {
    expect(toKoboAmount("10091")).toBe(1009100);
    expect(toKoboAmount(19000.55)).toBe(1900055);
  });
});

describe("clearing after a save", () => {
  it("clears the marketplace tag so the next expense does not inherit it", () => {
    const cleared = clearedAfterSave({ ...base, is_marketplace: true });
    expect(cleared.is_marketplace).toBe(false);
    expect(cleared.description).toBe("");
    expect(cleared.amount).toBe("");
  });

  it("keeps the date and category, which an operator logging several in a row wants", () => {
    const cleared = clearedAfterSave({ ...base, is_marketplace: true });
    expect(cleared.expense_date).toBe("2026-08-31");
    expect(cleared.category_id).toBe("cat-1");
  });
});
