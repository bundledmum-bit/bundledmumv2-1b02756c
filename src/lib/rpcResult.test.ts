import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { rpcAction } from "./rpcResult";

/**
 * The structural guard.
 *
 * Three separate screens have reported "that could not be saved" on a save
 * that went through, because the client decided success meant `ok === true`
 * on an RPC's returned payload. Across the whole schema, 2 of 551 functions
 * emit an `ok` key and neither is one any screen calls. The functions RAISE
 * on failure, so the absence of an error IS the success signal.
 *
 * A convention did not hold on its own three times, so this fails the build
 * instead of relying on the next person remembering.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("rpcAction", () => {
  const client = (error: { message?: string } | null, data?: unknown) => ({
    rpc: async () => ({ error, data }),
  });

  it("reports SUCCESS when the function returns no error, whatever the payload", async () => {
    // admin_add_listing_video's real shape: no `ok` anywhere.
    const res = await rpcAction(client(null, { listing_id: "abc", note: "Saved." }), "f");
    expect(res.ok).toBe(true);
  });

  it("still reports success when the payload is empty or null", async () => {
    expect((await rpcAction(client(null, null), "f")).ok).toBe(true);
    expect((await rpcAction(client(null, {}), "f")).ok).toBe(true);
  });

  it("surfaces the function's own note on success", async () => {
    const res = await rpcAction(client(null, { note: "Recorded, both were emailed." }), "f");
    expect(res.message).toBe("Recorded, both were emailed.");
  });

  it("reports FAILURE when the function raises", async () => {
    const res = await rpcAction(client({ message: "This listing already has a video" }), "f");
    expect(res.ok).toBe(false);
    expect(res.message).toBe("This listing already has a video");
  });

  it("falls back to the caller's message when the error has none", async () => {
    const res = await rpcAction(client({}), "f", undefined, "Refresh and try again.");
    expect(res.ok).toBe(false);
    expect(res.message).toBe("Refresh and try again.");
  });

  // The part that stops a fourth occurrence.
  it("no code decides RPC success from the payload's `ok` field", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      if (file.endsWith("rpcResult.ts")) continue; // the helper documents the pattern
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes(".rpc(")) return;
        // Only the window belonging to THIS call: an `.ok` read here is a
        // verdict taken from the payload. Unrelated `.ok` reads elsewhere
        // (fetch Responses, our own {ok,message} wrappers) are untouched,
        // which is why this is scoped to the call site rather than the file.
        for (let j = i; j < Math.min(i + 14, lines.length); j++) {
          const l = lines[j];
          if (l.trim().startsWith("*") || l.trim().startsWith("//")) continue;
          if (/\b(d|data|row|payload)\??\.ok\b/.test(l)) {
            offenders.push(`${file}:${j + 1}  ${l.trim()}`);
          }
        }
      });
    }
    expect(
      offenders,
      `An RPC's success is the ABSENCE OF AN ERROR, never an \`ok\` field: 2 of 551 functions emit one. Use rpcAction from src/lib/rpcResult.ts.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
