import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/news", () => ({ liveNews: async () => [{ id: "live" }] }));

describe("GET /api/news", () => {
  it("is the live news", async () => {
    const { GET } = await import("./route");
    expect((await (await GET()).json()).items).toEqual([{ id: "live" }]);
  });
});
