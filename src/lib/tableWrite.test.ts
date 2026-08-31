import { describe, it, expect } from "vitest";
import { writeRows } from "./tableWrite";

const res = <T,>(data: T[] | null, error: { message?: string } | null = null) =>
  Promise.resolve({ data, error });

describe("writeRows", () => {
  it("is a success only when a row actually changed", async () => {
    expect((await writeRows(res([{ id: "a" }]))).ok).toBe(true);
    expect((await writeRows(res([{ id: "a" }]))).rows).toBe(1);
  });

  it("treats zero rows as a FAILURE, which is the whole point", async () => {
    // An RLS-refused UPDATE returns exactly this: no error, no rows.
    const r = await writeRows(res([]));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("did not save");
  });

  it("treats a null body as a failure too, not as an unknown", async () => {
    expect((await writeRows(res(null))).ok).toBe(false);
  });

  it("still surfaces a real error, and prefers its message", async () => {
    const r = await writeRows(res(null, { message: "boom" }));
    expect(r.ok).toBe(false);
    expect(r.message).toBe("boom");
  });

  it("lets a caller word the refusal for its own screen", async () => {
    const r = await writeRows(res([]), "This account cannot change settings.");
    expect(r.message).toBe("This account cannot change settings.");
  });

  it("never reports success on an error even if rows came back", async () => {
    const r = await writeRows(res([{ id: "a" }], { message: "boom" }));
    expect(r.ok).toBe(false);
  });
});
