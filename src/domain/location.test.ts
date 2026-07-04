import { describe, expect, it } from "vitest";

import { parseCoordinates } from "./location";

describe("location input", () => {
  it("accepts latitude and longitude coordinates", () => {
    expect(parseCoordinates("52.52, 13.405")).toEqual({
      latitude: 52.52,
      longitude: 13.405,
    });
  });
});
