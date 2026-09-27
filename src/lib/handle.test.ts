import { describe, expect, it } from "vitest";
import { handleOf } from "./handle";

describe("handleOf", () => {
  it("matches the SQL rankr_handle()", async () => {
    // select public.rankr_handle('00000000-0000-4000-8000-0000000000ff') -> anon-312b51
    expect(await handleOf("00000000-0000-4000-8000-0000000000ff")).toBe("anon-312b51");
  });
});
