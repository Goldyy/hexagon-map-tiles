import "fake-indexeddb/auto";

import { describe, expect, it, vi } from "vitest";

import { cachedJson } from "./cache";

describe("shared-service cache", () => {
  it("reuses a fresh response instead of calling its provider again", async () => {
    const provider = vi.fn().mockResolvedValue({ buildings: 3 });

    await expect(cachedJson("test:berlin", provider, 60_000)).resolves.toEqual({ buildings: 3 });
    await expect(cachedJson("test:berlin", provider, 60_000)).resolves.toEqual({ buildings: 3 });
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
