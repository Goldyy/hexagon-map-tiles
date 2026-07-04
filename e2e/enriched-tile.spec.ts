import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Extends the base Overpass fixture (see generate-tile.spec.ts) with the v2
// enrichment layers: a leisure=park way and a landuse=forest way (both closed
// ways so they normalize to Green Surfaces — the forest one is large enough
// that the deterministic scatter in src/geometry/tree-scatter.ts is
// guaranteed to place at least one tree), two natural=tree nodes (mapped
// trees), a highway=footway way (Path Surface), and a railway=tram way (Rail
// Surface). All features sit well inside the default 500 m Tile Span
// (circumradius ~289 m) and are spaced apart so their footprints don't
// overlap one another.
const ENRICHED_FIXTURE = {
  version: 0.6,
  osm3s: { timestamp_osm_base: "2026-07-01T10:00:00Z" },
  elements: [
    // leisure=park, ~40m square, ~120m NW of center.
    { type: "node", id: 501, lat: 52.520898, lon: 13.40293 },
    { type: "node", id: 502, lat: 52.520898, lon: 13.403522 },
    { type: "node", id: 503, lat: 52.521258, lon: 13.403522 },
    { type: "node", id: 504, lat: 52.521258, lon: 13.40293 },
    {
      type: "way",
      id: 510,
      nodes: [501, 502, 503, 504, 501],
      tags: { leisure: "park" },
    },
    // landuse=forest, ~80m square, ~120m SE of center — big enough (with the
    // 12m scatter grid) to guarantee scattered trees.
    { type: "node", id: 601, lat: 52.518563, lon: 13.406183 },
    { type: "node", id: 602, lat: 52.518563, lon: 13.407365 },
    { type: "node", id: 603, lat: 52.519281, lon: 13.407365 },
    { type: "node", id: 604, lat: 52.519281, lon: 13.406183 },
    {
      type: "way",
      id: 610,
      nodes: [601, 602, 603, 604, 601],
      tags: { landuse: "forest" },
    },
    // natural=tree points, just NE of center.
    { type: "node", id: 701, lat: 52.52027, lon: 13.405444, tags: { natural: "tree" } },
    { type: "node", id: 702, lat: 52.52027, lon: 13.405739, tags: { natural: "tree" } },
    // highway=footway, running east-west just south of center.
    { type: "node", id: 801, lat: 52.519731, lon: 13.404113 },
    { type: "node", id: 802, lat: 52.519731, lon: 13.405887 },
    {
      type: "way",
      id: 810,
      nodes: [801, 802],
      tags: { highway: "footway" },
    },
    // railway=tram, running east-west just north of center.
    { type: "node", id: 901, lat: 52.520539, lon: 13.404113 },
    { type: "node", id: 902, lat: 52.520539, lon: 13.405887 },
    {
      type: "way",
      id: 910,
      nodes: [901, 902],
      tags: { railway: "tram" },
    },
  ],
};

test("enriched layers, themes, and layer toggles behave correctly end to end", async ({ page }) => {
  let overpassHits = 0;
  await page.route("**/api/interpreter", async (route) => {
    overpassHits += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(ENRICHED_FIXTURE),
    });
  });

  await page.goto("/");
  await page.getByLabel("Location").fill("52.5200, 13.4050");
  await page.getByRole("button", { name: "Generate tile" }).click();

  await expect(page.getByText("Tile ready")).toBeVisible();
  expect(overpassHits).toBe(1);

  // Quality summary mentions the enrichment layers with non-zero counts —
  // the [1-9]\d* anchor rejects "0 green" etc., so a regression that broke
  // enrichment classification entirely fails here. The checkbox labels
  // ("Green spaces", "Paths & rail", "Trees") never carry a leading digit,
  // so these regexes can't false-match them.
  // The same "{count} {label}" strings now render in both the rail's Tile
  // Summary and the preview legend, so scope these to the rail (the <aside>,
  // role "complementary") to keep the count assertions unambiguous.
  const summary = page.getByRole("complementary");
  await expect(summary.getByText(/[1-9]\d* green/)).toBeVisible();
  await expect(summary.getByText(/[1-9]\d* path/)).toBeVisible();
  await expect(summary.getByText(/[1-9]\d* rail/)).toBeVisible();
  await expect(summary.getByText(/[1-9]\d* trees/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download GLB" })).toBeEnabled();

  // Switching theme to Daylight is a pure presentation change: it must not
  // re-request map data and must not disable the (still valid) Download.
  await page.getByRole("button", { name: "Daylight" }).click();
  await expect(page.getByRole("button", { name: "Daylight" })).toHaveAttribute("aria-pressed", "true");
  expect(overpassHits).toBe(1);
  await expect(page.getByRole("button", { name: "Download GLB" })).toBeEnabled();
  await expect(page.getByText("Tile ready")).toBeVisible();

  // Unchecking Trees marks the current tile stale: the "Tile ready" summary and
  // the preview's Download GLB button (both gated on status === "ready") vanish
  // until the tile is regenerated (Task 8's markStale contract).
  await page.getByLabel("Trees").uncheck();
  await expect(page.getByText("Tile ready")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Download GLB" })).toHaveCount(0);

  // Regenerate with Trees off, then download.
  await page.getByRole("button", { name: "Generate tile" }).click();
  await expect(page.getByText("Tile ready")).toBeVisible();
  // Trees layer is off, so the tree scatter/mapped points must be excluded
  // from this generation — proof the toggle actually changed the output. The
  // (^|\D) anchor rejects "10 trees"/"20 trees": only a literal zero passes.
  await expect(page.getByText(/(^|\D)0 trees/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download GLB" })).toBeEnabled();

  // The share URL now reflects the disabled layer.
  await expect.poll(() => page.url()).toContain("layers=");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download GLB" }).click();
  const download = await downloadPromise;
  const contents = await readFile(await download.path());
  expect(contents.length).toBeGreaterThan(0);
  expect(contents.subarray(0, 4).toString()).toBe("glTF");

  // No app error state after the round trip.
  await expect(page.getByText(/failed/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download GLB" })).toBeEnabled();
});
